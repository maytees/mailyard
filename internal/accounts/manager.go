// Package accounts implements account lifecycle: validate credentials against
// the real IMAP server, persist the account row, and keep the password in the
// OS keychain (keyed by account id).
package accounts

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"mailyard/internal/secrets"
	"mailyard/internal/store"
)

// VerifyFunc checks an IMAP login; swapped for a fake in tests.
type VerifyFunc func(ctx context.Context, host string, port int, username, password string) error

type Manager struct {
	Store  *store.Store
	Vault  secrets.Vault
	Verify VerifyFunc
}

// AddInput carries everything the add-mailbox dialog collects. Username
// defaults to Email when empty.
type AddInput struct {
	DisplayName string `json:"displayName"`
	Email       string `json:"email"`
	Color       string `json:"color"`
	Icon        string `json:"icon"`
	IMAPHost    string `json:"imapHost"`
	IMAPPort    int    `json:"imapPort"`
	SMTPHost    string `json:"smtpHost"`
	SMTPPort    int    `json:"smtpPort"`
	Username    string `json:"username"`
	Password    string `json:"password"`
}

// UpdateInput edits the user-tweakable fields; empty Password keeps the
// existing credential.
type UpdateInput struct {
	ID          string `json:"id"`
	DisplayName string `json:"displayName"`
	Color       string `json:"color"`
	Icon        string `json:"icon"`
	Password    string `json:"password"`
}

func (in *AddInput) normalize() error {
	in.Email = strings.TrimSpace(strings.ToLower(in.Email))
	in.DisplayName = strings.TrimSpace(in.DisplayName)
	if in.Username == "" {
		in.Username = in.Email
	}
	if in.DisplayName == "" {
		in.DisplayName = in.Email
	}
	switch {
	case in.Email == "" || !strings.Contains(in.Email, "@"):
		return fmt.Errorf("enter a valid email address")
	case in.Password == "":
		return fmt.Errorf("enter the account password")
	case in.IMAPHost == "" || in.IMAPPort == 0:
		return fmt.Errorf("enter the IMAP server and port")
	case in.SMTPHost == "" || in.SMTPPort == 0:
		return fmt.Errorf("enter the SMTP server and port")
	}
	return nil
}

// Add verifies the credentials against the IMAP server, then persists the
// account and stores its password in the keychain.
func (m *Manager) Add(ctx context.Context, in AddInput) (store.Account, error) {
	if err := in.normalize(); err != nil {
		return store.Account{}, err
	}

	verifyCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	if err := m.Verify(verifyCtx, in.IMAPHost, in.IMAPPort, in.Username, in.Password); err != nil {
		return store.Account{}, err
	}

	account := store.Account{
		ID:          newID(),
		Email:       in.Email,
		DisplayName: in.DisplayName,
		Color:       in.Color,
		Icon:        in.Icon,
		IMAPHost:    in.IMAPHost,
		IMAPPort:    in.IMAPPort,
		SMTPHost:    in.SMTPHost,
		SMTPPort:    in.SMTPPort,
		Username:    in.Username,
		AuthKind:    "password",
		CreatedAt:   time.Now().Unix(),
	}
	if account.Color == "" {
		account.Color = "violet"
	}

	// Keychain first: a DB row without a credential is a broken account,
	// a stray keychain entry is harmless.
	if err := m.Vault.Set(account.ID, in.Password); err != nil {
		return store.Account{}, fmt.Errorf("store password in keychain: %w", err)
	}
	if err := m.Store.UpsertAccount(ctx, account); err != nil {
		m.Vault.Delete(account.ID)
		return store.Account{}, err
	}
	return account, nil
}

func (m *Manager) Update(ctx context.Context, in UpdateInput) (store.Account, error) {
	account, err := m.Store.GetAccount(ctx, in.ID)
	if err != nil {
		return store.Account{}, err
	}
	if name := strings.TrimSpace(in.DisplayName); name != "" {
		account.DisplayName = name
	}
	if in.Color != "" {
		account.Color = in.Color
	}
	if in.Icon != "" {
		account.Icon = in.Icon
	}
	if in.Password != "" {
		verifyCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
		defer cancel()
		if err := m.Verify(verifyCtx, account.IMAPHost, account.IMAPPort, account.Username, in.Password); err != nil {
			return store.Account{}, err
		}
		if err := m.Vault.Set(account.ID, in.Password); err != nil {
			return store.Account{}, fmt.Errorf("update password in keychain: %w", err)
		}
	}
	if err := m.Store.UpsertAccount(ctx, account); err != nil {
		return store.Account{}, err
	}
	return account, nil
}

// Remove deletes the account, all of its local mail, and its credential.
func (m *Manager) Remove(ctx context.Context, id string) error {
	if err := m.Store.DeleteAccount(ctx, id); err != nil {
		return err
	}
	// Credential cleanup is best-effort; the account is already gone.
	m.Vault.Delete(id)
	return nil
}

// Password returns an account's credential for the sync engine / sender.
func (m *Manager) Password(id string) (string, error) {
	secret, err := m.Vault.Get(id)
	if err != nil {
		return "", fmt.Errorf("read password from keychain: %w", err)
	}
	return secret, nil
}

func newID() string {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		panic(err) // crypto/rand only fails when the OS is broken
	}
	return hex.EncodeToString(buf)
}
