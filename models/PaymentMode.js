const Model = require('./Model');

class PaymentMode extends Model {
  static tableName = 'payment_modes';

  static columns = {
    id:         'TEXT PRIMARY KEY',
    book_id:    'TEXT NOT NULL REFERENCES cashbooks(id) ON DELETE CASCADE',
    name:       'TEXT NOT NULL',
    created_at: 'TEXT DEFAULT (CURRENT_TIMESTAMP)',
  };

  static get indexes() {
    return [
      'CREATE INDEX IF NOT EXISTS idx_payment_modes_book ON payment_modes(book_id)',
    ];
  }

  static async findByBook(bookId) {
    return PaymentMode.findAll({ book_id: bookId }, { orderBy: 'created_at ASC' });
  }
}

module.exports = PaymentMode;
