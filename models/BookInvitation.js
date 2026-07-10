const Model = require('./Model');

class BookInvitation extends Model {
  static tableName = 'book_invitations';

  static columns = {
    id:         'TEXT PRIMARY KEY',
    book_id:    'TEXT NOT NULL REFERENCES cashbooks(id) ON DELETE CASCADE',
    token:      'TEXT UNIQUE NOT NULL',
    mobile:     'TEXT',
    email:      'TEXT',
    name:       'TEXT NOT NULL',
    role:       "TEXT NOT NULL DEFAULT 'Data Operator'",
    status:     "TEXT NOT NULL DEFAULT 'pending'", // pending, accepted, cancelled
    created_at: 'TEXT DEFAULT (CURRENT_TIMESTAMP)',
  };

  static get indexes() {
    return [
      'CREATE INDEX IF NOT EXISTS idx_book_invitations_book ON book_invitations(book_id)',
      'CREATE INDEX IF NOT EXISTS idx_book_invitations_token ON book_invitations(token)',
    ];
  }

  static async findByBook(bookId) {
    return BookInvitation.findAll({ book_id: bookId, status: 'pending' }, { orderBy: 'created_at ASC' });
  }

  static async findByToken(token) {
    return BookInvitation.findOne({ token });
  }
}

module.exports = BookInvitation;
