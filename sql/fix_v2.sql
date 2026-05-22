-- ============================================================
-- TPC Digital — Fix v2
-- Execute no SQL Editor do Supabase
-- ============================================================

-- ─── 1. Corrigir tipos de curso (adicionar 'infantil') ───────
ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_type_check;
ALTER TABLE courses ADD CONSTRAINT courses_type_check
  CHECK (type IN ('regular', 'infantil', 'production'));

-- Suportar nível 4 (infantil tem 4 anos)
ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_level_check;
ALTER TABLE courses ADD CONSTRAINT courses_level_check
  CHECK (level IN (1, 2, 3, 4) OR level IS NULL);

-- ─── 2. Limpar seed antigo e inserir cursos corretos ─────────
DELETE FROM courses WHERE name = 'Curso Infantil';

INSERT INTO courses (name, type, level, workload) VALUES
  ('Nivel I - Teatro',      'regular',  1, 120),
  ('Nivel II - Teatro',     'regular',  2, 120),
  ('Nivel III - Teatro',    'regular',  3, 120),
  ('Infantil - 1 Ano',      'infantil', 1,  80),
  ('Infantil - 2 Ano',      'infantil', 2,  80),
  ('Infantil - 3 Ano',      'infantil', 3,  80),
  ('Infantil - 4 Ano',      'infantil', 4,  80)
ON CONFLICT DO NOTHING;

-- Nota: Producoes (pecas de teatro) sao criadas livremente
-- pela direcao pelo formulario de turma — nao sao pre-cadastradas.

-- ─── 3. Tabela de convites de professores ────────────────────
-- Admin convida professores por e-mail; eles se cadastram em /register.html
CREATE TABLE IF NOT EXISTS teacher_invites (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT UNIQUE NOT NULL,
  name       TEXT NOT NULL,
  used       BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE teacher_invites ENABLE ROW LEVEL SECURITY;

-- Qualquer pessoa pode ler (necessário para validar e-mail no cadastro)
DROP POLICY IF EXISTS read_invites  ON teacher_invites;
DROP POLICY IF EXISTS write_invites ON teacher_invites;

CREATE POLICY read_invites  ON teacher_invites FOR SELECT USING (true);
CREATE POLICY write_invites ON teacher_invites FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── 4. (Re)aplicar RLS correto em todas as tabelas ──────────
-- Garante que INSERT funciona (WITH CHECK obrigatório)

DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY['profiles','courses','classes','students','enrollments','payments','attendance'];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    EXECUTE format('DROP POLICY IF EXISTS auth_all      ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS admin_all_%s  ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY auth_all ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      tbl
    );
  END LOOP;
END $$;

-- ─── 5. Verificação final ─────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM courses)          AS total_cursos,
  (SELECT COUNT(*) FROM teacher_invites)  AS total_convites,
  'Fix v2 aplicado com sucesso!'          AS status;
