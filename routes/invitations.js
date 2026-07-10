const express = require('express');
const router = express.Router();
const db = require('../db');
const { BookInvitation, User } = require('../models');

function makeId() {
  return 'usr_' + Date.now() + Math.random().toString(36).slice(2, 6);
}

function makeMemberId() {
  return 'mbr_' + Date.now() + Math.random().toString(36).slice(2, 6);
}

function makeBizMemberId() {
  return 'bizm_' + Date.now() + Math.random().toString(36).slice(2, 6);
}

// POST /api/invitations/:token/accept
router.post('/:token/accept', async (req, res) => {
  const { token } = req.params;
  
  try {
    const invitation = await BookInvitation.findByToken(token);
    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }
    if (invitation.status !== 'pending') {
      return res.status(400).json({ error: 'Invitation is no longer pending' });
    }

    // Determine user via email or mobile from invitation
    let user = null;
    if (invitation.mobile) {
      user = await User.findByMobile(invitation.mobile);
    } else if (invitation.email) {
      user = await User.findByEmail(invitation.email);
    }

    if (!user) {
      // Create a shell user (no password set, needs to sign up later to login)
      const userId = makeId();
      const { rows } = await db.query(
        `INSERT INTO users (id, name, mobile, email) VALUES ($1, $2, $3, $4) RETURNING *`,
        [userId, invitation.name, invitation.mobile || null, invitation.email || null]
      );
      user = rows[0];
    }

    // Get the cashbook and business to assign properly
    const { rows: cbRows } = await db.query('SELECT business_id FROM cashbooks WHERE id = $1', [invitation.book_id]);
    if (cbRows.length === 0) return res.status(404).json({ error: 'Cashbook not found' });
    const businessId = cbRows[0].business_id;

    // Add to business_members if not present
    const { rows: bmRows } = await db.query('SELECT id FROM business_members WHERE business_id = $1 AND user_id = $2', [businessId, user.id]);
    if (bmRows.length === 0) {
      await db.query(
        `INSERT INTO business_members (id, business_id, user_id, role, name, mobile, email) VALUES ($1, $2, $3, 'Employee', $4, $5, $6)`,
        [makeBizMemberId(), businessId, user.id, user.name || invitation.name, user.mobile || invitation.mobile, user.email || invitation.email]
      );
    }

    // Add to book_members if not present
    const { rows: bookMRows } = await db.query('SELECT id FROM book_members WHERE book_id = $1 AND user_id = $2', [invitation.book_id, user.id]);
    if (bookMRows.length === 0) {
      await db.query(
        `INSERT INTO book_members (id, book_id, user_id, name, mobile, email, role) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [makeMemberId(), invitation.book_id, user.id, user.name || invitation.name, user.mobile || invitation.mobile, user.email || invitation.email, invitation.role]
      );
    }

    // Update invitation status
    await db.query('UPDATE book_invitations SET status = $1 WHERE id = $2', ['accepted', invitation.id]);

    res.json({ success: true, message: 'Invitation accepted successfully' });
  } catch (err) {
    console.error('[invitations accept]', err.message);
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

module.exports = router;
