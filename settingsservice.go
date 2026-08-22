package main

import (
	"context"
	"fmt"
	"strconv"
)

// SettingsService backs the settings dialog's Sync section. (AI settings go
// through AIService, accounts through AccountService, appearance is
// frontend-local.)
type SettingsService struct {
	boot *BootService
	sync *SyncService
}

type AppSettings struct {
	PollMinutes  int `json:"pollMinutes"`
	BackfillDays int `json:"backfillDays"`
}

func (s *SettingsService) GetAppSettings(ctx context.Context) (AppSettings, error) {
	st := s.boot.storeHandle()
	if st == nil {
		return AppSettings{}, fmt.Errorf("database is not available")
	}
	return AppSettings{
		PollMinutes:  settingInt(st, settingPollMinutes, 5),
		BackfillDays: settingInt(st, settingBackfillDays, 90),
	}, nil
}

// SetAppSettings persists the sync tunables and restarts the engine so they
// take effect immediately.
func (s *SettingsService) SetAppSettings(ctx context.Context, settings AppSettings) error {
	st := s.boot.storeHandle()
	if st == nil {
		return fmt.Errorf("database is not available")
	}
	if settings.PollMinutes <= 0 || settings.BackfillDays <= 0 {
		return fmt.Errorf("intervals must be positive")
	}
	if err := st.SettingSet(ctx, settingPollMinutes, strconv.Itoa(settings.PollMinutes)); err != nil {
		return err
	}
	if err := st.SettingSet(ctx, settingBackfillDays, strconv.Itoa(settings.BackfillDays)); err != nil {
		return err
	}
	return s.sync.Restart(ctx)
}
