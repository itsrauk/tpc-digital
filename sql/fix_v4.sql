-- ============================================================
-- TPC Digital — Fix v4
-- Execute no SQL Editor do Supabase
-- ============================================================

-- ─── 1. Constraint para upsert de frequência ─────────────────
-- Sem este constraint, "Registrar Frequencia" falha silenciosamente
ALTER TABLE attendance
  DROP CONSTRAINT IF EXISTS attendance_enrollment_date_key;

ALTER TABLE attendance
  ADD CONSTRAINT attendance_enrollment_date_key
  UNIQUE (enrollment_id, date);

-- ─── 2. Campos extras no perfil dos professores ───────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone          TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cpf            TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birth_date     DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS days_at_school TEXT;

-- ─── 3. Verificação ──────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM information_schema.table_constraints
    WHERE constraint_name = 'attendance_enrollment_date_key') AS constraint_ok,
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'phone') AS phone_col_ok,
  'Fix v4 OK' AS status;
