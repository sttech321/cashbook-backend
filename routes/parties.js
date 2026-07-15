const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../db');
const auth = require('../middleware/authMiddleware');

function makeId() {
  return 'party_' + Date.now() + Math.random().toString(36).slice(2, 6);
}

async function ownsBook(userId, businessId, bookId) {
  const { rows } = await db.query(
    `SELECT c.id FROM cashbooks c
     JOIN businesses b ON b.id = c.business_id
     WHERE c.id = $1 AND b.user_id = $2`,
    [bookId, userId]
  );
  return rows.length > 0;
}

async function canReadBook(userId, businessId, bookId) {
  if (await ownsBook(userId, businessId, bookId)) return true;
  const { rows } = await db.query(
    'SELECT id FROM book_members WHERE book_id = $1 AND user_id = $2',
    [bookId, userId]
  );
  return rows.length > 0;
}

// GET /api/businesses/:businessId/cashbooks/:bookId/parties
router.get('/', auth, async (req, res) => {
  const { businessId, bookId } = req.params;
  if (!await canReadBook(req.user.userId, businessId, bookId))
    return res.status(403).json({ error: 'Access denied' });

  try {
    const { rows } = await db.query(
      'SELECT * FROM parties WHERE book_id = $1 ORDER BY name ASC',
      [bookId]
    );
    res.json({ parties: rows });
  } catch (err) {
    console.error('[parties GET]', err.message);
    res.status(500).json({ error: 'Failed to fetch parties' });
  }
});

// POST /api/businesses/:businessId/cashbooks/:bookId/parties
router.post('/', auth, async (req, res) => {
  const { businessId, bookId } = req.params;
  const { name, mobile, email, partyType } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Party name required' });
  if (!await ownsBook(req.user.userId, businessId, bookId))
    return res.status(403).json({ error: 'Access denied' });

  const id = makeId();
  try {
    const { rows } = await db.query(
      'INSERT INTO parties (id, book_id, name, mobile, email, party_type) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [id, bookId, name.trim(), mobile || null, email || null, partyType || 'Customer']
    );
    res.status(201).json({ party: rows[0] });
  } catch (err) {
    console.error('[parties POST]', err.message);
    res.status(500).json({ error: 'Failed to add party' });
  }
});

// DELETE /api/businesses/:businessId/cashbooks/:bookId/parties/:partyId
router.delete('/:partyId', auth, async (req, res) => {
  const { businessId, bookId, partyId } = req.params;
  if (!await ownsBook(req.user.userId, businessId, bookId))
    return res.status(403).json({ error: 'Access denied' });

  try {
    await db.query('DELETE FROM parties WHERE id = $1 AND book_id = $2', [partyId, bookId]);
    res.json({ success: true });
  } catch (err) {
    console.error('[parties DELETE]', err.message);
    res.status(500).json({ error: 'Failed to delete party' });
  }
});

module.exports = router;
