-- Add session_time column to evolutions table
ALTER TABLE evolutions ADD COLUMN IF NOT EXISTS session_time TEXT;
