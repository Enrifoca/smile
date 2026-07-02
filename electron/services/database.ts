/**
 * Database Service
 *
 * Per-workspace SQLite database with FTS5 for messages and memory search.
 * File location: <workspace>/.smile/smile.db
 */

import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

export interface MessageRow {
  id: string
  chat_id: string
  role: string
  content: string
  timestamp: string
  type?: string | null
  metadata?: Record<string, unknown> | null
}

export interface MemoryIndexRow {
  id: string
  kind: 'user' | 'learned' | 'source'
  source_file: string
  title: string
  content: string
  updated_at: string
}

export interface SearchResult {
  id: string
  kind: string
  source_file: string
  title: string
  content: string
  updated_at: string
  rank: number
}

export interface ChatSummary {
  id: string
  title: string
  date: string
  message_count: number
  last_message_at: string
}

export class DatabaseService {
  private db: Database.Database | null = null
  private workspacePath: string | null = null

  setWorkspace(workspacePath: string): void {
    if (this.workspacePath === workspacePath && this.db) return
    this.close()
    this.workspacePath = workspacePath
    const dbDir = path.join(workspacePath, '.smile')
    fs.mkdirSync(dbDir, { recursive: true })
    const dbPath = path.join(dbDir, 'smile.db')
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.createTables()
  }

  close(): void {
    this.db?.close()
    this.db = null
  }

  private ensureDb(): Database.Database {
    if (!this.db) throw new Error('Database not initialized: call setWorkspace() first')
    return this.db
  }

  private createTables(): void {
    const db = this.ensureDb()

    db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        type TEXT,
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);

      CREATE TABLE IF NOT EXISTS memory_index (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        source_file TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_memory_source_file ON memory_index(source_file);

      CREATE TABLE IF NOT EXISTS db_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `)

    // FTS5 virtual tables for full-text search
    const fts5Available = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts'").get()
    if (!fts5Available) {
      try {
        db.exec(`
          CREATE VIRTUAL TABLE messages_fts USING fts5(
            content,
            content_rowid=rowid,
            tokenize='porter'
          );

          CREATE VIRTUAL TABLE memory_index_fts USING fts5(
            title,
            content,
            content_rowid=rowid,
            tokenize='porter'
          );
        `)
      } catch (error) {
        console.error('[Database] FTS5 not available:', error)
        throw new Error('SQLite FTS5 is required but not available. Try rebuilding better-sqlite3.')
      }
    }

    // Triggers to keep FTS indexes in sync.
    // Drop and recreate so any older, buggy definitions are replaced.
    // Note: messages_fts/memory_index_fts are content tables (not external-content
    // tables), so deletes/updates must use ordinary DELETE FROM statements. The
    // external-content 'INSERT INTO fts(fts, rowid) VALUES('delete', rowid)'
    // syntax is invalid for this configuration and raises SQL logic errors.
    const triggers = [
      {
        name: 'messages_fts_insert',
        sql: `CREATE TRIGGER messages_fts_insert AFTER INSERT ON messages BEGIN
          INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
        END;`,
      },
      {
        name: 'messages_fts_update',
        sql: `CREATE TRIGGER messages_fts_update AFTER UPDATE ON messages BEGIN
          DELETE FROM messages_fts WHERE rowid = old.rowid;
          INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
        END;`,
      },
      {
        name: 'messages_fts_delete',
        sql: `CREATE TRIGGER messages_fts_delete AFTER DELETE ON messages BEGIN
          DELETE FROM messages_fts WHERE rowid = old.rowid;
        END;`,
      },
      {
        name: 'memory_index_fts_insert',
        sql: `CREATE TRIGGER memory_index_fts_insert AFTER INSERT ON memory_index BEGIN
          INSERT INTO memory_index_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
        END;`,
      },
      {
        name: 'memory_index_fts_update',
        sql: `CREATE TRIGGER memory_index_fts_update AFTER UPDATE ON memory_index BEGIN
          DELETE FROM memory_index_fts WHERE rowid = old.rowid;
          INSERT INTO memory_index_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
        END;`,
      },
      {
        name: 'memory_index_fts_delete',
        sql: `CREATE TRIGGER memory_index_fts_delete AFTER DELETE ON memory_index BEGIN
          DELETE FROM memory_index_fts WHERE rowid = old.rowid;
        END;`,
      },
    ]

    for (const trigger of triggers) {
      db.exec(`DROP TRIGGER IF EXISTS ${trigger.name};`)
      db.exec(trigger.sql)
    }
  }

  // ==================== Meta ====================

  getMeta(key: string): string | null {
    const db = this.ensureDb()
    const row = db.prepare('SELECT value FROM db_meta WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value ?? null
  }

  setMeta(key: string, value: string): void {
    const db = this.ensureDb()
    db.prepare('INSERT OR REPLACE INTO db_meta (key, value) VALUES (?, ?)').run(key, value)
  }

  // ==================== Messages ====================

  insertMessage(message: MessageRow): void {
    const db = this.ensureDb()
    db.prepare(
      `INSERT INTO messages (id, chat_id, role, content, timestamp, type, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      message.id,
      message.chat_id,
      message.role,
      message.content,
      message.timestamp,
      message.type ?? null,
      message.metadata ? JSON.stringify(message.metadata) : null,
    )
  }

