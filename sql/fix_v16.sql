-- ─── fix_v16.sql ─────────────────────────────────────────────────
-- Atualiza função generate_student_ra() para sequencial de 3 dígitos.
-- Novo formato: YYYYMMNNN (9 dígitos)
--   Ex: 202605001 (maio/2026, 1º aluno)
--       202605430 (maio/2026, 430º aluno)
--       202606001 (junho/2026, 1º aluno)
--
-- Aguenta até 999 alunos por mês — suficiente para importação em massa
-- e uso contínuo do sistema.
--
-- Execute no Supabase → SQL Editor → Run.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_student_ra()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_prefix TEXT;
  v_seq    INT;
BEGIN
  -- Prefixo YYYYMM no fuso de São Paulo
  v_prefix := TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo', 'YYYYMM');

  -- Maior sequencial já existente para este mês (exatamente 9 dígitos)
  SELECT COALESCE(
    MAX(SUBSTRING(ra FROM 7 FOR 3)::INT), 0
  ) + 1
  INTO v_seq
  FROM students
  WHERE LENGTH(ra) = 9
    AND ra ~ ('^' || v_prefix || '[0-9]{3}$');

  RETURN v_prefix || LPAD(v_seq::TEXT, 3, '0');
END;
$$;

-- Permite que usuários autenticados chamem a função
GRANT EXECUTE ON FUNCTION generate_student_ra() TO authenticated;

-- Verificação:
-- SELECT generate_student_ra();
-- Deve retornar algo como 202605001
