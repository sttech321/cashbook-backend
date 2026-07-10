const db    = require('../config/database');
const { v4: uuidv4 } = require('uuid');

/**
 * Base Model — all models extend this.
 * Provides: sync(), findById, findOne, findAll, create, update, delete, count, query
 */
class Model {
  // Subclasses must define these
  static tableName = '';
  static columns   = {};   // { colName: 'TYPE CONSTRAINTS ...' }

  // Subclasses can override for extra indexes
  static get indexes() { return []; }

  // ── DDL ────────────────────────────────────────────────────

  static _createSQL() {
    const isPostgres = db.dialect === 'postgres';
    const cols = Object.entries(this.columns)
      .map(([name, def]) => {
        if (isPostgres) {
          // SQLite uses TEXT DEFAULT (CURRENT_TIMESTAMP); PG requires explicit cast
          def = def.replace(/DEFAULT\s+\(CURRENT_TIMESTAMP\)/gi, 'DEFAULT now()::text');
        }
        return `  ${name} ${def}`;
      })
      .join(',\n');
    return `CREATE TABLE IF NOT EXISTS ${this.tableName} (\n${cols}\n)`;
  }

  static async sync() {
    await db.query(this._createSQL());
    for (const idx of this.indexes) {
      await db.query(idx);
    }
  }

  // ── Query helpers ──────────────────────────────────────────

  static async findById(id) {
    const { rows } = await db.query(
      `SELECT * FROM ${this.tableName} WHERE id = $1 LIMIT 1`, [id]
    );
    return rows[0] || null;
  }

  static async findOne(where = {}) {
    const keys = Object.keys(where);
    if (!keys.length) return null;
    const cond = keys.map((k, i) => `${k} = $${i + 1}`).join(' AND ');
    const { rows } = await db.query(
      `SELECT * FROM ${this.tableName} WHERE ${cond} LIMIT 1`,
      Object.values(where)
    );
    return rows[0] || null;
  }

  static async findAll(where = {}, { orderBy, limit } = {}) {
    const keys = Object.keys(where);
    const params = [];
    let sql = `SELECT * FROM ${this.tableName}`;
    if (keys.length) {
      const cond = keys.map((k, i) => `${k} = $${i + 1}`).join(' AND ');
      sql += ` WHERE ${cond}`;
      params.push(...Object.values(where));
    }
    if (orderBy) sql += ` ORDER BY ${orderBy}`;
    if (limit)   sql += ` LIMIT ${limit}`;
    const { rows } = await db.query(sql, params);
    return rows;
  }

  static async create(data) {
    const record = { id: uuidv4(), ...data };
    const keys   = Object.keys(record);
    const ph     = keys.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await db.query(
      `INSERT INTO ${this.tableName} (${keys.join(', ')}) VALUES (${ph}) RETURNING *`,
      Object.values(record)
    );
    return rows[0];
  }

  static async update(id, data) {
    const keys = Object.keys(data);
    if (!keys.length) return this.findById(id);
    const set = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const { rows } = await db.query(
      `UPDATE ${this.tableName} SET ${set} WHERE id = $${keys.length + 1} RETURNING *`,
      [...Object.values(data), id]
    );
    return rows[0] || null;
  }

  static async delete(id) {
    await db.query(`DELETE FROM ${this.tableName} WHERE id = $1`, [id]);
  }

  static async count(where = {}) {
    const keys   = Object.keys(where);
    const params = [];
    let sql = `SELECT COUNT(*) as cnt FROM ${this.tableName}`;
    if (keys.length) {
      const cond = keys.map((k, i) => `${k} = $${i + 1}`).join(' AND ');
      sql += ` WHERE ${cond}`;
      params.push(...Object.values(where));
    }
    const { rows } = await db.query(sql, params);
    return parseInt(rows[0]?.cnt ?? rows[0]?.count ?? 0, 10);
  }

  // Escape hatch for complex queries
  static query(sql, params) {
    return db.query(sql, params);
  }
}

module.exports = Model;
