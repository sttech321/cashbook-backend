const Model = require('./Model');

class Role extends Model {
  static tableName = 'roles';

  static columns = {
    id:          'TEXT PRIMARY KEY',
    name:        'TEXT NOT NULL UNIQUE',
    description: 'TEXT',
    scope:       "TEXT NOT NULL DEFAULT 'business'",
    created_at:  'TEXT DEFAULT (CURRENT_TIMESTAMP)',
  };

  // Default roles seeded on first run
  static DEFAULTS = [
    { id: 'role_primary_admin',  name: 'PRIMARY_ADMIN',  description: 'Full access — owns the business',          scope: 'business' },
    { id: 'role_admin',          name: 'ADMIN',          description: 'Can manage business, cannot delete it',    scope: 'business' },
    { id: 'role_manager',        name: 'MANAGER',        description: 'Can view reports and manage transactions',  scope: 'business' },
    { id: 'role_employee',       name: 'EMPLOYEE',       description: 'Standard employee access',                 scope: 'business' },
    { id: 'role_data_operator',  name: 'DATA_OPERATOR',  description: 'Can only add entries',                     scope: 'book'     },
    { id: 'role_viewer',         name: 'VIEWER',         description: 'Read-only access',                         scope: 'book'     },
  ];

  static async seed() {
    for (const role of Role.DEFAULTS) {
      const exists = await Role.findOne({ name: role.name });
      if (!exists) await Role.create(role);
    }
    console.log('[Role] Roles seeded');
  }
}

module.exports = Role;
