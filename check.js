const db = require('better-sqlite3')('cashbook.db');
const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='businesses'").get();
console.log(row.sql);
