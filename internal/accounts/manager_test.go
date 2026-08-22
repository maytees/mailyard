package accounts

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"testing"

	"mailyard/internal/store"
)

type fakeVault struct {
	entries map[string]string
	failSet bool
}

func (v *fakeVault) Set(key, secret string) error {
	if v.failSet {
		return errors.New("keychain unavailable")
	}
	v.entries[key] = secret
	return nil
}

func (v *fakeVault) Get(key string) (string, error) {
	secret, ok := v.entries[key]
	if !ok {
		return "", errors.New("not found")
	}
	return secret, nil
}

func (v *fakeVault) Delete(key string) error {
	delete(v.entries, key)
	return nil
}

func testManager(t *testing.T, verify VerifyFunc) (*Manager, *fakeVault) {
	t.Helper()
	s, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	vault := &fakeVault{entries: map[string]string{}}
	return &Manager{Store: s, Vault: vault, Verify: verify}, vault
}

func okVerify(context.Context, string, int, string, string) error { return nil }

func validInput() AddInput {
	return AddInput{
		Email: "Ann@Example.com", Password: "hunter2", Color: "blue",
		IMAPHost: "imap.example.com", IMAPPort: 993,
		SMTPHost: "smtp.example.com", SMTPPort: 587,
	}
}

func TestAddStoresAccountAndPassword(t *testing.T) {
	m, vault := testManager(t, okVerify)
	ctx := context.Background()

	account, err := m.Add(ctx, validInput())
	if err != nil {
		t.Fatalf("add: %v", err)
	}
	if account.Email != "ann@example.com" {
		t.Fatalf("email not normalized: %q", account.Email)
	}
	if account.Username != "ann@example.com" || account.DisplayName != "ann@example.com" {
		t.Fatalf("defaults not applied: %+v", account)
	}
	if secret, _ := vault.Get(account.ID); secret != "hunter2" {
		t.Fatalf("password not in vault: %q", secret)
	}
	if got, err := m.Password(account.ID); err != nil || got != "hunter2" {
		t.Fatalf("password lookup: %q err=%v", got, err)
	}

	listed, err := m.Store.ListAccounts(ctx)
	if err != nil || len(listed) != 1 {
		t.Fatalf("account not persisted: %+v err=%v", listed, err)
	}
}

func TestAddRejectsBadInputWithoutVerifying(t *testing.T) {
	verifyCalled := false
	m, _ := testManager(t, func(context.Context, string, int, string, string) error {
		verifyCalled = true
		return nil
	})

	bad := validInput()
	bad.Email = "not-an-email"
	if _, err := m.Add(context.Background(), bad); err == nil {
		t.Fatal("want validation error")
	}
	if verifyCalled {
		t.Fatal("verify must not run on invalid input")
	}
}

func TestAddSurfacesVerifyFailure(t *testing.T) {
	m, vault := testManager(t, func(context.Context, string, int, string, string) error {
		return fmt.Errorf("login rejected")
	})
	if _, err := m.Add(context.Background(), validInput()); err == nil {
		t.Fatal("want verify error")
	}
	if len(vault.entries) != 0 {
		t.Fatal("nothing may persist when verification fails")
	}
}

func TestAddRollsBackVaultOnStoreFailure(t *testing.T) {
	m, vault := testManager(t, okVerify)
	ctx := context.Background()

	// Same email twice violates the accounts.email UNIQUE constraint.
	if _, err := m.Add(ctx, validInput()); err != nil {
		t.Fatalf("first add: %v", err)
	}
	if _, err := m.Add(ctx, validInput()); err == nil {
		t.Fatal("duplicate email must fail")
	}
	if len(vault.entries) != 1 {
		t.Fatalf("orphaned vault entry after failed add: %d entries", len(vault.entries))
	}
}

func TestUpdateKeepsPasswordWhenBlank(t *testing.T) {
	verifyCount := 0
	m, vault := testManager(t, func(context.Context, string, int, string, string) error {
		verifyCount++
		return nil
	})
	ctx := context.Background()
	account, _ := m.Add(ctx, validInput())

	updated, err := m.Update(ctx, UpdateInput{ID: account.ID, DisplayName: "Ann", Color: "rose"})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if updated.DisplayName != "Ann" || updated.Color != "rose" {
		t.Fatalf("update not applied: %+v", updated)
	}
	if verifyCount != 1 {
		t.Fatalf("blank password must not re-verify (verify ran %d times)", verifyCount)
	}
	if secret, _ := vault.Get(account.ID); secret != "hunter2" {
		t.Fatal("password changed unexpectedly")
	}

	if _, err := m.Update(ctx, UpdateInput{ID: account.ID, Password: "newpass"}); err != nil {
		t.Fatalf("password update: %v", err)
	}
	if verifyCount != 2 {
		t.Fatal("new password must be verified")
	}
	if secret, _ := vault.Get(account.ID); secret != "newpass" {
		t.Fatal("password not rotated")
	}
}

func TestRemoveDeletesAccountAndCredential(t *testing.T) {
	m, vault := testManager(t, okVerify)
	ctx := context.Background()
	account, _ := m.Add(ctx, validInput())

	if err := m.Remove(ctx, account.ID); err != nil {
		t.Fatalf("remove: %v", err)
	}
	if listed, _ := m.Store.ListAccounts(ctx); len(listed) != 0 {
		t.Fatal("account row survived remove")
	}
	if len(vault.entries) != 0 {
		t.Fatal("credential survived remove")
	}
}
