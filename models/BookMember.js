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
    invite_status: "TEXT NOT NULL DEFAULT 'Pending'",
    invited_by:    'TEXT REFERENCES users(id) ON DELETE SET NULL',
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
    
    // Add columns if they don't exist (migration for existing databases)
    const migrations = [
      `ALTER TABLE book_members ADD COLUMN email TEXT`,
      `ALTER TABLE book_members ADD COLUMN invite_status TEXT NOT NULL DEFAULT 'Pending'`,
      `ALTER TABLE book_members ADD COLUMN invited_by TEXT REFERENCES users(id) ON DELETE SET NULL`
    ];
    for (const sql of migrations) {
      try {
        await BookMember.query(sql, []);
      } catch (err) {
        // column already exists — safe to ignore
      }
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
