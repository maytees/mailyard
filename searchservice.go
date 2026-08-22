package main

import (
	"context"
	"fmt"

	"mailyard/internal/store"
)

// SearchService backs the command palette's live mail search with the FTS5
// index.
type SearchService struct {
	boot *BootService
}

func (s *SearchService) Search(ctx context.Context, query, accountID string, limit int) ([]store.Message, error) {
	st := s.boot.storeHandle()
	if st == nil {
		return nil, fmt.Errorf("database is not available: %s", s.boot.BootError())
	}
	return st.Search(ctx, query, accountID, limit)
}
