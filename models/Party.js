const Model = require('./Model');

class Party extends Model {
  static tableName = 'parties';

  static columns = {
    id:         'TEXT PRIMARY KEY',
    book_id:    'TEXT NOT NULL REFERENCES cashbooks(id) ON DELETE CASCADE',
    name:       'TEXT NOT NULL',
    mobile:     'TEXT',
    email:      'TEXT',
    party_type: "TEXT DEFAULT 'Customer'",
    created_at: 'TEXT DEFAULT (CURRENT_TIMESTAMP)',
  };

  static get indexes() {
    return [
      'CREATE INDEX IF NOT EXISTS idx_parties_book ON parties(book_id)',
    ];
  }

  static async sync() {
    await super.sync();
    try {
      const { rows } = await Party.query('PRAGMA table_info(parties)', []);
      const hasEmail = rows.some(r => r.name === 'email');
      if (!hasEmail) {
        await Party.query('ALTER TABLE parties ADD COLUMN email TEXT', []);
      }
    } catch {
      // PostgreSQL — ignore, column already exists or PRAGMA not supported
    }
  }

  static async findByBook(bookId) {
    return Party.findAll({ book_id: bookId }, { orderBy: 'name ASC' });
  }
}

module.exports = Party;
