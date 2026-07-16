const express = require('express');
const router = express.Router({ mergeParams: true });
const db = require('../db');
const auth = require('../middleware/authMiddleware');
const store = require('../data/store');
const { User, BusinessMember } = require('../models');

function makeId() {
  return 'mbr_' + Date.now() + Math.random().toString(36).slice(2, 6);
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

async function isBookAdmin(userId, bookId) {
  const { rows } = await db.query(
    'SELECT role FROM book_members WHERE book_id = $1 AND user_id = $2 LIMIT 1',
    [bookId, userId]
  );
  return rows[0]?.role === 'Book Admin';
}

// GET /api/businesses/:businessId/cashbooks/:bookId/members
router.get('/', auth, async (req, res) => {
  const { businessId, bookId } = req.params;
  if (!await canReadBook(req.user.userId, businessId, bookId))
    return res.status(403).json({ error: 'Access denied' });

  try {
    const { rows: bizRows } = await db.query(
      'SELECT b.user_id FROM cashbooks c JOIN businesses b ON c.business_id = b.id WHERE c.id = $1',
      [bookId]
    );
    const ownerId = bizRows[0]?.user_id;
    const ownerUser = ownerId ? await User.findById(ownerId) : null;

    const primaryAdmin = {
      id: `primary_${ownerId}`,
      book_id: bookId,
      user_id: ownerId,
      name: ownerUser?.name || 'You',
      mobile: ownerUser?.mobile || '',
      email: ownerUser?.email || '',
      employee_id: ownerUser?.employee_id || null,
      role: 'Primary Admin',
      is_owner: true,
      created_at: null,
    };

    const { rows } = await db.query(
      `SELECT bm.*,
              COALESCE(u.name, bm.name)   AS name,
              COALESCE(u.mobile, bm.mobile) AS mobile,
              COALESCE(u.email, bm.email)  AS email
       FROM book_members bm
       LEFT JOIN users u ON u.id = bm.user_id
       WHERE bm.book_id = $1
       ORDER BY bm.created_at ASC`,
      [bookId]
    );

    const filteredRows = rows.filter(r => r.user_id !== ownerId);
    res.json({ members: [primaryAdmin, ...filteredRows] });
  } catch (err) {
    console.error('[members GET]', err.message);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// POST /api/businesses/:businessId/cashbooks/:bookId/members
router.post('/', auth, async (req, res) => {
  const { businessId, bookId } = req.params;
  const userId = req.user.userId;
  const isOwner = await ownsBook(userId, businessId, bookId);
  if (!isOwner && !await isBookAdmin(userId, bookId))
    return res.status(403).json({ error: 'Access denied' });

  const { user_id, name, mobile, email, role } = req.body;
  if (!name || !role) return res.status(400).json({ error: 'name and role are required' });
  if (!isOwner && role === 'Primary Admin')
    return res.status(403).json({ error: 'Only the book owner can assign Primary Admin role' });

  const { rows: bizRows } = await db.query('SELECT user_id FROM businesses WHERE id = $1', [businessId]);
  if (bizRows[0]?.user_id === user_id)
    return res.status(400).json({ error: 'Book owner is already the Primary Admin' });

  let finalUserId = user_id || null;
  const { User } = require('../models');
  if (!finalUserId) {
    if (email) {
      const u = await User.findByEmail(email);
      if (u) finalUserId = u.id;
    }
    if (!finalUserId && mobile) {
      const u = await User.findByMobile(mobile);
      if (u) finalUserId = u.id;
    }
  }

  const id = makeId();
  try {
    // Add to business_members if not already present
    if (finalUserId) {
      const { rows: bizRows } = await db.query(
        'SELECT id FROM business_members WHERE business_id = $1 AND user_id = $2',
        [businessId, finalUserId]
      );
      if (bizRows.length === 0) {
        await require('../models').BusinessMember.create({
          business_id: businessId,
          user_id: finalUserId,
          name,
          mobile: mobile || null,
          email: email || null,
          role: 'Employee',
          invite_status: 'Accepted',
          invited_by: userId
        });
      }
    } else if (email || mobile) {
       const q = email ? 'email = $2' : 'mobile = $2';
       const p = email ? email : mobile;
       const { rows: bizRows } = await db.query(
         `SELECT id FROM business_members WHERE business_id = $1 AND ${q}`,
         [businessId, p]
       );
       if (bizRows.length === 0) {
         await require('../models').BusinessMember.create({
           business_id: businessId,
           user_id: null,
           name,
           mobile: mobile || null,
           email: email || null,
           role: 'Employee',
           invite_status: 'Accepted',
           invited_by: userId
         });
       }
    }

    const { rows } = await db.query(
      `INSERT INTO book_members (id, book_id, user_id, name, mobile, email, role, invite_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'Accepted') RETURNING *`,
      [id, bookId, finalUserId, name, mobile || null, email || null, role]
    );

    // Also add them to the business team (Pending) so they appear on the Team page's
    // "Pending Invitations". Non-fatal: never block the book-member add on this.
    try {
      const ownerId = bizRows[0]?.user_id;
      const normEmail = email ? email.toLowerCase().trim() : null;
      if (user_id !== ownerId) { // owner is already the Primary Admin
        let existingBiz = null;
        if (user_id)               existingBiz = await BusinessMember.findOne({ business_id: businessId, user_id });
        if (!existingBiz && normEmail) existingBiz = await BusinessMember.findOne({ business_id: businessId, email: normEmail });
        if (!existingBiz && mobile)    existingBiz = await BusinessMember.findOne({ business_id: businessId, mobile });
        if (!existingBiz) {
          await BusinessMember.create({
            business_id:   businessId,
            user_id:       user_id || null,
            name,
            mobile:        mobile || null,
            email:         normEmail,
            role:          'Employee',
            // Registered users (found in DB) join directly as active members;
            // unregistered users stay Pending until they accept the emailed invite.
            invite_status: user_id ? 'Accepted' : 'Pending',
            invited_by:    userId,
          });
        }
      }
    } catch (e) {
      console.warn('[members POST] business-team sync skipped:', e.message);
    }

    res.status(201).json({ member: rows[0] });
  } catch (err) {
    if (err.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Member already in this book' });
    console.error('[members POST]', err.message);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// PATCH /api/businesses/:businessId/cashbooks/:bookId/members/:memberId
router.patch('/:memberId', auth, async (req, res) => {
  const { businessId, bookId, memberId } = req.params;
  if (!await ownsBook(req.user.userId, businessId, bookId))
    return res.status(403).json({ error: 'Access denied' });

  const { role } = req.body;
  if (!role) return res.status(400).json({ error: 'role is required' });

  try {
    const { rows } = await db.query(
      'UPDATE book_members SET role=$1 WHERE id=$2 AND book_id=$3 RETURNING *',
      [role, memberId, bookId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Member not found' });
    res.json({ member: rows[0] });
  } catch (err) {
    console.error('[members PATCH]', err.message);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// DELETE /api/businesses/:businessId/cashbooks/:bookId/members/:memberId
router.delete('/:memberId', auth, async (req, res) => {
  const { businessId, bookId, memberId } = req.params;
  if (!await ownsBook(req.user.userId, businessId, bookId))
    return res.status(403).json({ error: 'Access denied' });

  try {
    await db.query('DELETE FROM book_members WHERE id=$1 AND book_id=$2', [memberId, bookId]);
    res.json({ success: true });
  } catch (err) {
    console.error('[members DELETE]', err.message);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

module.exports = router;
