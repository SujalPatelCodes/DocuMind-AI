/**
 * SQLite persistence for DocuMind AI.
 *
 * Uses Node's built-in `node:sqlite` (Node 22.5+ / 24+, zero dependencies) so
 * conversations, messages, each conversation's PDF and settings survive a page
 * refresh or server restart. The database file lives in
 * `dashboard/data/documind.db` and is git-ignored — everything stays on the
 * user's machine.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS conversations (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  grp        TEXT NOT NULL DEFAULT 'TODAY',
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role            TEXT NOT NULL,
  text            TEXT NOT NULL,
  time            TEXT NOT NULL DEFAULT '',
  position        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

/* One PDF per conversation (stored as a BLOB so it survives a refresh). */
CREATE TABLE IF NOT EXISTS documents (
  conversation_id TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  num_pages       INTEGER NOT NULL DEFAULT 0,
  data            BLOB NOT NULL,
  updated_at      TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages (conversation_id, position);
`;

const DEFAULT_MODEL = "llama3.2:3b";

/**
 * Open (creating if needed) the SQLite database and return a small data-access
 * object. All statements are prepared once and reused.
 */
export function createStore(dbPath, seed) {
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);

  const q = {
    countConv: db.prepare("SELECT COUNT(*) AS n FROM conversations"),
    listConv: db.prepare(
      "SELECT id, title, grp FROM conversations ORDER BY position ASC, created_at ASC",
    ),
    insertConv: db.prepare(
      "INSERT INTO conversations (id, title, grp, position, created_at) VALUES (?, ?, ?, ?, ?)",
    ),
    minConvPos: db.prepare(
      "SELECT COALESCE(MIN(position), 0) AS m FROM conversations",
    ),
    renameConv: db.prepare("UPDATE conversations SET title = ? WHERE id = ?"),
    deleteConv: db.prepare("DELETE FROM conversations WHERE id = ?"),

    listMsg: db.prepare(
      "SELECT id, conversation_id, role, text, time FROM messages ORDER BY position ASC, created_at ASC",
    ),
    insertMsg: db.prepare(
      "INSERT INTO messages (id, conversation_id, role, text, time, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ),
    countMsgInConv: db.prepare(
      "SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?",
    ),
    patchMsg: db.prepare(
      "UPDATE messages SET text = ? WHERE id = ? AND conversation_id = ?",
    ),

    listDocs: db.prepare("SELECT conversation_id, name, num_pages FROM documents"),
    getDoc: db.prepare(
      "SELECT name, num_pages, data FROM documents WHERE conversation_id = ?",
    ),
    upsertDoc: db.prepare(
      "INSERT INTO documents (conversation_id, name, num_pages, data, updated_at) " +
        "VALUES (?, ?, ?, ?, ?) " +
        "ON CONFLICT(conversation_id) DO UPDATE SET " +
        "name = excluded.name, num_pages = excluded.num_pages, " +
        "data = excluded.data, updated_at = excluded.updated_at",
    ),
    deleteDoc: db.prepare("DELETE FROM documents WHERE conversation_id = ?"),

    getSetting: db.prepare("SELECT value FROM settings WHERE key = ?"),
    setSetting: db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ),
  };

  const now = () => new Date().toISOString();

  function getSetting(key) {
    const row = q.getSetting.get(key);
    return row ? row.value : null;
  }

  function setSetting(key, value) {
    q.setSetting.run(key, value == null ? "" : String(value));
  }

  function seedIfEmpty() {
    if (q.countConv.get().n > 0) return false;
    db.exec("BEGIN");
    try {
      (seed?.conversations ?? []).forEach((c, i) => {
        q.insertConv.run(c.id, c.title, c.group ?? "TODAY", i, now());
      });
      Object.entries(seed?.messages ?? {}).forEach(([convId, list]) => {
        list.forEach((m, i) => {
          q.insertMsg.run(m.id, convId, m.role, m.text, m.time ?? "", i, now());
        });
      });
      q.setSetting.run("model", DEFAULT_MODEL);
      q.setSetting.run("activeConvId", seed?.conversations?.[0]?.id ?? "");
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
    return true;
  }

  function getState() {
    const conversations = q.listConv.all().map((r) => ({
      id: r.id,
      title: r.title,
      group: r.grp,
    }));

    const messages = {};
    for (const m of q.listMsg.all()) {
      (messages[m.conversation_id] ??= []).push({
        id: m.id,
        role: m.role,
        text: m.text,
        time: m.time,
      });
    }

    // Document metadata only (the bytes are fetched on demand, per conversation).
    const documents = {};
    for (const d of q.listDocs.all()) {
      documents[d.conversation_id] = { name: d.name, numPages: d.num_pages };
    }

    let activeConvId = getSetting("activeConvId");
    if (!activeConvId || !conversations.some((c) => c.id === activeConvId)) {
      activeConvId = conversations[0]?.id ?? null;
    }

    return {
      conversations,
      messages,
      documents,
      settings: { model: getSetting("model") ?? DEFAULT_MODEL, activeConvId },
    };
  }

  function createConversation({ id, title, group }) {
    const pos = (q.minConvPos.get().m ?? 0) - 1;
    q.insertConv.run(id, title, group ?? "TODAY", pos, now());
  }

  function renameConversation(id, title) {
    q.renameConv.run(title, id);
  }

  function deleteConversation(id) {
    q.deleteConv.run(id);
  }

  function addMessage(convId, m) {
    const pos = q.countMsgInConv.get(convId).n ?? 0;
    q.insertMsg.run(m.id, convId, m.role, m.text, m.time ?? "", pos, now());
  }

  function patchMessage(convId, id, text) {
    q.patchMsg.run(text, id, convId);
  }

  function getDocument(convId) {
    const row = q.getDoc.get(convId);
    if (!row) return null;
    return {
      name: row.name,
      numPages: row.num_pages,
      data: Buffer.from(row.data),
    };
  }

  function putDocument(convId, { name, numPages, data }) {
    q.upsertDoc.run(convId, name, numPages ?? 0, Buffer.from(data), now());
  }

  function deleteDocument(convId) {
    q.deleteDoc.run(convId);
  }

  function setSettings(patch) {
    for (const [key, value] of Object.entries(patch ?? {})) {
      if (value === undefined || value === null) continue;
      setSetting(key, value);
    }
  }

  return {
    seedIfEmpty,
    getState,
    createConversation,
    renameConversation,
    deleteConversation,
    addMessage,
    patchMessage,
    getDocument,
    putDocument,
    deleteDocument,
    setSetting,
    setSettings,
  };
}
