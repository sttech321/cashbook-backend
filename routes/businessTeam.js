const express = require('express');
const router  = express.Router({ mergeParams: true });
const auth    = require('../middleware/authMiddleware');
const { BusinessMember, Business, User, BookMember, Cashbook } = require('../models');

// Verify user owns the business
async function requireAccess(req, res, next) {
  const biz = await Business.findById(req.params.businessId);
  if (!biz) return res.status(404).json({ error: 'Business not found' });
  if (biz.user_id !== req.user.userId) return res.status(403).json({ error: 'Forbidden' });
  req.business = biz;
  next();
}

/**
 * Resolve a memberId to { userId, memberName, memberEmail, memberMobile }.
 * For invited-but-not-yet-registered members (user_id = null), we try to
 * look them up by email so we can still operate on their book memberships.
 */
async function resolveMember(memberId) {
  if (memberId.startsWith('owner_')) {
    const userId = memberId.replace('owner_', '');
    const owner = await User.findById(userId);
    return { userId, memberName: owner?.name || 'Owner', memberEmail: owner?.email || '', memberMobile: '' };
  }
  const member = await BusinessMember.findById(memberId);
  if (!member) return null;

  let userId = member.user_id || null;
  const memberEmail = member.email || '';
  const memberMobile = member.mobile || '';
  const memberName = member.name;

  // Try to resolve user_id from email (invited but not yet registered)
  if (!userId && memberEmail) {
    const userByEmail = await User.findByEmail(memberEmail);
    if (userByEmail) {
      userId = userByEmail.id;
      // Back-fill for future lookups
      await BusinessMember.update(memberId, { user_id: userId }).catch(() => {});
    }
  }

  return { userId, memberName, memberEmail, memberMobile };
}

// GET / — list all members (owner is always first as Primary Admin)
router.get('/', auth, requireAccess, async (req, res) => {
  const biz = req.business;
  const owner = await User.findById(biz.user_id);
  const dbMembers = await BusinessMember.findByBusiness(biz.id);

  const ownerEntry = {
    id:            `owner_${biz.user_id}`,
    business_id:   biz.id,
    user_id:       biz.user_id,
    name:          owner?.name || 'Owner',
    mobile:        owner?.mobile || null,
    email:         owner?.email || null,
    employee_id:   owner?.employee_id || null,
    role:          'Primary Admin',
    invite_status: 'Accepted',
    reports_to:    null,
    is_owner:      true,
    created_at:    biz.created_at,
  };

  res.json({ members: [ownerEntry, ...dbMembers] });
});

// POST / — add member (idempotent: returns existing if same mobile/email/user_id found)
router.post('/', auth, requireAccess, async (req, res) => {
  const { name, mobile, email, role, user_id, employee_id } = req.body;
  if (!name?.trim() && !mobile && !email) return res.status(400).json({ error: 'name or email required' });

  const bizId = req.params.businessId;

  // Dedup: return 400 if same identifier already in this business
  // 1. Check if the invited person is the owner
  const biz = req.business;
  const owner = await User.findById(biz.user_id);
  if (owner) {
    if (
      (user_id && owner.id === user_id) ||
      (mobile && owner.mobile === mobile) ||
      (email && owner.email && owner.email.toLowerCase() === email.toLowerCase().trim())
    ) {
      return res.status(400).json({ error: 'User is already the owner of this business.' });
    }
  }

  // 2. Check if the person is already a business member
  let existing = null;
  if (user_id) {
    existing = await BusinessMember.findOne({ business_id: bizId, user_id });
  }
  if (!existing && mobile) {
    existing = await BusinessMember.findOne({ business_id: bizId, mobile });
  }
  if (!existing && email) {
    existing = await BusinessMember.findOne({ business_id: bizId, email: email.toLowerCase().trim() });
  }
  if (existing) {
    const statusText = existing.invite_status === 'Pending' ? 'already invited' : 'already a member';
    return res.status(400).json({ error: `User is ${statusText} in this business.` });
  }

  const member = await BusinessMember.create({
    business_id:   bizId,
    user_id:       user_id || null,
    name:          name?.trim() || email || mobile,
    mobile:        mobile || null,
    email:         email  ? email.toLowerCase().trim() : null,
    role:          role   || 'Employee',
    employee_id:   employee_id || null,
    invite_status: 'Accepted',
    invited_by:    req.user.userId,
  });
  res.status(201).json({ member });
});

// PATCH /:id — update role / employee_id / reports_to
router.patch('/:id', auth, requireAccess, async (req, res) => {
  const { role, employee_id, reports_to } = req.body;

  // Owner (Primary Admin) is not a business_members row — their Employee ID lives
  // on the user record. Role/reports_to are not editable for the owner.
  if (req.params.id.startsWith('owner_')) {
    if (employee_id !== undefined) {
      await User.update(req.business.user_id, { employee_id: employee_id || null });
    }
    const owner = await User.findById(req.business.user_id);
    return res.json({ member: {
      id:            `owner_${req.business.user_id}`,
      business_id:   req.business.id,
      user_id:       req.business.user_id,
      name:          owner?.name || 'Owner',
      mobile:        owner?.mobile || null,
      email:         owner?.email || null,
      employee_id:   owner?.employee_id || null,
      role:          'Primary Admin',
      invite_status: 'Accepted',
      reports_to:    null,
      is_owner:      true,
    } });
  }

  const updates = {};
  if (role        !== undefined) updates.role        = role;
  if (employee_id !== undefined) updates.employee_id = employee_id;
  if (reports_to  !== undefined) updates.reports_to  = reports_to;
  const member = await BusinessMember.update(req.params.id, updates);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  res.json({ member });
});

