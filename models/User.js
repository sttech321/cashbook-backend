const Model = require('./Model');

class User extends Model {
  static tableName = 'users';

  static columns = {
    id:          'TEXT PRIMARY KEY',
    name:        "TEXT NOT NULL DEFAULT ''",
    email:       'TEXT UNIQUE',
    mobile:      'TEXT UNIQUE',
    avatar:      'TEXT',
    employee_id: 'TEXT',
    is_active:   'INTEGER NOT NULL DEFAULT 1',
    created_at:  'TEXT DEFAULT (CURRENT_TIMESTAMP)',
    updated_at:  'TEXT DEFAULT (CURRENT_TIMESTAMP)',
  };

  static get indexes() {
    return [
      'CREATE INDEX IF NOT EXISTS idx_users_email  ON users(email)',
      'CREATE INDEX IF NOT EXISTS idx_users_mobile ON users(mobile)',
    ];
  }

  // Add newer columns to pre-existing tables (live DB predates `employee_id`).
  static async sync() {
    await super.sync();
    try { await User.query('ALTER TABLE users ADD COLUMN employee_id TEXT', []); }
    catch { /* column already exists — safe to ignore */ }
  }

  // ── Finders ───────────────────────────────────────────────

  static async findByEmail(email) {
    return User.findOne({ email });
  }

  static async findByMobile(mobile) {
    return User.findOne({ mobile });
  }

  // ── Find or create on login (email or mobile) ─────────────

  static async findOrCreate(key, type) {
    const col = type === 'mobile' ? 'mobile' : 'email';
    const existing = await User.findOne({ [col]: key });
    if (existing) return existing;
    return User.create({
      name:   '',
      email:  type === 'email'  ? key : null,
      mobile: type === 'mobile' ? key : null,
    });
  }

  // ── Profile update ────────────────────────────────────────

  static async updateProfile(id, fields) {
    const allowed = {};
    if (fields.name   !== undefined) allowed.name   = fields.name;
    if (fields.email  !== undefined) allowed.email  = fields.email;
    if (fields.mobile !== undefined) allowed.mobile = fields.mobile;
    if (fields.avatar !== undefined) allowed.avatar = fields.avatar;
    if (!Object.keys(allowed).length) return User.findById(id);
    allowed.updated_at = new Date().toISOString();
    return User.update(id, allowed);
  }
}

module.exports = User;
