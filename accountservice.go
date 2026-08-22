package main

import (
	"context"
	"fmt"

	"github.com/wailsapp/wails/v3/pkg/application"

	"mailyard/internal/accounts"
	"mailyard/internal/mail"
	"mailyard/internal/secrets"
	"mailyard/internal/store"
)

// AccountService exposes account management to the frontend. The heavy
// lifting lives in internal/accounts; this layer adds the store handle and
// broadcasts "accounts:changed" so every window refreshes its rail.
type AccountService struct {
	boot *BootService
}

func (a *AccountService) manager() (*accounts.Manager, error) {
	st := a.boot.storeHandle()
	if st == nil {
		return nil, fmt.Errorf("database is not available: %s", a.boot.BootError())
	}
	return &accounts.Manager{
		Store:  st,
		Vault:  secrets.Keychain{},
		Verify: mail.VerifyIMAPLogin,
	}, nil
}

func (a *AccountService) ListAccounts(ctx context.Context) ([]store.Account, error) {
	m, err := a.manager()
	if err != nil {
		return nil, err
	}
	return m.Store.ListAccounts(ctx)
}

func (a *AccountService) AddAccount(ctx context.Context, input accounts.AddInput) (store.Account, error) {
	m, err := a.manager()
	if err != nil {
		return store.Account{}, err
	}
	account, err := m.Add(ctx, input)
	if err != nil {
		return store.Account{}, err
	}
	application.Get().Event.Emit("accounts:changed", true)
	return account, nil
}

func (a *AccountService) UpdateAccount(ctx context.Context, input accounts.UpdateInput) (store.Account, error) {
	m, err := a.manager()
	if err != nil {
		return store.Account{}, err
	}
	account, err := m.Update(ctx, input)
	if err != nil {
		return store.Account{}, err
	}
	application.Get().Event.Emit("accounts:changed", true)
	return account, nil
}

func (a *AccountService) RemoveAccount(ctx context.Context, id string) error {
	m, err := a.manager()
	if err != nil {
		return err
	}
	if err := m.Remove(ctx, id); err != nil {
		return err
	}
	application.Get().Event.Emit("accounts:changed", true)
	return nil
}
