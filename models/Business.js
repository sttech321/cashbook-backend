const Model = require('./Model');

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

  static async findByOwner(userId) {
    return Business.findAll({ user_id: userId }, { orderBy: 'created_at ASC' });
  }
}

module.exports = Business;
