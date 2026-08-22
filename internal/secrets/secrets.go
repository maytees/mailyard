// Package secrets stores credentials in the OS keychain. Nothing sensitive
// ever touches the SQLite database — account rows only carry a keychain
// reference (their id).
package secrets

import "github.com/zalando/go-keyring"

// service namespaces every Mailyard entry in the keychain.
const service = "sh.mailyard"

// AIKeyName is the vault key holding the AI provider API key.
const AIKeyName = "ai-api-key"

// Vault is the credential storage interface; tests swap in an in-memory fake.
type Vault interface {
	Set(key, secret string) error
	Get(key string) (string, error)
	Delete(key string) error
}

// Keychain is the production Vault backed by the OS keychain.
type Keychain struct{}

func (Keychain) Set(key, secret string) error {
	return keyring.Set(service, key, secret)
}

func (Keychain) Get(key string) (string, error) {
	return keyring.Get(service, key)
}

func (Keychain) Delete(key string) error {
	return keyring.Delete(service, key)
}
