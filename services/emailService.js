const nodemailer = require('nodemailer');
const dns = require('dns');

// Force IPv4 — Render servers have broken IPv6 routing to Gmail SMTP
dns.setDefaultResultOrder('ipv4first');

// Transporter — Gmail SMTP
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT, 10),
  secure: false,          // PORT 587 → STARTTLS
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
  connectionTimeout: 10000,   // 10s — prevent hanging on blocked ports
  greetingTimeout:   10000,
  socketTimeout:     15000,
});

// ── Connection verify karo on startup ──────────────────
async function verifyConnection() {
  try {
    await transporter.verify();
    console.log('✅ Gmail SMTP connected:');
  } catch (err) {
    console.error('❌ Gmail SMTP error:', err.message);
  }
}

// ── Professional OTP Email Template ───────────────────
function buildOtpHtml({ otp, recipient, expiryMins = 5 }) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Your CashBook OTP</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#2563EB 0%,#1D4ED8 100%);padding:28px 40px;text-align:center;">
              <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="background:rgba(255,255,255,0.2);border-radius:10px;width:36px;height:36px;text-align:center;vertical-align:middle;">
                    <span style="color:#FFFFFF;font-size:18px;font-weight:900;line-height:36px;">C</span>
                  </td>
                  <td style="padding-left:10px;vertical-align:middle;">
                    <span style="color:#FFFFFF;font-size:20px;font-weight:800;letter-spacing:1px;">CASHBOOK</span>
                  </td>
                </tr>
              </table>
              <p style="color:rgba(255,255,255,0.85);font-size:13px;margin:8px 0 0;letter-spacing:0.3px;">
                Business Expense Management
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 28px;">

              <h2 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 10px;">
                Your Login OTP 🔐
              </h2>
              <p style="font-size:14px;color:#6B7280;margin:0 0 28px;line-height:1.6;">
                Hi <strong style="color:#374151;">${recipient}</strong>,<br/>
                Please use the OTP below to verify your identity and login to CashBook.
              </p>

              <!-- OTP Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <div style="display:inline-block;background:#EFF6FF;border:2px dashed #93C5FD;border-radius:14px;padding:22px 48px;">
                      <p style="font-size:11px;color:#6B7280;font-weight:600;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;">
                        One-Time Password
                      </p>
                      <p style="font-size:40px;font-weight:900;color:#2563EB;letter-spacing:14px;margin:0;font-family:'Courier New',monospace;">
                        ${otp}
                      </p>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Expiry info -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:14px 18px;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size:18px;vertical-align:top;padding-right:10px;">⏱️</td>
                        <td style="font-size:13px;color:#92400E;line-height:1.6;">
                          <strong>Valid for ${expiryMins} minutes only.</strong><br/>
                          This OTP will expire at <strong>${getExpiryTime(expiryMins)}</strong>.
                          Please do not share it with anyone.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Security warning -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:14px 18px;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size:18px;vertical-align:top;padding-right:10px;">🛡️</td>
                        <td style="font-size:13px;color:#991B1B;line-height:1.6;">
                          <strong>Security Alert:</strong> CashBook kabhi bhi aapka OTP phone, email ya
                          WhatsApp pe nahi maangega. Kisi ke saath share mat karo.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <hr style="border:none;border-top:1px solid #E5E7EB;margin:0 0 24px;"/>

              <p style="font-size:13px;color:#9CA3AF;margin:0;line-height:1.6;">
                Agar aapne login request nahi ki thi, toh is email ko ignore karein.
                Aapka account safe hai.<br/><br/>
                Need help?
                <a href="mailto:support@cashbook.in" style="color:#2563EB;text-decoration:none;">support@cashbook.in</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#F9FAFB;border-top:1px solid #E5E7EB;padding:20px 40px;text-align:center;">
              <p style="font-size:12px;color:#9CA3AF;margin:0 0 6px;">
                © 2024 CashBook — Powered by OBOPAY
              </p>
              <p style="font-size:11px;color:#D1D5DB;margin:0;">
                <a href="#" style="color:#D1D5DB;text-decoration:none;">Privacy Policy</a> &nbsp;•&nbsp;
                <a href="#" style="color:#D1D5DB;text-decoration:none;">Terms of Service</a> &nbsp;•&nbsp;
                <a href="#" style="color:#D1D5DB;text-decoration:none;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>

        <!-- Bottom note -->
        <p style="font-size:11px;color:#9CA3AF;margin:16px 0 0;text-align:center;">
          This is an automated email. Please do not reply.
        </p>
      </td>
    </tr>
  </table>

</body>
</html>
  `.trim();
}

function getExpiryTime(mins) {
  const d = new Date(Date.now() + mins * 60 * 1000);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// ── Plain text fallback ────────────────────────────────
function buildOtpText({ otp, recipient, expiryMins = 5 }) {
  return `
CashBook - Login OTP

Hi ${recipient},

Your One-Time Password (OTP) for CashBook login is:

  ${otp}

This OTP is valid for ${expiryMins} minutes only.

Do NOT share this OTP with anyone. CashBook team kabhi OTP nahi maangti.

If you did not request this, please ignore this email.

-- CashBook Team
  `.trim();
}

// ── Main send function ─────────────────────────────────
async function sendOtpEmail({ to, otp }) {
  const recipient = to;
  const mailOptions = {
    from: `"CashBook" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to,
    subject: `${otp} is your CashBook OTP — valid for 5 minutes`,
    text: buildOtpText({ otp, recipient }),
    html: buildOtpHtml({ otp, recipient }),
  };

  const info = await transporter.sendMail(mailOptions);
  console.log(`[EMAIL] OTP sent to ${to} | MessageId: ${info.messageId}`);
  return info;
}

module.exports = { sendOtpEmail, verifyConnection };
