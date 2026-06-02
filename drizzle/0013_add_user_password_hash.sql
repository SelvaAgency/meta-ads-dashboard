-- Add passwordHash column to users table for local email/password authentication.
-- Replaces the Manus OAuth flow.
ALTER TABLE users ADD COLUMN passwordHash VARCHAR(255) NULL AFTER email;