  upsertMessage(message: MessageRow): void {
    const db = this.ensureDb()
    db.prepare(
      `INSERT OR REPLACE INTO messages (id, chat_id, role, content, timestamp, type, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      message.id,
      message.chat_id,
      message.role,
      message.content,
      message.timestamp,
      message.type ?? null,
      message.metadata ? JSON.stringify(message.metadata) : null,
    )
  }

  updateMessage(messageId: string, updates: Partial<Pick<MessageRow, 'content' | 'type' | 'metadata'>>): void {
    const db = this.ensureDb()
    const sets: string[] = []
    const values: unknown[] = []
    if (updates.content !== undefined) {
      sets.push('content = ?')
      values.push(updates.content)
    }
    if (updates.type !== undefined) {
      sets.push('type = ?')
      values.push(updates.type)
    }
    if (updates.metadata !== undefined) {
      sets.push('metadata = ?')
      values.push(updates.metadata ? JSON.stringify(updates.metadata) : null)
    }
    if (sets.length === 0) return
    values.push(messageId)
    db.prepare(`UPDATE messages SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  }

  getMessagesForChat(chatId: string): MessageRow[] {
    const db = this.ensureDb()
    const rows = db.prepare(
      `SELECT id, chat_id, role, content, timestamp, type, metadata
       FROM messages
       WHERE chat_id = ?
       ORDER BY timestamp ASC`,
    ).all(chatId) as Array<{
      id: string
      chat_id: string
      role: string
      content: string
      timestamp: string
      type: string | null
      metadata: string | null
    }>
    return rows.map(r => ({
      ...r,
      type: r.type ?? undefined,
      metadata: r.metadata ? JSON.parse(r.metadata) : null,
    }))
  }

  getMessageById(messageId: string): MessageRow | null {
    const db = this.ensureDb()
    const row = db.prepare(
      `SELECT id, chat_id, role, content, timestamp, type, metadata
       FROM messages WHERE id = ?`,
    ).get(messageId) as {
      id: string
      chat_id: string
      role: string
      content: string
      timestamp: string
      type: string | null
      metadata: string | null
    } | undefined
    if (!row) return null
    return {
      ...row,
      type: row.type ?? undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    }
  }

  deleteMessagesForChat(chatId: string): { changes: number } {
    const db = this.ensureDb()
    const result = db.prepare('DELETE FROM messages WHERE chat_id = ?').run(chatId)
    return { changes: result.changes }
  }

  listRecentChats(limit = 100): ChatSummary[] {
    const db = this.ensureDb()
    return db.prepare(
      `SELECT
        chat_id AS id,
        chat_id AS title,
        MIN(timestamp) AS date,
        COUNT(*) AS message_count,
        MAX(timestamp) AS last_message_at
       FROM messages
       GROUP BY chat_id
       ORDER BY last_message_at DESC
       LIMIT ?`,
    ).all(limit) as ChatSummary[]
  }

  searchMessages(query: string, limit = 20): Array<MessageRow & { rank: number }> {
    const db = this.ensureDb()
    const rows = db.prepare(
      `SELECT m.id, m.chat_id, m.role, m.content, m.timestamp, m.type, m.metadata,
              rank
       FROM messages_fts
       JOIN messages m ON m.rowid = messages_fts.rowid
       WHERE messages_fts MATCH ?
       ORDER BY rank
       LIMIT ?`,
    ).all(query, limit) as Array<{
      id: string
      chat_id: string
      role: string
      content: string
      timestamp: string
      type: string | null
      metadata: string | null
      rank: number
    }>
    return rows.map(r => ({
      ...r,
      type: r.type ?? undefined,
      metadata: r.metadata ? JSON.parse(r.metadata) : null,
    }))
  }

  // ==================== Memory Index ====================

  clearMemoryIndex(): void {
    const db = this.ensureDb()
    db.prepare('DELETE FROM memory_index').run()
  }

  upsertMemoryIndex(rows: MemoryIndexRow[]): void {
    const db = this.ensureDb()
    if (rows.length === 0) return
    const insert = db.prepare(
      `INSERT OR REPLACE INTO memory_index (id, kind, source_file, title, content, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    const transaction = db.transaction((items: MemoryIndexRow[]) => {
      for (const item of items) {
        insert.run(item.id, item.kind, item.source_file, item.title, item.content, item.updated_at)
      }
    })
    transaction(rows)
  }

  deleteMemoryIndexBySource(sourceFile: string): void {
    const db = this.ensureDb()
    db.prepare('DELETE FROM memory_index WHERE source_file = ?').run(sourceFile)
  }

  searchMemoryIndex(query: string, kind?: string, limit = 10): SearchResult[] {
    const db = this.ensureDb()
    let sql = `SELECT m.id, m.kind, m.source_file, m.title, m.content, m.updated_at, rank
       FROM memory_index_fts
       JOIN memory_index m ON m.rowid = memory_index_fts.rowid
       WHERE memory_index_fts MATCH ?`
    const params: unknown[] = [query]
    if (kind) {
      sql += ' AND m.kind = ?'
      params.push(kind)
    }
    sql += ' ORDER BY rank LIMIT ?'
    params.push(limit)
    return db.prepare(sql).all(...params) as SearchResult[]
  }

  getAllMemoryIndex(): MemoryIndexRow[] {
    const db = this.ensureDb()
    return db.prepare(
      `SELECT id, kind, source_file, title, content, updated_at
       FROM memory_index
       ORDER BY updated_at DESC`,
    ).all() as MemoryIndexRow[]
  }

  // ==================== Maintenance ====================

  vacuum(): void {
    const db = this.ensureDb()
    db.exec('VACUUM')
  }

  getStats(): { messageCount: number; memoryCount: number } {
    const db = this.ensureDb()
    const messageCount = (db.prepare('SELECT COUNT(*) AS c FROM messages').get() as { c: number }).c
    const memoryCount = (db.prepare('SELECT COUNT(*) AS c FROM memory_index').get() as { c: number }).c
    return { messageCount, memoryCount }
  }
}

let sharedDatabaseService: DatabaseService | null = null

export function getDatabaseService(): DatabaseService {
  if (!sharedDatabaseService) {
    sharedDatabaseService = new DatabaseService()
  }
  return sharedDatabaseService
}
