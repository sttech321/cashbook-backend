// OTP store only — user persistence is handled by models/User.js
const { User } = require('../models');

const otpStore = new Map();

module.exports = {
  // ── OTP ───────────────────────────────────────────────────
  saveOtp(key, otp) {
    otpStore.set(key, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });
  },

  verifyOtp(key, inputOtp) {
    const record = otpStore.get(key);
    if (!record) return { valid: false, reason: 'OTP not found or already used' };
    if (Date.now() > record.expiresAt) {
      otpStore.delete(key);
      return { valid: false, reason: 'OTP expired' };
    }
    if (record.otp !== inputOtp) return { valid: false, reason: 'Invalid OTP' };
    otpStore.delete(key);
    return { valid: true };
  },

  // ── User helpers (delegated to User model) ────────────────
  findOrCreateUser: (key, type) => User.findOrCreate(key, type),
  findUserById:     (id)        => User.findById(id),
  updateUser:       (id, fields) => User.updateProfile(id, fields),
};
