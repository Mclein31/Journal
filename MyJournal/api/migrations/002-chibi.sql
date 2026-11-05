-- Additive: the user's customized login chibi (validated JSON, small).
ALTER TABLE journal_account_state ADD COLUMN IF NOT EXISTS chibi jsonb;
