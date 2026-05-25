-- ─── fix_v14.sql ─────────────────────────────────────────────────
-- Adiciona coluna created_at na tabela enrollments.
-- Necessário para o filtro "Matrículas de Hoje" no Dashboard.
--
-- Efeito em registros existentes: receberão o timestamp atual
-- como data de criação (sem histórico retroativo).
-- Novas matrículas terão o timestamp correto automaticamente.
--
-- Execute no Supabase → SQL Editor → Run.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Confirmar:
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'enrollments' AND column_name = 'created_at';
