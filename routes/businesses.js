const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    cb(null, `business-${req.params.id}-${Date.now()}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage });

function makeId() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

// GET /api/businesses — list owned + member businesses
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { rows: owned } = await db.query(
      "SELECT *, 'Primary Admin' AS my_role, 'Accepted' AS my_invite_status FROM businesses WHERE user_id = $1 ORDER BY created_at ASC",
      [userId]
    );
    // Businesses where user is a business_member (not revoked) OR a book_member in any book
    const { rows: memberOf } = await db.query(
      `SELECT b.*, COALESCE(
         (SELECT bm.role FROM business_members bm
          WHERE bm.business_id = b.id AND bm.user_id = $1 AND bm.invite_status != 'Revoked'
          LIMIT 1),
         'Employee'
       ) AS my_role,
       COALESCE(
         (SELECT bm.invite_status FROM business_members bm
          WHERE bm.business_id = b.id AND bm.user_id = $1 AND bm.invite_status != 'Revoked'
          LIMIT 1),
         'Accepted'
       ) AS my_invite_status
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
  const { name, category, businessType, subcategory, registration_type, address, staff_size, gstin, email, mobile, logo } = req.body;
  try {
    const { rows } = await db.query(
      `UPDATE businesses SET
         name = COALESCE($1, name),
         category = COALESCE($2, category),
         business_type = COALESCE($3, business_type),
         subcategory = COALESCE($4, subcategory),
         registration_type = COALESCE($5, registration_type),
         address = COALESCE($6, address),
         staff_size = COALESCE($7, staff_size),
         gstin = COALESCE($8, gstin),
         email = COALESCE($9, email),
         mobile = COALESCE($10, mobile),
         logo = COALESCE($11, logo)
       WHERE id = $12 AND user_id = $13 RETURNING *`,
      [name || null, category || null, businessType || null, subcategory || null, registration_type || null, address || null, staff_size || null, gstin || null, email || null, mobile || null, logo || null, req.params.id, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Business not found' });
    res.json({ business: rows[0] });
  } catch (err) {
    console.error('[businesses PATCH]', err.message);
    res.status(500).json({ error: 'Failed to update business' });
  }
});

// POST /api/businesses/:id/upload-logo — upload business logo
router.post('/:id/upload-logo', auth, upload.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const logoUrl = `/uploads/${req.file.filename}`;
  try {
    const { rows } = await db.query(
      `UPDATE businesses SET logo = $1 WHERE id = $2 AND user_id = $3 RETURNING *`,
      [logoUrl, req.params.id, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Business not found' });
    res.json({ business: rows[0] });
  } catch (err) {
    console.error('[businesses UPLOAD]', err.message);
    res.status(500).json({ error: 'Failed to upload logo' });
  }
});

// DELETE /api/businesses/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM businesses WHERE id = $1 AND user_id = $2', [req.params.id, req.user.userId]);
    res.json({ success: true });
  } catch (err) {
    require('fs').writeFileSync('delete_error.txt', err.stack || err.message);
    console.error('[businesses DELETE]', err.message);
    res.status(500).json({ error: 'Failed to delete business' });
  }
});

// POST /api/businesses/:id/accept-invite
router.post('/:id/accept-invite', auth, async (req, res) => {
  try {
    const businessId = req.params.id;
    const userId = req.user.userId;

    const { rows } = await db.query(
      `UPDATE business_members 
       SET invite_status = 'Accepted' 
       WHERE business_id = $1 AND user_id = $2 AND invite_status = 'Pending'
       RETURNING *`,
      [businessId, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'No pending invitation found for this business' });
    }

    res.json({ success: true, member: rows[0] });
  } catch (err) {
    console.error('[accept invite]', err.message);
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

module.exports = router;
