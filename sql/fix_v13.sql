-- ─── fix_v13.sql ─────────────────────────────────────────────────
-- 1. Adiciona coluna payment_method na tabela payments
--    (valores aceitos: pix | cash | debit)
-- 2. Adiciona role 'secretary' no CHECK de profiles.role
--
-- Execute no Supabase → SQL Editor → Run.
-- ─────────────────────────────────────────────────────────────────

-- ─── 1. Coluna payment_method em payments ─────────────────────────
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_method TEXT
  CHECK (payment_method IN ('pix', 'cash', 'debit'));


-- ─── 2. Role 'secretary' em profiles ──────────────────────────────
-- Encontra e remove TODOS os CHECK constraints que mencionam "role"
-- na tabela profiles (independente do nome gerado).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc
      ON tc.constraint_schema = cc.constraint_schema
     AND tc.constraint_name   = cc.constraint_name
    WHERE tc.table_name       = 'profiles'
      AND tc.constraint_type  = 'CHECK'
      AND cc.check_clause     ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE profiles DROP CONSTRAINT IF EXISTS %I', r.constraint_name);
    RAISE NOTICE 'Removido constraint: %', r.constraint_name;
  END LOOP;
END;
$$;

-- Recria o constraint incluindo 'secretary'
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'teacher', 'financial', 'secretary'));


-- ─── Verificação ───────────────────────────────────────────────────
-- Rode as queries abaixo para confirmar que tudo foi aplicado:

-- Confirma coluna payment_method:
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'payments' AND column_name = 'payment_method';

-- Confirma constraint de role:
-- SELECT constraint_name, check_clause
-- FROM information_schema.check_constraints
-- WHERE constraint_name ILIKE '%role%';
