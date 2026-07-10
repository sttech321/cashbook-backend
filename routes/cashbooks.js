const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../db');
const auth = require('../middleware/authMiddleware');

function makeId() {
  return 'book_' + Date.now() + Math.random().toString(36).slice(2, 6);
}

// verify business belongs to user
async function ownsBusiness(userId, businessId) {
  const { rows } = await db.query(
    'SELECT id FROM businesses WHERE id = $1 AND user_id = $2',
    [businessId, userId]
  );
  return rows.length > 0;
}

async function hasAnyAccess(userId, businessId) {
  const { rows } = await db.query(
    `SELECT 1 FROM business_members
     WHERE business_id = $1 AND user_id = $2 AND invite_status != 'Revoked'
     UNION ALL
     SELECT 1 FROM book_members bk
     JOIN cashbooks c ON c.id = bk.book_id
     WHERE c.business_id = $1 AND bk.user_id = $2
     LIMIT 1`,
    [businessId, userId]
  );
  return rows.length > 0;
}

// GET /api/businesses/:businessId/cashbooks
router.get('/', auth, async (req, res) => {
  const { businessId } = req.params;
  const userId = req.user.userId;
  const isOwner = await ownsBusiness(userId, businessId);

  if (!isOwner && !await hasAnyAccess(userId, businessId))
    return res.status(403).json({ error: 'Access denied' });

  try {
    let rows;
    if (isOwner) {
      const result = await db.query(
        `SELECT c.*,
           (SELECT COUNT(*) FROM transactions t WHERE t.book_id = c.id) AS transaction_count,
           (SELECT COUNT(*) FROM book_members bm WHERE bm.book_id = c.id) + 1 AS member_count
         FROM cashbooks c WHERE c.business_id = $1 ORDER BY c.created_at ASC`,
        [businessId]
      );
      rows = result.rows;
    } else {
      const result = await db.query(
        `SELECT c.*,
           (SELECT COUNT(*) FROM transactions t WHERE t.book_id = c.id) AS transaction_count,
           (SELECT COUNT(*) FROM book_members bm2 WHERE bm2.book_id = c.id) + 1 AS member_count
         FROM cashbooks c
         JOIN book_members bm ON bm.book_id = c.id AND bm.user_id = $1
         WHERE c.business_id = $2
         ORDER BY c.created_at ASC`,
        [userId, businessId]
      );
      rows = result.rows;
    }
    res.json({ cashbooks: rows });
  } catch (err) {
    console.error('[cashbooks GET]', err.message);
    res.status(500).json({ error: 'Failed to fetch cashbooks' });
  }
});

// POST /api/businesses/:businessId/cashbooks
router.post('/', auth, async (req, res) => {
  const { businessId } = req.params;
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Book name required' });
  if (!await ownsBusiness(req.user.userId, businessId))
    return res.status(403).json({ error: 'Access denied' });

  const id = makeId();
  try {
    const { rows } = await db.query(
      'INSERT INTO cashbooks (id, business_id, name) VALUES ($1, $2, $3) RETURNING *',
      [id, businessId, name.trim()]
    );
    res.status(201).json({ cashbook: { ...rows[0], transaction_count: '0' } });
  } catch (err) {
    console.error('[cashbooks POST]', err.message);
    res.status(500).json({ error: 'Failed to create cashbook' });
  }
});

// PATCH /api/businesses/:businessId/cashbooks/:bookId — rename
router.patch('/:bookId', auth, async (req, res) => {
  const { businessId, bookId } = req.params;
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  if (!await ownsBusiness(req.user.userId, businessId))
    return res.status(403).json({ error: 'Access denied' });

  try {
    const { rows } = await db.query(
      'UPDATE cashbooks SET name = $1 WHERE id = $2 AND business_id = $3 RETURNING *',
      [name.trim(), bookId, businessId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Cashbook not found' });
    res.json({ cashbook: rows[0] });
  } catch (err) {
    console.error('[cashbooks PATCH]', err.message);
    res.status(500).json({ error: 'Failed to rename cashbook' });
  }
});

// DELETE /api/businesses/:businessId/cashbooks/:bookId
router.delete('/:bookId', auth, async (req, res) => {
  const { businessId, bookId } = req.params;
  if (!await ownsBusiness(req.user.userId, businessId))
    return res.status(403).json({ error: 'Access denied' });

  try {
    await db.query('DELETE FROM cashbooks WHERE id = $1 AND business_id = $2', [bookId, businessId]);
    res.json({ success: true });
  } catch (err) {
    console.error('[cashbooks DELETE]', err.message);
    res.status(500).json({ error: 'Failed to delete cashbook' });
  }
});

module.exports = router;
