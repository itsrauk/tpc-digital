-- ============================================================
-- TPC Digital — Fix v3
-- Execute no SQL Editor do Supabase
-- ============================================================

-- ─── 1. Novos campos em enrollments ──────────────────────────
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS period_start TEXT;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS period_end   TEXT;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS workload_label TEXT;

-- ─── 2. Confirmar que discount_amount existe em payments ──────
ALTER TABLE payments ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0;

-- ─── 3. Re-aplicar RLS (idempotente) ─────────────────────────
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['profiles','courses','classes','students','enrollments','payments','attendance','teacher_invites'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS auth_all ON %I', tbl);
  END LOOP;

  -- Tabelas principais: apenas autenticados
  FOREACH tbl IN ARRAY ARRAY['profiles','courses','classes','students','enrollments','payments','attendance'] LOOP
    EXECUTE format(
      'CREATE POLICY auth_all ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', tbl
    );
  END LOOP;

  -- teacher_invites: leitura pública (necessário para /register.html), escrita autenticada
  EXECUTE 'DROP POLICY IF EXISTS read_invites  ON teacher_invites';
  EXECUTE 'DROP POLICY IF EXISTS write_invites ON teacher_invites';
  EXECUTE 'CREATE POLICY read_invites  ON teacher_invites FOR SELECT USING (true)';
  EXECUTE 'CREATE POLICY write_invites ON teacher_invites FOR ALL TO authenticated USING (true) WITH CHECK (true)';
END $$;

-- ─── 4. WORKAROUND: cadastrar professor sem e-mail ────────────
-- Se você ainda não consegue criar professor pelo sistema,
-- use esta query substituindo os valores:
--
-- INSERT INTO profiles (id, name, role)
-- VALUES ('<UUID-do-auth-user>', 'Nome do Professor', 'teacher');
--
-- Para obter o UUID: Supabase → Authentication → Users → copie o "User UID"
-- Se quiser cadastrar o próprio admin também como professor temporário:
-- UPDATE profiles SET role = 'admin' WHERE id = '<seu-uuid>';
-- (isso não remove o acesso de admin, o campo role pode ser estendido)
--
-- ALTERNATIVA SIMPLES (adiciona um professor fictício para teste):
-- Este INSERT usa um UUID gerado aleatoriamente (NÃO vinculado a auth.users)
-- Funciona apenas se removermos a FK — veja abaixo se precisar.

-- ─── 5. DESABILITAR confirmação de e-mail (Rate Limit) ───────
-- Isso NÃO é feito por SQL — deve ser feito no painel:
-- Supabase Dashboard → Authentication → Providers → Email
-- → desmarque "Confirm email" → Save
-- Após isso, professores se cadastram em /register.html sem aguardar e-mail.

-- ─── 6. Verificação ──────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM students)      AS alunos,
  (SELECT COUNT(*) FROM profiles)      AS perfis,
  (SELECT COUNT(*) FROM courses)       AS cursos,
  (SELECT COUNT(*) FROM teacher_invites WHERE used = false) AS convites_pendentes,
  'Fix v3 OK'                          AS status;
