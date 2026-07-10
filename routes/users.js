const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const { User } = require('../models');

// GET /api/users/lookup?email=... OR ?mobile=...
router.get('/lookup', auth, async (req, res) => {
  const { email, mobile } = req.query;

  if (email) {
    const user = await User.findByEmail(email.toLowerCase().trim());
    if (user) return res.json({ found: true, user: { id: user.id, name: user.name, email: user.email, mobile: user.mobile } });
    return res.json({ found: false });
  }

  if (mobile) {
    const raw = mobile.trim();
    // Try the number as-is first, then with +91 prefix (handles 10-digit input)
    let user = await User.findByMobile(raw);
    if (!user && /^\d{10}$/.test(raw)) user = await User.findByMobile(`+91${raw}`);
    if (!user && raw.startsWith('91') && raw.length === 12) user = await User.findByMobile(`+${raw}`);
    if (user) return res.json({ found: true, user: { id: user.id, name: user.name, email: user.email, mobile: user.mobile } });
    return res.json({ found: false });
  }

  return res.status(400).json({ error: 'email or mobile is required' });
});

module.exports = router;
