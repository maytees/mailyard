package store

import (
	"context"
)

// Contact is a known correspondent, derived from synced mail — no separate
// address book to maintain.
type Contact struct {
	Email string `json:"email"`
	Name  string `json:"name"`
}

// SearchContacts suggests addresses matching query (email or name substring),
// ranked by how much the user corresponds with them: addresses the user has
// *sent to* weigh 10× a mere sender, recency breaks ties. The user's own
// account addresses are excluded.
func (s *Store) SearchContacts(ctx context.Context, query string, limit int) ([]Contact, error) {
	if query == "" {
		return []Contact{}, nil
	}
	if limit <= 0 {
		limit = 6
	}
	pattern := "%" + query + "%"

	rows, err := s.db.QueryContext(ctx, `
		WITH seen(email, name, weight, date) AS (
			-- People mail was addressed to; sent-folder rows are the user's
			-- own choices and dominate the ranking.
			SELECT lower(json_extract(j.value, '$.email')),
			       json_extract(j.value, '$.name'),
			       CASE WHEN fo.role = 'sent' THEN 10 ELSE 1 END,
			       m.date
			FROM messages m
			JOIN folders fo ON fo.id = m.folder_id
			CROSS JOIN json_each(m.to_json) j
			UNION ALL
			SELECT lower(json_extract(j.value, '$.email')),
			       json_extract(j.value, '$.name'),
			       CASE WHEN fo.role = 'sent' THEN 10 ELSE 1 END,
			       m.date
			FROM messages m
			JOIN folders fo ON fo.id = m.folder_id
			CROSS JOIN json_each(m.cc_json) j
			UNION ALL
			SELECT lower(m.from_email), m.from_name, 1, m.date
			FROM messages m
			WHERE m.from_email != ''
		)
		SELECT email, MAX(name) AS name
		FROM seen
		WHERE email IS NOT NULL AND email != ''
		  AND email NOT IN (SELECT lower(email) FROM accounts)
		  AND (email LIKE ? OR lower(name) LIKE lower(?))
		GROUP BY email
		ORDER BY SUM(weight) DESC, MAX(date) DESC
		LIMIT ?`,
		pattern, pattern, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	contacts := []Contact{}
	for rows.Next() {
		var c Contact
		if err := rows.Scan(&c.Email, &c.Name); err != nil {
			return nil, err
		}
		contacts = append(contacts, c)
	}
	return contacts, rows.Err()
}
