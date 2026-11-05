CREATE TABLE IF NOT EXISTS journal_account_state (
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  deleting boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS journal_books (
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  id text NOT NULL,
  doc jsonb NOT NULL,
  bookmark jsonb,
  version integer NOT NULL DEFAULT 1,
  mutation_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
CREATE TABLE IF NOT EXISTS journal_assets (
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  id text NOT NULL,
  meta jsonb NOT NULL,
  bytes bigint NOT NULL CHECK (bytes > 0 AND bytes <= 10485760),
  r2_key text NOT NULL UNIQUE,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'ready')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS journal_books_updated ON journal_books (user_id, updated_at DESC);
