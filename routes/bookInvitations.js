const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../db');
const auth = require('../middleware/authMiddleware');
const { BookInvitation } = require('../models');

function makeToken() {
  return Math.random().toString(36).slice(2, 10);
}

function makeId() {
  return 'inv_' + Date.now() + Math.random().toString(36).slice(2, 6);
}

async function isBookAdmin(userId, bookId) {
  const { rows } = await db.query(
    'SELECT role FROM book_members WHERE book_id = $1 AND user_id = $2 LIMIT 1',
    [bookId, userId]
  );
  return rows[0]?.role === 'Book Admin';
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

// GET /api/businesses/:businessId/cashbooks/:bookId/invitations
router.get('/', auth, async (req, res) => {
  const { businessId, bookId } = req.params;
  const userId = req.user.userId;
  const owner = await ownsBook(userId, businessId, bookId);
  const admin = await isBookAdmin(userId, bookId);
  
  if (!owner && !admin) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const invitations = await BookInvitation.findByBook(bookId);
    res.json({ invitations });
  } catch (err) {
    console.error('[invitations GET]', err.message);
    res.status(500).json({ error: 'Failed to fetch invitations' });
  }
});

// POST /api/businesses/:businessId/cashbooks/:bookId/invitations
router.post('/', auth, async (req, res) => {
  const { businessId, bookId } = req.params;
  const userId = req.user.userId;
  const owner = await ownsBook(userId, businessId, bookId);
  const admin = await isBookAdmin(userId, bookId);
  
  if (!owner && !admin) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { name, mobile, email, role } = req.body;
  if (!name || !role) {
    return res.status(400).json({ error: 'name and role are required' });
  }
  
  if (!owner && role === 'Primary Admin') {
    return res.status(403).json({ error: 'Only the book owner can assign Primary Admin role' });
  }

  const id = makeId();
  const token = makeToken();
  try {
    const { rows } = await db.query(
      `INSERT INTO book_invitations (id, book_id, token, mobile, email, name, role, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending') RETURNING *`,
      [id, bookId, token, mobile || null, email || null, name, role]
    );
    res.status(201).json({ invitation: rows[0] });
  } catch (err) {
    console.error('[invitations POST]', err.message);
    res.status(500).json({ error: 'Failed to create invitation' });
  }
});

module.exports = router;
