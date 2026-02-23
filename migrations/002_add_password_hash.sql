-- Migration 002: Add password_hash to people_auth
-- Switches auth from magic-link to email + password.
-- Run once against the tax-paladin database.

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE  TABLE_NAME  = 'people_auth'
  AND    COLUMN_NAME = 'password_hash'
)
BEGIN
  -- Add with a temporary default so the NOT NULL constraint is satisfied
  -- for any existing rows, then drop the default.
  ALTER TABLE people_auth
    ADD password_hash VARCHAR(255) NOT NULL
    CONSTRAINT DF_people_auth_password_hash DEFAULT '';

  ALTER TABLE people_auth
    DROP CONSTRAINT DF_people_auth_password_hash;

  PRINT 'Added password_hash column to people_auth.';
END
ELSE
  PRINT 'password_hash column already exists — skipped.';
GO
