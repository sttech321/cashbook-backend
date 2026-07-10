const Model = require('./Model');
const db    = require('../config/database');

class BusinessMember extends Model {
  static tableName = 'business_members';

  static columns = {
    id:            'TEXT PRIMARY KEY',
    business_id:   'TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE',
    user_id:       'TEXT REFERENCES users(id) ON DELETE SET NULL',
    name:          'TEXT NOT NULL',
    mobile:        'TEXT',
    email:         'TEXT',
    employee_id:   'TEXT',
    reports_to:    'TEXT REFERENCES users(id) ON DELETE SET NULL',
    role:          "TEXT NOT NULL DEFAULT 'Employee'",
    invite_status: "TEXT NOT NULL DEFAULT 'Pending'",
    invited_by:    'TEXT REFERENCES users(id) ON DELETE SET NULL',
    created_at:    'TEXT DEFAULT (CURRENT_TIMESTAMP)',
  };

  // Override sync to also add new columns to existing tables via ALTER TABLE
  static async sync() {
    await super.sync();
    const migrations = [
      `ALTER TABLE business_members ADD COLUMN employee_id TEXT`,
      `ALTER TABLE business_members ADD COLUMN reports_to TEXT REFERENCES users(id) ON DELETE SET NULL`,
    ];
    for (const sql of migrations) {
      try { await db.query(sql); } catch { /* column already exists — safe to ignore */ }
    }
  }

  static get indexes() {
    return [
      'CREATE INDEX IF NOT EXISTS idx_bm_business ON business_members(business_id)',
      'CREATE INDEX IF NOT EXISTS idx_bm_user     ON business_members(user_id)',
    ];
  }

  // ── Helpers ───────────────────────────────────────────────

  static async findByBusiness(businessId) {
    return BusinessMember.findAll({ business_id: businessId }, { orderBy: 'created_at ASC' });
  }

  static async findByUser(userId) {
    return BusinessMember.findAll({ user_id: userId });
  }

  static async accept(id) {
    return BusinessMember.update(id, { invite_status: 'Accepted' });
  }

  static async revoke(id) {
    return BusinessMember.update(id, { invite_status: 'Revoked' });
  }
}

module.exports = BusinessMember;
