// src/utils/database.js
// SQLite database via better-sqlite3 — zero external services required

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '../../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'tickets.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (
    id           TEXT PRIMARY KEY,
    guild_id     TEXT NOT NULL,
    channel_id   TEXT,
    user_id      TEXT NOT NULL,
    category     TEXT NOT NULL DEFAULT 'general',
    subject      TEXT,
    status       TEXT NOT NULL DEFAULT 'open',
    priority     TEXT NOT NULL DEFAULT 'normal',
    claimed_by   TEXT,
    created_at   INTEGER NOT NULL,
    closed_at    INTEGER,
    deleted_at   INTEGER,
    last_active  INTEGER,
    dm_mode      INTEGER NOT NULL DEFAULT 0,
    transcript   TEXT,
    close_reason TEXT,
    tags         TEXT DEFAULT '[]',
    participants TEXT DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS ticket_messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id   TEXT NOT NULL,
    author_id   TEXT NOT NULL,
    author_name TEXT,
    content     TEXT,
    is_staff    INTEGER DEFAULT 0,
    is_note     INTEGER DEFAULT 0,
    timestamp   INTEGER NOT NULL,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id)
  );

  CREATE TABLE IF NOT EXISTS ticket_panels (
    id          TEXT PRIMARY KEY,
    guild_id    TEXT NOT NULL,
    channel_id  TEXT NOT NULL,
    message_id  TEXT,
    title       TEXT,
    description TEXT,
    categories  TEXT DEFAULT '[]',
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS blacklist (
    user_id  TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    reason   TEXT,
    added_by TEXT,
    added_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, guild_id)
  );

  CREATE TABLE IF NOT EXISTS staff_stats (
    user_id         TEXT NOT NULL,
    guild_id        TEXT NOT NULL,
    tickets_closed  INTEGER DEFAULT 0,
    tickets_claimed INTEGER DEFAULT 0,
    avg_response_ms INTEGER DEFAULT 0,
    last_updated    INTEGER,
    PRIMARY KEY (user_id, guild_id)
  );

  CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id          TEXT PRIMARY KEY,
    ticket_category   TEXT,
    archive_category  TEXT,
    log_channel       TEXT,
    admin_log_channel TEXT,
    panel_channel     TEXT,
    mod_role          TEXT,
    admin_role        TEXT,
    max_per_user      INTEGER DEFAULT 3,
    auto_close_hours  INTEGER DEFAULT 48,
    auto_delete_hours INTEGER DEFAULT 72,
    dm_tickets        INTEGER DEFAULT 1,
    welcome_message   TEXT,
    close_message     TEXT,
    updated_at        INTEGER
  );

  CREATE TABLE IF NOT EXISTS canned_responses (
    id         TEXT PRIMARY KEY,
    guild_id   TEXT NOT NULL,
    name       TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_by TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tags (
    name     TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    color    TEXT DEFAULT 'blue',
    PRIMARY KEY (name, guild_id)
  );
`);

// ── Migrations ────────────────────────────────────────
// Run on every startup. Silently skips columns that already exist.
// Ensures older databases (from previous installs) get all new columns.
const MIGRATIONS = [
  `ALTER TABLE tickets ADD COLUMN subject      TEXT`,
  `ALTER TABLE tickets ADD COLUMN priority     TEXT NOT NULL DEFAULT 'normal'`,
  `ALTER TABLE tickets ADD COLUMN claimed_by   TEXT`,
  `ALTER TABLE tickets ADD COLUMN closed_at    INTEGER`,
  `ALTER TABLE tickets ADD COLUMN deleted_at   INTEGER`,
  `ALTER TABLE tickets ADD COLUMN last_active  INTEGER`,
  `ALTER TABLE tickets ADD COLUMN dm_mode      INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE tickets ADD COLUMN transcript   TEXT`,
  `ALTER TABLE tickets ADD COLUMN close_reason TEXT`,
  `ALTER TABLE tickets ADD COLUMN tags         TEXT DEFAULT '[]'`,
  `ALTER TABLE tickets ADD COLUMN participants TEXT DEFAULT '[]'`,
];

for (const sql of MIGRATIONS) {
  try { db.prepare(sql).run(); } catch (_) { /* column already exists — safe to ignore */ }
}

// ── Prepared Statements ───────────────────────────────

const Tickets = {
  create: db.prepare(`
    INSERT INTO tickets (id, guild_id, channel_id, user_id, category, subject, created_at, last_active, dm_mode, participants)
    VALUES (@id, @guildId, @channelId, @userId, @category, @subject, @createdAt, @createdAt, @dmMode, @participants)
  `),
  getById:            db.prepare(`SELECT * FROM tickets WHERE id = ?`),
  getByChannel:       db.prepare(`SELECT * FROM tickets WHERE channel_id = ? AND status != 'deleted'`),
  getByUser:          db.prepare(`SELECT * FROM tickets WHERE user_id = ? AND guild_id = ? ORDER BY created_at DESC`),
  getOpenByUser:      db.prepare(`SELECT * FROM tickets WHERE user_id = ? AND guild_id = ? AND status = 'open'`),
  getAll:             db.prepare(`SELECT * FROM tickets WHERE guild_id = ? ORDER BY created_at DESC LIMIT 50`),
  getOpen:            db.prepare(`SELECT * FROM tickets WHERE guild_id = ? AND status = 'open' ORDER BY created_at DESC`),
  updateStatus:       db.prepare(`UPDATE tickets SET status = ?, closed_at = ?, close_reason = ? WHERE id = ?`),
  updateClaimed:      db.prepare(`UPDATE tickets SET claimed_by = ? WHERE id = ?`),
  updatePriority:     db.prepare(`UPDATE tickets SET priority = ? WHERE id = ?`),
  updateChannel:      db.prepare(`UPDATE tickets SET channel_id = ? WHERE id = ?`),
  updateLastActive:   db.prepare(`UPDATE tickets SET last_active = ? WHERE id = ?`),
  saveTranscript:     db.prepare(`UPDATE tickets SET transcript = ? WHERE id = ?`),
  updateTags:         db.prepare(`UPDATE tickets SET tags = ? WHERE id = ?`),
  updateParticipants: db.prepare(`UPDATE tickets SET participants = ? WHERE id = ?`),
  countOpen:          db.prepare(`SELECT COUNT(*) as count FROM tickets WHERE guild_id = ? AND status = 'open'`),
  countTotal:         db.prepare(`SELECT COUNT(*) as count FROM tickets WHERE guild_id = ?`),
  getInactive:        db.prepare(`
    SELECT * FROM tickets
    WHERE guild_id = ? AND status = 'open' AND last_active < ? AND dm_mode = 0
  `),
};

const Messages = {
  add: db.prepare(`
    INSERT INTO ticket_messages (ticket_id, author_id, author_name, content, is_staff, is_note, timestamp)
    VALUES (@ticketId, @authorId, @authorName, @content, @isStaff, @isNote, @timestamp)
  `),
  getByTicket: db.prepare(`SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY timestamp ASC`),
};

const Blacklist = {
  add:    db.prepare(`INSERT OR REPLACE INTO blacklist VALUES (@userId, @guildId, @reason, @addedBy, @addedAt)`),
  remove: db.prepare(`DELETE FROM blacklist WHERE user_id = ? AND guild_id = ?`),
  check:  db.prepare(`SELECT * FROM blacklist WHERE user_id = ? AND guild_id = ?`),
  getAll: db.prepare(`SELECT * FROM blacklist WHERE guild_id = ?`),
};

const StaffStats = {
  upsert: db.prepare(`
    INSERT INTO staff_stats (user_id, guild_id, tickets_closed, tickets_claimed, last_updated)
    VALUES (@userId, @guildId, 0, 0, @now)
    ON CONFLICT(user_id, guild_id) DO NOTHING
  `),
  incrementClosed:  db.prepare(`UPDATE staff_stats SET tickets_closed  = tickets_closed  + 1, last_updated = ? WHERE user_id = ? AND guild_id = ?`),
  incrementClaimed: db.prepare(`UPDATE staff_stats SET tickets_claimed = tickets_claimed + 1, last_updated = ? WHERE user_id = ? AND guild_id = ?`),
  getTop: db.prepare(`SELECT * FROM staff_stats WHERE guild_id = ? ORDER BY tickets_closed DESC LIMIT 10`),
  get:    db.prepare(`SELECT * FROM staff_stats WHERE user_id = ? AND guild_id = ?`),
};

const Settings = {
  get: db.prepare(`SELECT * FROM guild_settings WHERE guild_id = ?`),
  upsert(guildId, data) {
    const existing = this.get.get(guildId);
    if (existing) {
      const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ');
      db.prepare(`UPDATE guild_settings SET ${fields}, updated_at = @updatedAt WHERE guild_id = @guildId`)
        .run({ ...data, guildId, updatedAt: Date.now() });
    } else {
      const cols = ['guild_id', ...Object.keys(data), 'updated_at'].join(', ');
      const vals = ['@guildId', ...Object.keys(data).map(k => `@${k}`), '@updatedAt'].join(', ');
      db.prepare(`INSERT INTO guild_settings (${cols}) VALUES (${vals})`)
        .run({ ...data, guildId, updatedAt: Date.now() });
    }
  },
};

const CannedResponses = {
  add:       db.prepare(`INSERT OR REPLACE INTO canned_responses VALUES (@id, @guildId, @name, @content, @createdBy, @createdAt)`),
  remove:    db.prepare(`DELETE FROM canned_responses WHERE id = ? AND guild_id = ?`),
  getAll:    db.prepare(`SELECT * FROM canned_responses WHERE guild_id = ?`),
  getByName: db.prepare(`SELECT * FROM canned_responses WHERE guild_id = ? AND name = ?`),
};

const Tags = {
  add:    db.prepare(`INSERT OR REPLACE INTO tags VALUES (@name, @guildId, @color)`),
  remove: db.prepare(`DELETE FROM tags WHERE name = ? AND guild_id = ?`),
  getAll: db.prepare(`SELECT * FROM tags WHERE guild_id = ?`),
};

module.exports = { db, Tickets, Messages, Blacklist, StaffStats, Settings, CannedResponses, Tags };
