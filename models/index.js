const Role           = require('./Role');
const User           = require('./User');
const Business       = require('./Business');
const BusinessMember = require('./BusinessMember');
const Cashbook       = require('./Cashbook');
const Transaction    = require('./Transaction');
const Party          = require('./Party');
const BookMember     = require('./BookMember');
const BookInvitation = require('./BookInvitation');

const Category       = require('./Category');
const PaymentMode    = require('./PaymentMode');

// Sync order respects foreign-key dependencies
const SYNC_ORDER = [
  Role,           // no deps
  User,           // no deps
  Business,       // → users
  BusinessMember, // → businesses, users
  Cashbook,       // → businesses
  Transaction,    // → cashbooks, users
  Party,          // → cashbooks
  BookMember,     // → cashbooks, users
  BookInvitation, // → cashbooks
  Category,       // → cashbooks
  PaymentMode,    // → cashbooks
];

async function syncAll() {
  console.log('[Models] Syncing tables...');
  for (const Model of SYNC_ORDER) {
    await Model.sync();
    console.log(`[Models]  ✓ ${Model.tableName}`);
  }
  // Seed reference data
  await Role.seed();
  console.log('[Models] All tables ready.');
}

module.exports = {
  Role,
  User,
  Business,
  BusinessMember,
  Cashbook,
  Transaction,
  Party,
  BookMember,
  BookInvitation,
  Category,
  PaymentMode,
  syncAll,
};
