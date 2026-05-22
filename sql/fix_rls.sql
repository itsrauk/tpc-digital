-- ============================================================
-- EXECUTE ESTE SCRIPT NO SQL EDITOR DO SUPABASE
-- Corrige as políticas RLS e adiciona coluna de desconto
-- ============================================================

-- ─── 1. Remover policies antigas (incorretas) ────────────────
DROP POLICY IF EXISTS admin_all_profiles    ON profiles;
DROP POLICY IF EXISTS admin_all_courses     ON courses;
DROP POLICY IF EXISTS admin_all_classes     ON classes;
DROP POLICY IF EXISTS admin_all_students    ON students;
DROP POLICY IF EXISTS admin_all_enrollments ON enrollments;
DROP POLICY IF EXISTS admin_all_payments    ON payments;
DROP POLICY IF EXISTS admin_all_attendance  ON attendance;

-- ─── 2. Criar policies corretas (com WITH CHECK para INSERT) ─
CREATE POLICY auth_all ON profiles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY auth_all ON courses
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY auth_all ON classes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY auth_all ON students
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY auth_all ON enrollments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY auth_all ON payments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY auth_all ON attendance
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── 3. Adicionar coluna de desconto por parcela ─────────────
-- Armazena o desconto por parcela (ex: R$ 70).
-- amount  = valor COM desconto (ex: R$ 180) — pago até dia 12
-- amount + discount_amount = valor INTEGRAL (ex: R$ 250)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0;

-- ─── Verificação ─────────────────────────────────────────────
SELECT 'Policies corrigidas e coluna discount_amount adicionada.' AS status;
