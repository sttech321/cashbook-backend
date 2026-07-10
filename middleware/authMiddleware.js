const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'cashbook_dev_secret_key_2024';

module.exports = function authMiddleware(req, res, next) {
  // Prefer httpOnly cookie; fall back to Bearer header for API clients
  const token = req.cookies?.cashbook_token
    || (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.split(' ')[1]
        : null);

  if (!token) return res.status(401).json({ error: 'Unauthorized — token missing' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized — invalid or expired token' });
  }
};
