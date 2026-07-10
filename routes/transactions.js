const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../db');
const auth = require('../middleware/authMiddleware');

function makeId() {
  return 'txn_' + Date.now() + Math.random().toString(36).slice(2, 6);
}

async function ownsBook(userId, businessId, bookId) {
  const { rows } = await db.query(
    `SELECT c.id FROM cashbooks c
     JOIN businesses b ON b.id = c.business_id
     WHERE c.id = $1 AND c.business_id = $2 AND b.user_id = $3`,
    [bookId, businessId, userId]
  );
  return rows.length > 0;
}

// Returns the user's book_member role, or null if not a member / is owner
async function getBookMemberRole(userId, businessId, bookId) {
  const { rows } = await db.query(
    `SELECT bm.role FROM book_members bm
     JOIN cashbooks c ON c.id = bm.book_id
     WHERE bm.book_id = $1 AND bm.user_id = $2 AND c.business_id = $3
     LIMIT 1`,
    [bookId, userId, businessId]
  );
  return rows[0]?.role || null;
}

// Can read: owner OR any book_member
async function canReadBook(userId, businessId, bookId) {
  if (await ownsBook(userId, businessId, bookId)) return true;
  const role = await getBookMemberRole(userId, businessId, bookId);
  return role !== null;
}

// Can write (add/edit/delete): owner OR book_member with Data Operator or Book Admin
async function canWriteBook(userId, businessId, bookId) {
  if (await ownsBook(userId, businessId, bookId)) return true;
  const role = await getBookMemberRole(userId, businessId, bookId);
  return role === 'Data Operator' || role === 'Book Admin';
}

// GET /api/businesses/:businessId/cashbooks/:bookId/transactions
router.get('/', auth, async (req, res) => {
  const { businessId, bookId } = req.params;
  const userId = req.user.userId;

  let myRole;
  if (await ownsBook(userId, businessId, bookId)) {
    myRole = 'Primary Admin';
  } else {
    myRole = await getBookMemberRole(userId, businessId, bookId);
  }
  if (!myRole) return res.status(403).json({ error: 'Access denied' });

  try {
    const { rows } = await db.query(
      `SELECT t.*, u.name AS created_by_name
       FROM transactions t
       LEFT JOIN users u ON u.id = t.created_by
       WHERE t.book_id = $1
       ORDER BY t.date DESC, t.created_at DESC`,
      [bookId]
    );
    res.json({ transactions: rows, my_role: myRole });
  } catch (err) {
    console.error('[transactions GET]', err.message);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// POST /api/businesses/:businessId/cashbooks/:bookId/transactions
router.post('/', auth, async (req, res) => {
  const { businessId, bookId } = req.params;
  const { type, amount, date, party, remarks, category, payment_mode } = req.body;
  const userId = req.user.userId;

  if (!type || !amount || !date)
    return res.status(400).json({ error: 'type, amount, date required' });
  if (!['IN', 'OUT'].includes(type))
    return res.status(400).json({ error: 'type must be IN or OUT' });
  if (!await canWriteBook(userId, businessId, bookId))
    return res.status(403).json({ error: 'Access denied' });

  const id = makeId();
  try {
    const { rows } = await db.query(
      `INSERT INTO transactions (id, book_id, type, amount, date, party, remarks, category, payment_mode, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [id, bookId, type, parseFloat(amount), date, party || null, remarks || null, category || null, payment_mode || null, userId]
    );
    // Return with creator name for immediate display
    const txn = rows[0];
    const userRow = await db.query('SELECT name FROM users WHERE id = $1', [userId]);
    res.status(201).json({ transaction: { ...txn, created_by_name: userRow.rows[0]?.name || null } });
  } catch (err) {
    console.error('[transactions POST]', err.message);
    res.status(500).json({ error: 'Failed to add transaction' });
  }
});

// PATCH /api/businesses/:businessId/cashbooks/:bookId/transactions/:txnId
router.patch('/:txnId', auth, async (req, res) => {
  const { businessId, bookId, txnId } = req.params;
  const userId = req.user.userId;

  if (!await canWriteBook(userId, businessId, bookId))
    return res.status(403).json({ error: 'Access denied' });

  const { type, amount, date, party, remarks, category, payment_mode } = req.body;
  if (!type || !amount || !date)
    return res.status(400).json({ error: 'type, amount, date required' });

  try {
    const { rows } = await db.query(
      `UPDATE transactions SET type=$1, amount=$2, date=$3, party=$4, remarks=$5, category=$6, payment_mode=$7
       WHERE id=$8 AND book_id=$9 RETURNING *`,
      [type, parseFloat(amount), date, party || null, remarks || null, category || null, payment_mode || null, txnId, bookId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Transaction not found' });
    res.json({ transaction: rows[0] });
  } catch (err) {
    console.error('[transactions PATCH]', err.message);
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

// DELETE /api/businesses/:businessId/cashbooks/:bookId/transactions/:txnId
router.delete('/:txnId', auth, async (req, res) => {
  const { businessId, bookId, txnId } = req.params;
  if (!await canWriteBook(req.user.userId, businessId, bookId))
    return res.status(403).json({ error: 'Access denied' });

  try {
    await db.query('DELETE FROM transactions WHERE id = $1 AND book_id = $2', [txnId, bookId]);
    res.json({ success: true });
  } catch (err) {
    console.error('[transactions DELETE]', err.message);
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

module.exports = router;
