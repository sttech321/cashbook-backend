const nodemailer = require('nodemailer');

// ── Startup diagnostics ──
console.log('[EMAIL-CONFIG] ──────────────────────────────────────');
console.log('[EMAIL-CONFIG] RESEND_API_KEY:', process.env.RESEND_API_KEY ? `SET (${process.env.RESEND_API_KEY.slice(0,8)}...)` : '❌ NOT SET');
console.log('[EMAIL-CONFIG] RESEND_FROM:   ', process.env.RESEND_FROM || '(not set — will use onboarding@resend.dev)');
console.log('[EMAIL-CONFIG] SMTP_HOST:     ', process.env.SMTP_HOST || '(not set)');
console.log('[EMAIL-CONFIG] SMTP_PORT:     ', process.env.SMTP_PORT || '(not set)');
console.log('[EMAIL-CONFIG] SMTP_USER:     ', process.env.SMTP_USER ? `SET (${process.env.SMTP_USER})` : '❌ NOT SET');
console.log('[EMAIL-CONFIG] SMTP_PASS:     ', process.env.SMTP_PASS ? 'SET (****)' : '❌ NOT SET');
console.log('[EMAIL-CONFIG] NODE_ENV:      ', process.env.NODE_ENV || '(not set)');

// ── Resend API (production — uses HTTPS, works on Render) ──
const useResend = !!process.env.RESEND_API_KEY;
let resend = null;
if (useResend) {
  const { Resend } = require('resend');
  resend = new Resend(process.env.RESEND_API_KEY);
  console.log('[EMAIL-CONFIG] ✅ Mode: RESEND API (HTTPS — works on Render)');
} else {
  console.log('[EMAIL-CONFIG] ⚠️  Mode: SMTP (port 587 — BLOCKED on Render!)');
  console.log('[EMAIL-CONFIG] 💡 To fix on Render: add RESEND_API_KEY env var');
}
console.log('[EMAIL-CONFIG] ──────────────────────────────────────');

// ── SMTP Transporter (local dev — Gmail App Password) ──
let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: { rejectUnauthorized: false },
  });
  return transporter;
}

