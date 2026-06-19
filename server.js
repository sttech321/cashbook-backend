require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const { execSync } = require('child_process');
const { syncAll }  = require('./models');
const { verifyConnection } = require('./services/emailService');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'https://cashbook-mykd.onrender.com',
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Routes ────────────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/businesses', require('./routes/businesses'));
app.use('/api/businesses/:businessId/cashbooks',                              require('./routes/cashbooks'));
app.use('/api/businesses/:businessId/cashbooks/:bookId/transactions',         require('./routes/transactions'));
app.use('/api/businesses/:businessId/cashbooks/:bookId/parties',              require('./routes/parties'));
app.use('/api/businesses/:businessId/cashbooks/:bookId/members',              require('./routes/members'));
app.use('/api/users',      require('./routes/users'));
app.use('/api/businesses/:businessId/team', require('./routes/businessTeam'));

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), version: '1.0.0' });
});

// ── 404 / Error handlers ──────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `${req.method} ${req.path} not found` }));
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Startup: sync DB models first, then listen ────────────────
async function start() {
  try {
    await syncAll();           // create tables + seed roles
  } catch (err) {
    console.error('[startup] DB sync failed:', err.message);
    process.exit(1);
  }

  // SMTP verify — best-effort, never blocks server startup
  verifyConnection().catch(err =>
    console.warn('[startup] SMTP check failed (non-fatal):', err.message)
  );

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n[server] CashBook API → http://0.0.0.0:${PORT}`);
    console.log(`[server] Health     → http://0.0.0.0:${PORT}/api/health\n`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[server] Port ${PORT} in use — killing existing process...`);
      try {
        const out    = execSync(`netstat -ano | findstr :${PORT} | findstr LISTENING`, { encoding: 'utf8' });
        const oldPid = out.trim().split(/\s+/).pop();
        if (oldPid && !isNaN(oldPid)) {
          execSync(`taskkill /F /PID ${oldPid}`);
          console.log(`[server] Killed PID ${oldPid}. Retrying in 1s...`);
          setTimeout(() => server.listen(PORT), 1000);
        }
      } catch {
        console.error(`[server] Could not free port ${PORT}. Close it manually.`);
        process.exit(1);
      }
    } else {
      throw err;
    }
  });
}

start();
