-- 024_user_bio_birthday.sql — Telegram-style profile fields
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS bio varchar(140),
  ADD COLUMN IF NOT EXISTS birthday date;
