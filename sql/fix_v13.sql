-- ─── fix_v13.sql ─────────────────────────────────────────────────
-- 1. Adiciona coluna payment_method na tabela payments
--    (valores aceitos: pix | cash | debit)
-- 2. Adiciona role 'secretary' no CHECK de profiles
--
-- Execute no Supabase → SQL Editor → Run.
-- ─────────────────────────────────────────────────────────────────

-- 1. Adicionar coluna payment_method em payments (idempotente)
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_method TEXT
  CHECK (payment_method IN ('pix', 'cash', 'debit'));

-- 2. Remover constraint antiga de role e recriar incluindo 'secretary'
--    (o nome pode variar — o DROP IF EXISTS é seguro mesmo que não exista)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'teacher', 'financial', 'secretary'));
