package main

import (
	"context"
	"fmt"
	"strconv"

	"mailyard/internal/ai"
	"mailyard/internal/store"
)

// LabelService is the UI surface for category labels: CRUD, manual
// assignment, the AI batch classifier, and the auto-create toggle.
type LabelService struct {
	boot *BootService
	ai   *AIService
}

func (l *LabelService) st() (*store.Store, error) {
	st := l.boot.storeHandle()
	if st == nil {
		return nil, fmt.Errorf("database is not available: %s", l.boot.BootError())
	}
	return st, nil
}

func (l *LabelService) ListLabels(ctx context.Context) ([]store.Label, error) {
	st, err := l.st()
	if err != nil {
		return nil, err
	}
	return st.ListLabels(ctx)
}

func (l *LabelService) CreateLabel(ctx context.Context, label store.Label) (store.Label, error) {
	st, err := l.st()
	if err != nil {
		return store.Label{}, err
	}
	label.CreatedBy = "user"
	return st.CreateLabel(ctx, label)
}

func (l *LabelService) UpdateLabel(ctx context.Context, label store.Label) error {
	st, err := l.st()
	if err != nil {
		return err
	}
	return st.UpdateLabel(ctx, label)
}

func (l *LabelService) DeleteLabel(ctx context.Context, id int64) error {
	st, err := l.st()
	if err != nil {
		return err
	}
	return st.DeleteLabel(ctx, id)
}

func (l *LabelService) ReorderLabels(ctx context.Context, ids []int64) error {
	st, err := l.st()
	if err != nil {
		return err
	}
	return st.ReorderLabels(ctx, ids)
}

// SetMessageLabel is the manual override — it wins over the classifier
// permanently for that message.
func (l *LabelService) SetMessageLabel(ctx context.Context, messageID, labelID int64) error {
	st, err := l.st()
	if err != nil {
		return err
	}
	return st.SetMessageLabel(ctx, messageID, labelID, "user")
}

// LabelInbox runs one AI classification batch over unlabeled inbox mail
// and returns how many messages were labeled.
func (l *LabelService) LabelInbox(ctx context.Context) (int, error) {
	service, err := l.ai.svc()
	if err != nil {
		return 0, err
	}
	return service.LabelInbox(ctx, 25)
}

func (l *LabelService) AutoCreateEnabled(ctx context.Context) (bool, error) {
	st, err := l.st()
	if err != nil {
		return false, err
	}
	value, err := st.SettingGet(ctx, ai.SettingLabelCreate, "false")
	return value == "true", err
}

func (l *LabelService) SetAutoCreate(ctx context.Context, enabled bool) error {
	st, err := l.st()
	if err != nil {
		return err
	}
	return st.SettingSet(ctx, ai.SettingLabelCreate, strconv.FormatBool(enabled))
}
