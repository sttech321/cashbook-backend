const db = require('./config/database');
Promise.all([
  db.query("UPDATE book_members SET invite_status = 'Accepted' WHERE invite_status = 'Pending'"), 
  db.query("UPDATE business_members SET invite_status = 'Accepted' WHERE invite_status = 'Pending'")
]).then(() => {
  console.log('Done');
  process.exit(0);
}).catch(console.error);
