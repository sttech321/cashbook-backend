const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const { User } = require('../models');

// GET /api/users/lookup?email=...
router.get('/lookup', auth, async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'email is required' });

  const user = await User.findByEmail(email.toLowerCase().trim());
  if (user) {
    res.json({ found: true, user: { id: user.id, name: user.name, email: user.email } });
  } else {
    res.json({ found: false });
  }
});

module.exports = router;
