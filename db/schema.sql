-- Run this once on your PostgreSQL / Supabase database

CREATE TABLE IF NOT EXISTS businesses (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  category    TEXT,
  business_type TEXT,
  icon        TEXT DEFAULT '🏢',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cashbooks (
  id          TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id           TEXT PRIMARY KEY,
  book_id      TEXT NOT NULL REFERENCES cashbooks(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('IN','OUT')),
  amount       NUMERIC(15,2) NOT NULL,
  date         DATE NOT NULL,
  party        TEXT,
  remarks      TEXT,
  category     TEXT,
  payment_mode TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parties (
  id          TEXT PRIMARY KEY,
  book_id     TEXT NOT NULL REFERENCES cashbooks(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  mobile      TEXT,
  party_type  TEXT DEFAULT 'Customer',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_cashbooks_business   ON cashbooks(business_id);
CREATE INDEX IF NOT EXISTS idx_transactions_book    ON transactions(book_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date    ON transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_parties_book         ON parties(book_id);
CREATE INDEX IF NOT EXISTS idx_businesses_user      ON businesses(user_id);

CREATE TABLE IF NOT EXISTS categories (
  id          TEXT PRIMARY KEY,
  book_id     TEXT NOT NULL REFERENCES cashbooks(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_modes (
  id          TEXT PRIMARY KEY,
  book_id     TEXT NOT NULL REFERENCES cashbooks(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_book      ON categories(book_id);
CREATE INDEX IF NOT EXISTS idx_payment_modes_book   ON payment_modes(book_id);
