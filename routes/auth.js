require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const store = require('../data/store');
const authMiddleware = require('../middleware/authMiddleware');
const { sendOtpEmail } = require('../services/emailService');
const { sendOtpSms, verifyOtpSms } = require('../services/smsService');
const { User } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || 'cashbook_dev_secret_key_2024';
const JWT_EXPIRY = '7d';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

function setAuthCookie(res, token) {
  res.cookie('cashbook_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE,
  });
}

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Simple in-memory rate limiter
const sendOtpAttempts = new Map();
function rateLimit(key) {
  const now = Date.now();
  const attempts = (sendOtpAttempts.get(key) || []).filter((t) => now - t < 60000);
  if (attempts.length >= 5) return false;
  attempts.push(now);
  sendOtpAttempts.set(key, attempts);
  return true;
}

const isValidMobile = (m) => /^\+?[0-9]{10,13}$/.test(m.replace(/\s/g, ''));
const isValidEmail  = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// ─────────────────────────────────────────────────────────
// POST /api/auth/send-otp
// ─────────────────────────────────────────────────────────
router.post('/send-otp', async (req, res) => {
  let { mobile, email } = req.body;
  if (mobile) {
    mobile = mobile.toString().replace(/\s/g, '');
    if (mobile.length === 10) mobile = '+91' + mobile;
    else if (!mobile.startsWith('+')) mobile = '+' + mobile;
  }

  if (!mobile && !email) return res.status(400).json({ error: 'mobile or email required' });

  const isMobile = !!mobile;
  const key  = mobile || email;
  const type = isMobile ? 'mobile' : 'email';

  if (isMobile && !isValidMobile(key)) return res.status(400).json({ error: 'Invalid mobile number format' });
  if (!isMobile && !isValidEmail(key))  return res.status(400).json({ error: 'Invalid email address format' });
  if (!rateLimit(key)) return res.status(429).json({ error: 'Too many OTP requests. Try again in 1 minute.' });

  // For email, we always generate and use a local OTP
  let localOtp = null;
  if (!isMobile) {
    localOtp = generateOtp();
    store.saveOtp(key, localOtp);
    console.log(`[OTP] EMAIL → ${key} | OTP: ${localOtp}`);
  }

  try {
    if (!isMobile) {
      await sendOtpEmail({ to: email, otp: localOtp });
    } else {
      // For mobile, try using Twilio Verify (no local OTP passed)
      const hasTwilio = !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_VERIFY_SERVICE_SID;
      if (!hasTwilio) throw new Error('TWILIO_NOT_CONFIGURED');
      await sendOtpSms({ to: mobile });
    }
    return res.json({
      success: true,
      type,
      message: isMobile ? `OTP sent to ${key}` : `OTP sent to ${key}. Check your inbox.`,
    });
  } catch (err) {
    if (err.message === 'TWILIO_NOT_CONFIGURED' || err.message === 'RESEND_NOT_CONFIGURED') {
      // Dev Fallback logic
      const fallbackOtp = localOtp || generateOtp();
      if (isMobile) {
         store.saveOtp(key, fallbackOtp);
         console.log(`[DEV FALLBACK] SMS service not configured. Generated local OTP for ${key}: ${fallbackOtp}`);
      }
      return res.json({
        success: true,
        type,
        message: `OTP generated (no ${isMobile ? 'SMS' : 'email'} service — check server logs)`,
        _demo_otp: fallbackOtp,
      });
    }

    console.error(`[${isMobile ? 'SMS' : 'EMAIL'} ERROR]`, err.message);
    console.error(`[${isMobile ? 'SMS' : 'EMAIL'} ERROR] Stack:`, err.stack);

    // Dev fallback if the service fails but is "configured"
    const hasService = isMobile ? !!process.env.TWILIO_ACCOUNT_SID : (!!process.env.RESEND_API_KEY || !!process.env.SMTP_USER);
    if (!hasService || process.env.NODE_ENV !== 'production') {
       const fallbackOtp = localOtp || generateOtp();
       if (isMobile) store.saveOtp(key, fallbackOtp);
       console.log(`[DEV FALLBACK] Service error but returning demo OTP: ${fallbackOtp}`);
       return res.json({
         success: true,
         type,
         message: `OTP generated (Service error fallback — check logs)`,
         _demo_otp: fallbackOtp,
       });
    }

    return res.status(500).json({ error: `${isMobile ? 'SMS' : 'Email'} send failed: ${err.message}` });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/auth/verify-otp
// ─────────────────────────────────────────────────────────
router.post('/verify-otp', async (req, res) => {
  let { mobile, email, otp } = req.body;
  if (mobile) {
    mobile = mobile.toString().replace(/\s/g, '');
    if (mobile.length === 10) mobile = '+91' + mobile;
    else if (!mobile.startsWith('+')) mobile = '+' + mobile;
  }

  const key  = mobile || email;
  const type = mobile ? 'mobile' : 'email';
  const code = otp.toString().trim();

  if (!key || !otp) return res.status(400).json({ error: 'mobile/email and otp are required' });

  // Verification Logic
  let isValid = false;
  let reason = 'Invalid OTP';

  if (!mobile) {
    // Email uses local store
    const result = store.verifyOtp(key, code);
    isValid = result.valid;
    reason = result.reason;
  } else {
    // Mobile uses Twilio Verify API OR Dev Fallback
    const localCheck = store.verifyOtp(key, code);
    if (localCheck.valid) {
       isValid = true; // Handled by Dev Fallback
    } else {
       try {
         isValid = await verifyOtpSms({ to: mobile, code });
       } catch (err) {
         if (err.message === 'TWILIO_NOT_CONFIGURED') {
            reason = localCheck.reason; // Local check failed and Twilio isn't configured
         } else {
            return res.status(400).json({ error: 'Verification service error' });
         }
       }
    }
  }

  if (!isValid) return res.status(400).json({ error: reason });

  try {
    const user = await store.findOrCreateUser(key, type);
    const token = jwt.sign(
      { userId: user.id, mobile: user.mobile, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );
    setAuthCookie(res, token);
    return res.json({
      success: true,
      user: { id: user.id, name: user.name, mobile: user.mobile, email: user.email },
    });
  } catch (err) {
    console.error('[verify-otp] DB error:', err.message);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/auth/me
// ─────────────────────────────────────────────────────────
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await store.findUserById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: { id: user.id, name: user.name, mobile: user.mobile, email: user.email } });
  } catch (err) {
    console.error('[GET /me] DB error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// ─────────────────────────────────────────────────────────
// PATCH /api/auth/me — update name / email
// ─────────────────────────────────────────────────────────
router.patch('/me', authMiddleware, async (req, res) => {
  const { name, email, mobile, otpMobile, otpEmail } = req.body;
  const userId = req.user.userId;

  try {
    // Load current user first
    const currentUser = await User.findById(userId);
    if (!currentUser) return res.status(404).json({ error: 'User not found' });

    // Check mobile uniqueness (exclude current user)
    if (mobile !== undefined && mobile !== null && mobile !== '') {
      const mobileStr = String(mobile).trim();
      if (mobileStr !== (currentUser.mobile || '')) {
        const existing = await User.findOne({ mobile: mobileStr });
        if (existing && existing.id !== userId) {
          return res.status(409).json({ error: 'This mobile number is already linked to another account.' });
        }
      }
    }

    // Check email uniqueness (exclude current user)
    if (email !== undefined && email !== null && email !== '') {
      const emailStr = String(email).trim().toLowerCase();
      if (emailStr !== (currentUser.email || '').toLowerCase()) {
        const existing = await User.findOne({ email: emailStr });
        if (existing && existing.id !== userId) {
          return res.status(409).json({ error: 'This email is already linked to another account.' });
        }
      }
    }

    // Verify Mobile OTP if changed
    if (mobile !== undefined && mobile !== null && mobile !== '') {
      const mobileStr = String(mobile).trim();
      if (mobileStr !== (currentUser.mobile || '')) {
        if (!otpMobile) return res.status(400).json({ error: 'OTP is required to change mobile number.' });
        const localCheck = store.verifyOtp(mobileStr, otpMobile.toString().trim());
        if (!localCheck.valid) {
           try {
             const validSms = await verifyOtpSms({ to: mobileStr, code: otpMobile.toString().trim() });
             if (!validSms) return res.status(400).json({ error: 'Invalid OTP for mobile.' });
           } catch(err) {
             if (err.message === 'TWILIO_NOT_CONFIGURED') return res.status(400).json({ error: localCheck.reason });
             return res.status(400).json({ error: 'Verification service error' });
           }
        }
      }
    }

    // Verify Email OTP if changed
    if (email !== undefined && email !== null && email !== '') {
      const emailStr = String(email).trim().toLowerCase();
      if (emailStr !== (currentUser.email || '').toLowerCase()) {
        if (!otpEmail) return res.status(400).json({ error: 'OTP is required to change email.' });
        const result = store.verifyOtp(emailStr, otpEmail.toString().trim());
        if (!result.valid) return res.status(400).json({ error: `Email OTP error: ${result.reason}` });
      }
    }

    // Build update fields
    const fields = {};
    if (name   !== undefined && String(name).trim()   !== (currentUser.name   || '')) fields.name   = String(name).trim();
    if (email  !== undefined && String(email).trim()  !== (currentUser.email  || '')) fields.email  = String(email).trim().toLowerCase();
    if (mobile !== undefined && String(mobile).trim() !== (currentUser.mobile || '')) fields.mobile = String(mobile).trim() || null;

    // Nothing changed — return current user
    if (!Object.keys(fields).length) {
      return res.json({ success: true, user: { id: currentUser.id, name: currentUser.name, mobile: currentUser.mobile, email: currentUser.email } });
    }

    const updated = await User.updateProfile(userId, fields);
    if (!updated) return res.status(404).json({ error: 'User not found' });

    return res.json({ success: true, user: { id: updated.id, name: updated.name, mobile: updated.mobile, email: updated.email } });

  } catch (err) {
    console.error('[PATCH /me] error:', err.message, err.stack);
    if (err.message?.includes('UNIQUE') || err.code === '23505') {
      const field = err.message?.includes('mobile') ? 'mobile number' : 'email';
      return res.status(409).json({ error: `This ${field} is already in use by another account.` });
    }
    return res.status(500).json({ error: 'Failed to update profile: ' + err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/auth/logout
// ─────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie('cashbook_token', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  return res.json({ success: true });
});

module.exports = router;