// ── Connection verify on startup ───────────────────────
async function verifyConnection() {
  if (useResend) {
    console.log('✅ Resend email service ready (HTTPS API — production mode)');
    return;
  }
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('❌ No email service configured!');
    console.warn('   → For Render/production: set RESEND_API_KEY env var');
    console.warn('   → For local dev: set SMTP_USER + SMTP_PASS env vars');
    return;
  }
  try {
    await getTransporter().verify();
    console.log('✅ SMTP email service ready (local dev mode)');
  } catch (err) {
    console.warn('⚠️  SMTP verify failed:', err.message);
    if (err.message.includes('ENETUNREACH') || err.message.includes('ETIMEDOUT') || err.message.includes('Connection timeout')) {
      console.warn('   🚫 SMTP port 587 is BLOCKED on this server (Render blocks SMTP)');
      console.warn('   💡 Fix: Set RESEND_API_KEY env var in Render dashboard → Environment');
    }
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
                Your Login OTP
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
                        <td style="font-size:18px;vertical-align:top;padding-right:10px;">&#9201;</td>
                        <td style="font-size:13px;color:#92400E;line-height:1.6;">
                          <strong>Valid for ${expiryMins} minutes only.</strong><br/>
                          Please do not share this OTP with anyone.
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
                        <td style="font-size:18px;vertical-align:top;padding-right:10px;">&#128737;</td>
                        <td style="font-size:13px;color:#991B1B;line-height:1.6;">
                          <strong>Security Alert:</strong> CashBook kabhi bhi aapka OTP phone, email ya
                          WhatsApp pe nahi maangega. Kisi ke saath share mat karo.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

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
                &copy; 2024 CashBook &mdash; Powered by OBOPAY
              </p>
              <p style="font-size:11px;color:#D1D5DB;margin:0;">
                <a href="#" style="color:#D1D5DB;text-decoration:none;">Privacy Policy</a> &nbsp;&bull;&nbsp;
                <a href="#" style="color:#D1D5DB;text-decoration:none;">Terms of Service</a>
              </p>
            </td>
          </tr>

        </table>

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

function buildOtpText({ otp, recipient, expiryMins = 5 }) {
  return `CashBook - Login OTP\n\nHi ${recipient},\n\nYour OTP: ${otp}\n\nValid for ${expiryMins} minutes. Do NOT share this OTP.\n\n-- CashBook Team`.trim();
}

// ── Main send function ─────────────────────────────────
async function sendOtpEmail({ to, otp }) {
  console.log(`[EMAIL] ── Sending OTP to: ${to} ──`);
  console.log(`[EMAIL] Method: ${useResend ? 'RESEND API (HTTPS)' : 'SMTP (port 587)'}`);

  const recipient = to;
  const subject   = `${otp} is your CashBook OTP — valid for 5 minutes`;
  const text      = buildOtpText({ otp, recipient });
  const html      = buildOtpHtml({ otp, recipient });

  // ── Production: Resend API (HTTPS — works on Render) ──
  if (useResend) {
    const fromAddr = process.env.RESEND_FROM || 'onboarding@resend.dev';
    console.log(`[EMAIL] Resend from: ${fromAddr} → to: ${to}`);
    try {
      const { data, error } = await resend.emails.send({
        from: `CashBook <${fromAddr}>`,
        to: [to],
        subject,
        text,
        html,
      });
      if (error) {
        const isSandbox = error.message && error.message.includes('only send testing emails');
        if (isSandbox) {
          console.warn(`[EMAIL] ⚠️  Resend sandbox restriction — falling back to SMTP for ${to}`);
          // fall through to SMTP below
        } else {
          console.error(`[EMAIL] ❌ Resend API error:`, JSON.stringify(error));
          throw new Error(error.message || 'Resend API error');
        }
      } else {
        console.log(`[EMAIL] ✅ OTP sent via Resend to ${to} | Id: ${data.id}`);
        return data;
      }
    } catch (err) {
      const isSandbox = err.message && err.message.includes('only send testing emails');
      if (isSandbox) {
        console.warn(`[EMAIL] ⚠️  Resend sandbox restriction — falling back to SMTP for ${to}`);
        // fall through to SMTP below
      } else {
        console.error(`[EMAIL] ❌ Resend send failed:`, err.message);
        throw err;
      }
    }
  }

  // ── SMTP fallback: Gmail App Password (works for all recipients) ──
  console.log(`[EMAIL] SMTP → ${process.env.SMTP_HOST}:${process.env.SMTP_PORT} (user: ${process.env.SMTP_USER})`);
  try {
    const info = await getTransporter().sendMail({
      from: `"CashBook" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to,
      subject,
      text,
      html,
    });
    console.log(`[EMAIL] ✅ OTP sent via SMTP to ${to} | MessageId: ${info.messageId}`);
    return info;
  } catch (err) {
    console.error(`[EMAIL] ❌ SMTP send failed:`, err.message);
    if (err.message.includes('ENETUNREACH') || err.message.includes('ETIMEDOUT') || err.message.includes('Connection timeout')) {
      console.error(`[EMAIL] 🚫 SMTP port is BLOCKED on this server!`);
      console.error(`[EMAIL] 💡 Fix: Add RESEND_API_KEY to Render Environment variables`);
      console.error(`[EMAIL]    1. Go to resend.com → Sign up → Get API key`);
      console.error(`[EMAIL]    2. Render Dashboard → Environment → Add RESEND_API_KEY=re_xxxxx`);
      console.error(`[EMAIL]    3. Redeploy`);
      throw new Error('Email failed: SMTP blocked on this server. Configure RESEND_API_KEY for production.');
    }
    throw err;
  }
}

module.exports = { sendOtpEmail, verifyConnection };
