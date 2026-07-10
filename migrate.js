const db = require('./config/database');

async function migrate() {
  console.log('Starting migration...');
  const addColumn = async (table, column, def) => {
    try {
      await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
      console.log(`Added column ${column} to ${table}`);
    } catch (e) {
      if (e.message.includes('duplicate column name')) {
        console.log(`Column ${column} already exists in ${table}`);
      } else {
        console.error(`Error adding column ${column}:`, e.message);
      }
    }
  };

  await addColumn('businesses', 'subcategory', 'TEXT');
  await addColumn('businesses', 'registration_type', 'TEXT');
  await addColumn('businesses', 'address', 'TEXT');
  await addColumn('businesses', 'staff_size', 'TEXT');
  await addColumn('businesses', 'gstin', 'TEXT');
  await addColumn('businesses', 'email', 'TEXT');
  await addColumn('businesses', 'mobile', 'TEXT');
  await addColumn('businesses', 'logo', 'TEXT');
  await addColumn('businesses', 'updated_at', "TEXT DEFAULT (datetime('now'))");

  console.log('Migration completed.');
  process.exit(0);
}

migrate();
