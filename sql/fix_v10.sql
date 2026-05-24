-- ─── fix_v10.sql ────────────────────────────────────────────────
-- Mapa de salas semanal: substitui a atribuição fixa de sala na
-- tabela classes por uma tabela de agendamento semanal.
--
-- Execute no Supabase SQL Editor.

-- ─── 1. Tabela room_schedules ────────────────────────────────────
CREATE TABLE IF NOT EXISTS room_schedules (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  room_id    UUID        REFERENCES rooms(id)   ON DELETE CASCADE,
  class_id   UUID        REFERENCES classes(id) ON DELETE CASCADE,
  week_start DATE        NOT NULL, -- sempre a segunda-feira da semana
  CONSTRAINT room_schedules_class_week_uniq UNIQUE (class_id, week_start)
);

ALTER TABLE room_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rs_select" ON room_schedules;
DROP POLICY IF EXISTS "rs_all"    ON room_schedules;
CREATE POLICY "rs_select" ON room_schedules FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "rs_all"    ON room_schedules FOR ALL   WITH CHECK (auth.role() = 'authenticated');

-- ─── 2. Migrar atribuições existentes para a semana atual ────────
-- Se alguma turma já tiver room_id preenchido, migra para a semana
-- corrente para não perder a informação.
INSERT INTO room_schedules (room_id, class_id, week_start)
SELECT
  c.room_id,
  c.id,
  -- segunda-feira da semana corrente
  date_trunc('week', CURRENT_DATE)::date
FROM classes c
WHERE c.room_id IS NOT NULL
ON CONFLICT (class_id, week_start) DO NOTHING;

-- ─── Verificação ─────────────────────────────────────────────────
SELECT
  rs.week_start,
  r.name  AS sala,
  co.name AS curso,
  p.name  AS professor
FROM room_schedules rs
JOIN rooms   r  ON r.id  = rs.room_id
JOIN classes cl ON cl.id = rs.class_id
JOIN courses co ON co.id = cl.course_id
JOIN profiles p ON p.id  = cl.teacher_id
ORDER BY rs.week_start, r.sort_order;
