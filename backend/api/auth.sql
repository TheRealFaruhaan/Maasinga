-- Maasinga logins. Kept in its own schema so that seed.py (which drops the "maasinga" schema) never removes users.
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  username      text PRIMARY KEY,
  password_hash text NOT NULL,        -- scrypt, see app/auth.py
  role          text NOT NULL CHECK (role IN ('policy', 'admin')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
