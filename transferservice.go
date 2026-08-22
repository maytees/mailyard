package main

import (
	"archive/zip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// TransferService implements the palette's Export/Import Data commands: a
// portable zip holding a consistent database snapshot plus a manifest.
// Secrets never leave the keychain — imported accounts on another machine
// prompt for their passwords again.
type TransferService struct {
	boot *BootService
	sync *SyncService
}

type transferManifest struct {
	App        string `json:"app"`
	Version    int    `json:"version"`
	ExportedAt string `json:"exportedAt"`
}

const manifestVersion = 1

// Export prompts for a destination and writes the archive. Returns the path,
// or "" when the user cancels.
func (t *TransferService) Export(ctx context.Context) (string, error) {
	st := t.boot.storeHandle()
	if st == nil {
		return "", fmt.Errorf("database is not available")
	}

	path, err := application.Get().Dialog.SaveFile().
		SetFilename(fmt.Sprintf("mailyard-%s.zip", time.Now().Format("2006-01-02"))).
		CanCreateDirectories(true).
		PromptForSingleSelection()
	if err != nil || path == "" {
		return "", err
	}

	snapshot := filepath.Join(os.TempDir(), fmt.Sprintf("mailyard-export-%d.db", time.Now().UnixNano()))
	defer os.Remove(snapshot)
	if err := st.VacuumInto(ctx, snapshot); err != nil {
		return "", fmt.Errorf("snapshot database: %w", err)
	}

	archive, err := os.Create(path)
	if err != nil {
		return "", err
	}
	defer archive.Close()
	writer := zip.NewWriter(archive)

	manifest, _ := json.MarshalIndent(transferManifest{
		App:        "mailyard",
		Version:    manifestVersion,
		ExportedAt: time.Now().Format(time.RFC3339),
	}, "", "  ")
	if err := writeZipFile(writer, "manifest.json", manifest); err != nil {
		return "", err
	}
	snapshotData, err := os.ReadFile(snapshot)
	if err != nil {
		return "", err
	}
	if err := writeZipFile(writer, "mailyard.db", snapshotData); err != nil {
		return "", err
	}
	if err := writer.Close(); err != nil {
		return "", err
	}
	return path, nil
}

// Import prompts for an archive, swaps the database in (backing up the old
// one), and restarts the sync engine. Returns "" when the user cancels.
func (t *TransferService) Import(ctx context.Context) (string, error) {
	path, err := application.Get().Dialog.OpenFile().
		CanChooseFiles(true).
		PromptForSingleSelection()
	if err != nil || path == "" {
		return "", err
	}

	reader, err := zip.OpenReader(path)
	if err != nil {
		return "", fmt.Errorf("not a Mailyard export: %w", err)
	}
	defer reader.Close()

	var manifest transferManifest
	dbTemp := ""
	for _, file := range reader.File {
		switch file.Name {
		case "manifest.json":
			data, err := readZipFile(file)
			if err != nil {
				return "", err
			}
			if err := json.Unmarshal(data, &manifest); err != nil {
				return "", fmt.Errorf("bad manifest: %w", err)
			}
		case "mailyard.db":
			data, err := readZipFile(file)
			if err != nil {
				return "", err
			}
			dbTemp = filepath.Join(os.TempDir(),
				fmt.Sprintf("mailyard-import-%d.db", time.Now().UnixNano()))
			if err := os.WriteFile(dbTemp, data, 0o600); err != nil {
				return "", err
			}
			defer os.Remove(dbTemp)
		}
	}

	if manifest.App != "mailyard" {
		return "", fmt.Errorf("this file is not a Mailyard export")
	}
	if manifest.Version > manifestVersion {
		return "", fmt.Errorf("export was made by a newer Mailyard — update the app first")
	}
	if dbTemp == "" {
		return "", fmt.Errorf("export is missing its database")
	}

	// The engine holds the store — stop it before the swap, restart after.
	t.sync.stop()
	if err := t.boot.replaceStore(dbTemp); err != nil {
		return "", err
	}
	t.sync.start()

	// Every view refetches; imported accounts without keychain entries will
	// surface sync errors until their passwords are re-entered in Settings.
	app := application.Get()
	app.Event.Emit("accounts:changed", true)
	return path, nil
}

func writeZipFile(writer *zip.Writer, name string, data []byte) error {
	entry, err := writer.Create(name)
	if err != nil {
		return err
	}
	_, err = entry.Write(data)
	return err
}

func readZipFile(file *zip.File) ([]byte, error) {
	rc, err := file.Open()
	if err != nil {
		return nil, err
	}
	defer rc.Close()
	return io.ReadAll(rc)
}
