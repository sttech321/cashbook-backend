const twilio = require('twilio');

async function sendOtpSms({ to }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID;

  if (!accountSid || !authToken || !verifySid || accountSid === 'your_twilio_account_sid_here') {
    throw new Error('TWILIO_NOT_CONFIGURED');
  }

  try {
    const client = twilio(accountSid, authToken);
    const verification = await client.verify.v2.services(verifySid).verifications.create({
      to: to,
      channel: 'sms'
    });
    console.log(`[SMS] ✅ OTP requested via Twilio Verify to ${to} | SID: ${verification.sid}`);
    return true;
  } catch (err) {
    console.error(`[SMS ERROR] Failed to send Twilio Verify SMS to ${to}: ${err.message}`);
    throw err;
  }
}

async function verifyOtpSms({ to, code }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const verifySid = process.env.TWILIO_VERIFY_SERVICE_SID;

  if (!accountSid || !authToken || !verifySid || accountSid === 'your_twilio_account_sid_here') {
    throw new Error('TWILIO_NOT_CONFIGURED');
  }

  try {
    const client = twilio(accountSid, authToken);
    const verificationCheck = await client.verify.v2.services(verifySid).verificationChecks.create({
      to: to,
      code: code
    });
    console.log(`[SMS] Twilio Verify check for ${to} | Status: ${verificationCheck.status}`);
    return verificationCheck.status === 'approved';
  } catch (err) {
    console.error(`[SMS ERROR] Failed to check Twilio Verify OTP for ${to}: ${err.message}`);
    throw err;
  }
}

module.exports = { sendOtpSms, verifyOtpSms };
