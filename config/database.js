require('dotenv').config();
const path = require('path');

const DB_URL = process.env.DATABASE_URL || '';
const isPostgres = DB_URL && !DB_URL.includes('YOUR_PROJECT') && !DB_URL.includes('YOUR_PASSWORD');

let db;

if (isPostgres) {
  // ── PostgreSQL ──────────────────────────────────────────────
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: DB_URL,
    ssl: DB_URL.includes('supabase') || process.env.DATABASE_SSL === 'true'
      ? { rejectUnauthorized: false } : false,
  });
  pool.on('error', (err) => console.error('[DB] Pool error:', err.message));
  console.log('[DB] PostgreSQL:', DB_URL.split('@')[1]?.split('/')[0] || 'remote');

  db = {
    dialect: 'postgres',
    query: (sql, params) => pool.query(sql, params),
  };

} else {
  // ── SQLite (default for local dev) ─────────────────────────
  const Database = require('better-sqlite3');
  const dbPath = path.join(__dirname, '../cashbook.db');
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  console.log('[DB] SQLite:', dbPath);

  function query(text, params = []) {
    return new Promise((resolve, reject) => {
      try {
        // $1,$2 → ?
        const sql = text.replace(/\$\d+/g, '?');
        const isSelect   = /^\s*SELECT/i.test(sql);
        const isInsert   = /^\s*INSERT/i.test(sql);
        const isUpdate   = /^\s*UPDATE/i.test(sql);
        const hasReturn  = /RETURNING/i.test(sql);

        if (isSelect) {
          resolve({ rows: sqlite.prepare(sql).all(...params) });

        } else if (isInsert && hasReturn) {
          const clean = sql.replace(/\s+RETURNING\s+\*/i, '');
          sqlite.prepare(clean).run(...params);
          const table = clean.match(/INSERT INTO (\w+)/i)?.[1];
          const row = sqlite.prepare(`SELECT * FROM ${table} WHERE rowid = last_insert_rowid()`).get();
          resolve({ rows: row ? [row] : [] });

        } else if (isUpdate && hasReturn) {
          const clean = sql.replace(/\s+RETURNING\s+\*/i, '');
          const info  = sqlite.prepare(clean).run(...params);
          if (info.changes === 0) { resolve({ rows: [] }); return; }
          const table      = clean.match(/UPDATE\s+(\w+)/i)?.[1];
          const whereMatch = clean.match(/WHERE\s+([\s\S]+)$/i);
          const setCount   = (clean.match(/SET\s+([\s\S]+?)\s+WHERE/i)?.[1].match(/\?/g) || []).length;
          if (table && whereMatch) {
            const rows = sqlite.prepare(`SELECT * FROM ${table} WHERE ${whereMatch[1]}`).all(...params.slice(setCount));
            resolve({ rows });
          } else {
            resolve({ rows: [], rowCount: info.changes });
          }

        } else {
          const info = sqlite.prepare(sql).run(...params);
          resolve({ rows: [], rowCount: info.changes });
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  db = { dialect: 'sqlite', query };
}

module.exports = db;
