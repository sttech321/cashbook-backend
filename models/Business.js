const Model = require('./Model');
const db    = require('../config/database');

class Business extends Model {
  static tableName = 'businesses';

  static columns = {
    id:                'TEXT PRIMARY KEY',
    user_id:           'TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE',
    name:              'TEXT NOT NULL',
    icon:              "TEXT DEFAULT '🏢'",
    category:          'TEXT',
    subcategory:       'TEXT',
    business_type:     'TEXT',
    registration_type: 'TEXT',
    address:           'TEXT',
    staff_size:        'TEXT',
    logo:              'TEXT',
    gstin:             'TEXT',
    email:             'TEXT',
    mobile:            'TEXT',
    created_at:        'TEXT DEFAULT (CURRENT_TIMESTAMP)',
    updated_at:        'TEXT DEFAULT (CURRENT_TIMESTAMP)',
  };

  static get indexes() {
    return [
      'CREATE INDEX IF NOT EXISTS idx_businesses_user ON businesses(user_id)',
    ];
  }

  // Override sync to also add newer columns to pre-existing tables via ALTER TABLE.
  // CREATE TABLE IF NOT EXISTS never alters an existing table, so tables created
  // before these columns were introduced (e.g. the live Postgres DB) would be missing
  // them — causing errors like: column "logo" does not exist.
  static async sync() {
    await super.sync();
    const migrations = [
      `ALTER TABLE businesses ADD COLUMN subcategory TEXT`,
      `ALTER TABLE businesses ADD COLUMN registration_type TEXT`,
      `ALTER TABLE businesses ADD COLUMN address TEXT`,
      `ALTER TABLE businesses ADD COLUMN staff_size TEXT`,
      `ALTER TABLE businesses ADD COLUMN logo TEXT`,
      `ALTER TABLE businesses ADD COLUMN gstin TEXT`,
      `ALTER TABLE businesses ADD COLUMN email TEXT`,
      `ALTER TABLE businesses ADD COLUMN mobile TEXT`,
      `ALTER TABLE businesses ADD COLUMN updated_at TEXT`,
    ];
    for (const sql of migrations) {
      try { await db.query(sql); } catch { /* column already exists — safe to ignore */ }
    }
  }

  static async findByOwner(userId) {
    return Business.findAll({ user_id: userId }, { orderBy: 'created_at ASC' });
  }
}

module.exports = Business;
