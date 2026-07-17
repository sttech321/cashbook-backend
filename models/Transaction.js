const Model = require('./Model');

class Transaction extends Model {
  static tableName = 'transactions';

  static columns = {
    id: 'TEXT PRIMARY KEY',
    book_id: 'TEXT NOT NULL REFERENCES cashbooks(id) ON DELETE CASCADE',
    type: "TEXT NOT NULL CHECK (type IN ('IN','OUT'))",
    amount: 'REAL NOT NULL',
    date: 'TEXT NOT NULL',
    party: 'TEXT',
    remarks: 'TEXT',
    category: 'TEXT',
    payment_mode: 'TEXT',
    attachments: 'TEXT',   // JSON array of uploaded bill URLs
    custom_fields: 'TEXT', // JSON object of custom field values keyed by field name
    created_by: 'TEXT REFERENCES users(id) ON DELETE SET NULL',
    created_at: 'TEXT DEFAULT (CURRENT_TIMESTAMP)',
  };

  static get indexes() {
    return [
      'CREATE INDEX IF NOT EXISTS idx_txn_book ON transactions(book_id)',
      'CREATE INDEX IF NOT EXISTS idx_txn_date ON transactions(date)',
    ];
  }

  // Add newer columns to pre-existing tables.
  static async sync() {
    await super.sync();
    try { await Transaction.query('ALTER TABLE transactions ADD COLUMN attachments TEXT', []); }
    catch { /* already exists */ }
    try { await Transaction.query('ALTER TABLE transactions ADD COLUMN custom_fields TEXT', []); }
    catch { /* already exists */ }
  }

  static async findByBook(bookId) {
    return Transaction.findAll({ book_id: bookId }, { orderBy: 'date DESC, created_at DESC' });
  }

  // Returns { totalIn, totalOut, balance }
  static async getBalance(bookId) {
    const { rows } = await Transaction.query(
      `SELECT
         SUM(CASE WHEN type = 'IN'  THEN amount ELSE 0 END) AS total_in,
         SUM(CASE WHEN type = 'OUT' THEN amount ELSE 0 END) AS total_out
       FROM transactions WHERE book_id = $1`,
      [bookId]
    );
    const totalIn = parseFloat(rows[0]?.total_in || 0);
    const totalOut = parseFloat(rows[0]?.total_out || 0);
    return { totalIn, totalOut, balance: totalIn - totalOut };
  }
}

module.exports = Transaction;
