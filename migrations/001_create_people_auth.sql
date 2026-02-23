-- Migration 001: Create people_auth table
-- Supports email verification and magic-link (passwordless) login.
-- Run once against the tax-paladin database.

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'people_auth'
)
BEGIN
  CREATE TABLE people_auth (
    sui              INT          NOT NULL,
    email_verified   BIT          NOT NULL DEFAULT 0,
    token            VARCHAR(255) NULL,           -- active one-time token
    token_type       VARCHAR(20)  NULL,           -- 'verify' | 'login'
    token_expires    DATETIME     NULL,
    CONSTRAINT PK_people_auth        PRIMARY KEY (sui),
    CONSTRAINT FK_people_auth_people FOREIGN KEY (sui) REFERENCES people(sui)
  );
  PRINT 'Created people_auth table.';
END
ELSE
  PRINT 'people_auth table already exists — skipped.';
GO
