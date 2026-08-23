-- Gmail-category-style labels: global across accounts, one per message.
-- Definitions feed the AI classifier prompt verbatim, so editing a label
-- retunes classification without a prompt change. 'Other' (builtin, id 5)
-- is the abstention target and cannot be deleted.
CREATE TABLE labels (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    definition TEXT NOT NULL DEFAULT '',
    color      TEXT NOT NULL DEFAULT 'slate',
    icon       TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    builtin    INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL DEFAULT 'user'
);

CREATE TABLE message_labels (
    message_id INTEGER PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
    label_id   INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    -- 'user' assignments are manual and never overwritten by the classifier.
    source     TEXT NOT NULL DEFAULT 'ai'
);
CREATE INDEX idx_message_labels_label ON message_labels(label_id);

INSERT INTO labels (id, name, definition, color, icon, sort_order, builtin) VALUES
    (1, 'Primary',     'real people writing to you (the stuff that matters)', 'blue',   'UserIcon',          0, 1),
    (2, 'Newsletters', 'content you opted into (subscriptions, digests)',     'violet', 'News01Icon',        1, 1),
    (3, 'Promotions',  'marketing, sales, offers',                            'orange', 'DiscountTag02Icon', 2, 1),
    (4, 'Updates',     'transactional: receipts, order/shipping confirmations, account and app notifications', 'teal', 'NotificationSquareIcon', 3, 1),
    (5, 'Other',       'the catch-all / low-confidence bucket',               'slate',  'FolderLibraryIcon', 4, 1);
