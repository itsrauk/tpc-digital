-- ─── fix_v5.sql ─────────────────────────────────────────────────
-- Execute no Supabase SQL Editor

-- 1. Tabela de histórico/audit log
CREATE TABLE IF NOT EXISTS audit_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ DEFAULT now(),
  user_id      UUID,
  user_name    TEXT,
  action_type  TEXT        NOT NULL,
  entity_type  TEXT,
  entity_id    TEXT,
  entity_name  TEXT,
  description  TEXT
);

-- RLS: autenticados podem ler e inserir
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs;

CREATE POLICY "audit_logs_select" ON audit_logs
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "audit_logs_insert" ON audit_logs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 2. Categoria nos pagamentos (mensalidade, apostila, material, outro)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'mensalidade';

-- 3. Campo de observações no aluno
ALTER TABLE students ADD COLUMN IF NOT EXISTS notes TEXT;

-- Verificação
SELECT 'audit_logs OK' AS status
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs');

SELECT 'payments.category OK' AS status
WHERE EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'category');
