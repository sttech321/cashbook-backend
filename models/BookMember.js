const Model = require('./Model');

class BookMember extends Model {
  static tableName = 'book_members';

  static columns = {
    id:         'TEXT PRIMARY KEY',
    book_id:    'TEXT NOT NULL REFERENCES cashbooks(id) ON DELETE CASCADE',
    user_id:    'TEXT REFERENCES users(id) ON DELETE SET NULL',
    name:       'TEXT NOT NULL',
    mobile:     'TEXT',
    email:      'TEXT',
    role:       "TEXT NOT NULL DEFAULT 'Data Operator'",
    created_at: 'TEXT DEFAULT (CURRENT_TIMESTAMP)',
  };

  static get indexes() {
    return [
      'CREATE INDEX IF NOT EXISTS idx_book_members_book ON book_members(book_id)',
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_book_members_unique ON book_members(book_id, user_id) WHERE user_id IS NOT NULL',
    ];
  }

  static async sync() {
    await super.sync();
    // Add email column if it doesn't exist (migration for existing databases)
    try {
      const { rows } = await BookMember.query('PRAGMA table_info(book_members)', []);
      const hasEmail = rows.some(r => r.name === 'email');
      if (!hasEmail) {
        await BookMember.query('ALTER TABLE book_members ADD COLUMN email TEXT', []);
      }
    } catch {
      // PostgreSQL — column already exists or PRAGMA not supported; ignore
    }
  }

  static async findByBook(bookId) {
    return BookMember.findAll({ book_id: bookId }, { orderBy: 'created_at ASC' });
  }

  /**
   * Returns all cashbooks a given user is a member of within a specific business,
   * joining with the cashbooks table to get book name.
   */
  static async findByUser(userId, businessId) {
    const { rows } = await BookMember.query(
      `SELECT bm.id, bm.book_id AS "bookId", c.name AS "bookName", bm.role, bm.created_at
       FROM book_members bm
       JOIN cashbooks c ON c.id = bm.book_id
       WHERE bm.user_id = $1 AND c.business_id = $2
       ORDER BY bm.created_at ASC`,
      [userId, businessId]
    );
    return rows;
  }
}

module.exports = BookMember;
