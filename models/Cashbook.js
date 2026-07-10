const Model = require('./Model');

class Cashbook extends Model {
  static tableName = 'cashbooks';

  static columns = {
    id:          'TEXT PRIMARY KEY',
    business_id: 'TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE',
    name:        'TEXT NOT NULL',
    created_at:  'TEXT DEFAULT (CURRENT_TIMESTAMP)',
  };

  static get indexes() {
    return [
      'CREATE INDEX IF NOT EXISTS idx_cashbooks_business ON cashbooks(business_id)',
    ];
  }

  static async findByBusiness(businessId) {
    const { rows } = await Cashbook.query(
      `SELECT c.*, (SELECT COUNT(*) FROM transactions t WHERE t.book_id = c.id) AS transaction_count
       FROM cashbooks c
       WHERE c.business_id = $1
       ORDER BY c.created_at ASC`,
      [businessId]
    );
    return rows;
  }
}

module.exports = Cashbook;
