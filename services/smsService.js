const twilio = require('twilio');

async function sendOtpSms({ to, otp }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromPhone = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromPhone || accountSid === 'your_twilio_account_sid_here') {
    throw new Error('TWILIO_NOT_CONFIGURED');
  }

  try {
    const client = twilio(accountSid, authToken);
    const message = await client.messages.create({
      body: `Your Cashbook verification OTP is: ${otp}`,
      from: fromPhone,
      to: to
    });
    console.log(`[SMS] ✅ OTP sent via Twilio to ${to} | SID: ${message.sid}`);
    return true;
  } catch (err) {
    console.error(`[SMS ERROR] Failed to send Twilio SMS to ${to}: ${err.message}`);
    throw err;
  }
}

module.exports = { sendOtpSms };