// DELETE /:id — remove from business
router.delete('/:id', auth, requireAccess, async (req, res) => {
  await BusinessMember.delete(req.params.id);
  res.json({ success: true });
});

// GET /:memberId/books — list all cashbooks this member belongs to in this business
router.get('/:memberId/books', auth, requireAccess, async (req, res) => {
  const { memberId, businessId } = req.params;

  const resolved = await resolveMember(memberId);
  if (!resolved) return res.status(404).json({ error: 'Member not found' });
  const { userId, memberEmail } = resolved;

  if (userId) {
    const rows = await BookMember.findByUser(userId, businessId);
    return res.json({ books: rows.map(r => ({ bookId: r.bookId, bookName: r.bookName, role: r.role })) });
  }

  // No user account yet — look up by email in book_members
  if (memberEmail) {
    const { rows } = await BookMember.query(
      `SELECT bm.id, bm.book_id AS "bookId", c.name AS "bookName", bm.role
       FROM book_members bm
       JOIN cashbooks c ON c.id = bm.book_id
       WHERE bm.email = $1 AND c.business_id = $2
       ORDER BY bm.created_at ASC`,
      [memberEmail, businessId]
    );
    return res.json({ books: rows.map(r => ({ bookId: r.bookId, bookName: r.bookName, role: r.role })) });
  }

  res.json({ books: [] });
});

// POST /:memberId/books — add this member to a cashbook with a role
router.post('/:memberId/books', auth, requireAccess, async (req, res) => {
  const { memberId, businessId } = req.params;
  const { bookId, role } = req.body;
  if (!bookId) return res.status(400).json({ error: 'bookId is required' });

  const book = await Cashbook.findById(bookId);
  if (!book || book.business_id !== businessId) {
    return res.status(404).json({ error: 'Cashbook not found in this business' });
  }

  const resolved = await resolveMember(memberId);
  if (!resolved) return res.status(404).json({ error: 'Member not found' });
  const { userId, memberName, memberEmail, memberMobile } = resolved;

  // Upsert: if already in book, just update role
  if (userId) {
    const existing = await BookMember.findOne({ book_id: bookId, user_id: userId });
    if (existing) {
      await BookMember.update(existing.id, { role: role || 'Data Operator' });
      return res.json({ bookId, bookName: book.name, role: role || 'Data Operator' });
    }
  } else if (memberEmail) {
    const { rows } = await BookMember.query(
      'SELECT * FROM book_members WHERE book_id = $1 AND email = $2 LIMIT 1',
      [bookId, memberEmail]
    );
    if (rows[0]) {
      await BookMember.update(rows[0].id, { role: role || 'Data Operator' });
      return res.json({ bookId, bookName: book.name, role: role || 'Data Operator' });
    }
  } else if (memberMobile) {
    const { rows } = await BookMember.query(
      'SELECT * FROM book_members WHERE book_id = $1 AND mobile = $2 LIMIT 1',
      [bookId, memberMobile]
    );
    if (rows[0]) {
      await BookMember.update(rows[0].id, { role: role || 'Data Operator' });
      return res.json({ bookId, bookName: book.name, role: role || 'Data Operator' });
    }
  }

  await BookMember.create({
    book_id: bookId,
    user_id: userId || null,
    name:    memberName,
    mobile:  memberMobile || null,
    email:   memberEmail || null,
    role:    role || 'Data Operator',
    invite_status: 'Accepted',
    invited_by:    req.user.userId,
  });

  res.status(201).json({ bookId, bookName: book.name, role: role || 'Data Operator' });
});

// Helper: find a book_member row for a resolved member
async function findBookMemberRow(bookId, userId, memberEmail) {
  if (userId) {
    const row = await BookMember.findOne({ book_id: bookId, user_id: userId });
    if (row) return row;
  }
  if (memberEmail) {
    const { rows } = await BookMember.query(
      'SELECT * FROM book_members WHERE book_id = $1 AND email = $2 LIMIT 1',
      [bookId, memberEmail]
    );
    if (rows[0]) return rows[0];
  }
  return null;
}

// PATCH /:memberId/books/:bookId — change member's role in a specific book
router.patch('/:memberId/books/:bookId', auth, requireAccess, async (req, res) => {
  const { memberId, bookId } = req.params;
  const { role } = req.body;
  if (!role) return res.status(400).json({ error: 'role is required' });
  try {
    const resolved = await resolveMember(memberId);
    if (!resolved) return res.status(404).json({ error: 'Member not found' });
    const existing = await findBookMemberRow(bookId, resolved.userId, resolved.memberEmail);
    if (!existing) return res.status(404).json({ error: 'Book member not found' });
    const updated = await BookMember.update(existing.id, { role });
    res.json({ success: true, role: updated.role });
  } catch (err) {
    console.error('[PATCH team/:memberId/books/:bookId]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:memberId/books/:bookId — remove member from a specific book
router.delete('/:memberId/books/:bookId', auth, requireAccess, async (req, res) => {
  const { memberId, bookId } = req.params;
  try {
    const resolved = await resolveMember(memberId);
    if (!resolved) return res.status(404).json({ error: 'Member not found' });
    const existing = await findBookMemberRow(bookId, resolved.userId, resolved.memberEmail);
    if (!existing) return res.status(404).json({ error: 'Book member not found' });
    await BookMember.delete(existing.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE team/:memberId/books/:bookId]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
