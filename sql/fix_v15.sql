-- ─── fix_v15.sql ─────────────────────────────────────────────────
-- Cria função generate_student_ra() para RA automático no formato:
--   YYYYMM + sequencial de 2 dígitos por mês
--   Ex: 20260501 (maio/2026, 1º aluno do mês)
--       20260502 (maio/2026, 2º aluno do mês)
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

  -- Maior sequencial já existente para este mês (exatamente 8 dígitos)
  -- Considera tanto RAs novos (202605NN) quanto antigos (20260NNN) que
  -- eventualmente coincidam com o prefixo
  SELECT COALESCE(
    MAX(SUBSTRING(ra FROM 7 FOR 2)::INT), 0
  ) + 1
  INTO v_seq
  FROM students
  WHERE LENGTH(ra) = 8
    AND ra ~ ('^' || v_prefix || '[0-9]{2}$');

  RETURN v_prefix || LPAD(v_seq::TEXT, 2, '0');
END;
$$;

-- Permite que usuários autenticados chamem a função
GRANT EXECUTE ON FUNCTION generate_student_ra() TO authenticated;

-- Verificação:
-- SELECT generate_student_ra();
