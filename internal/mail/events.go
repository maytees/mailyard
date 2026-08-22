package mail

// Emitter decouples the engine from the Wails event bus so tests can capture
// emissions.
type Emitter interface {
	Emit(name string, data any)
}

// MailChanged fires after a folder's local mail changed; the frontend
// refetches the affected views.
type MailChanged struct {
	AccountID  string `json:"accountId"`
	FolderRole string `json:"folderRole"`
}

// SyncStatus reports per-account engine state: "syncing", "idle" or "error".
type SyncStatus struct {
	AccountID string `json:"accountId"`
	State     string `json:"state"`
	Error     string `json:"error"`
}

type nopEmitter struct{}

func (nopEmitter) Emit(string, any) {}
