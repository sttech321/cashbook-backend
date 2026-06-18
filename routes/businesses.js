const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/authMiddleware');

function makeId() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

// GET /api/businesses — list owned + member businesses
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { rows: owned } = await db.query(
      "SELECT *, 'Primary Admin' AS my_role FROM businesses WHERE user_id = $1 ORDER BY created_at ASC",
      [userId]
    );
    // Businesses where user is a business_member (not revoked) OR a book_member in any book
    const { rows: memberOf } = await db.query(
      `SELECT b.*, COALESCE(
         (SELECT bm.role FROM business_members bm
          WHERE bm.business_id = b.id AND bm.user_id = $1 AND bm.invite_status != 'Revoked'
          LIMIT 1),
         'Employee'
       ) AS my_role
       FROM businesses b
       WHERE b.user_id != $1
         AND (
           EXISTS (SELECT 1 FROM business_members bm
                   WHERE bm.business_id = b.id AND bm.user_id = $1 AND bm.invite_status != 'Revoked')
           OR EXISTS (SELECT 1 FROM book_members bk
                      JOIN cashbooks c ON c.id = bk.book_id
                      WHERE c.business_id = b.id AND bk.user_id = $1)
         )
       ORDER BY b.created_at ASC`,
      [userId]
    );
    const seen = new Set(owned.map(b => b.id));
    res.json({ businesses: [...owned, ...memberOf.filter(b => !seen.has(b.id))] });
  } catch (err) {
    console.error('[businesses GET]', err.message);
    res.status(500).json({ error: 'Failed to fetch businesses' });
  }
});

// POST /api/businesses — create a new business
router.post('/', auth, async (req, res) => {
  const { name, category, businessType, icon } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Business name required' });

  const id = makeId();
  try {
    const { rows } = await db.query(
      `INSERT INTO businesses (id, user_id, name, category, business_type, icon)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, req.user.userId, name.trim(), category || null, businessType || null, icon || '🏢']
    );
    res.status(201).json({ business: rows[0] });
  } catch (err) {
    console.error('[businesses POST]', err.message);
    res.status(500).json({ error: 'Failed to create business' });
  }
});

// PATCH /api/businesses/:id — update business name/details
router.patch('/:id', auth, async (req, res) => {
  const { name, category, businessType } = req.body;
  try {
    const { rows } = await db.query(
      `UPDATE businesses SET
         name = COALESCE($1, name),
         category = COALESCE($2, category),
         business_type = COALESCE($3, business_type)
       WHERE id = $4 AND user_id = $5 RETURNING *`,
      [name || null, category || null, businessType || null, req.params.id, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Business not found' });
    res.json({ business: rows[0] });
  } catch (err) {
    console.error('[businesses PATCH]', err.message);
    res.status(500).json({ error: 'Failed to update business' });
  }
});

// DELETE /api/businesses/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM businesses WHERE id = $1 AND user_id = $2', [req.params.id, req.user.userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('[businesses DELETE]', err.message);
    res.status(500).json({ error: 'Failed to delete business' });
  }
});

module.exports = router;
