-- ─── fix_v9.sql ─────────────────────────────────────────────────
-- Corrige seed_sandbox() e reset_sandbox() (referência inválida a
-- room_bookings.class_id que não existe) e recarrega o schema cache
-- do PostgREST para que db.rpc('seed_sandbox') funcione no app.
--
-- Execute no Supabase SQL Editor.

-- ─── 0. Colunas is_sandbox (podem ter revertido junto com fix_v8) ─
ALTER TABLE students    ADD COLUMN IF NOT EXISTS is_sandbox BOOLEAN DEFAULT false;
ALTER TABLE courses     ADD COLUMN IF NOT EXISTS is_sandbox BOOLEAN DEFAULT false;
ALTER TABLE classes     ADD COLUMN IF NOT EXISTS is_sandbox BOOLEAN DEFAULT false;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS is_sandbox BOOLEAN DEFAULT false;

-- ─── 1. Tabela attendance (se ainda não existir) ─────────────────
CREATE TABLE IF NOT EXISTS attendance (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ DEFAULT now(),
  class_id         UUID        REFERENCES classes(id),
  student_id       UUID        REFERENCES students(id),
  enrollment_id    UUID        REFERENCES enrollments(id),
  date             DATE        NOT NULL,
  status           TEXT        CHECK (status IN ('present','absent','late','justified')),
  notes            TEXT,
  recorded_by      UUID,
  recorded_by_name TEXT
);

ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "att_select" ON attendance;
DROP POLICY IF EXISTS "att_all"    ON attendance;
CREATE POLICY "att_select" ON attendance FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "att_all"    ON attendance FOR ALL   WITH CHECK (auth.role() = 'authenticated');

DROP INDEX IF EXISTS attendance_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS attendance_uniq ON attendance (enrollment_id, date);

-- ─── 2. Função seed_sandbox() corrigida ─────────────────────────
CREATE OR REPLACE FUNCTION seed_sandbox() RETURNS TEXT AS $$
DECLARE
  v_teacher1    UUID;
  v_teacher2    UUID;
  v_course1     UUID := 'c1000001-0000-4000-8000-000000000001';
  v_course2     UUID := 'c1000002-0000-4000-8000-000000000002';
  v_class1      UUID := 'b1000001-0000-4000-8000-000000000001';
  v_class2      UUID := 'b1000002-0000-4000-8000-000000000002';
  v_s1          UUID := 'a1000001-0000-4000-8000-000000000001';
  v_s2          UUID := 'a1000002-0000-4000-8000-000000000002';
  v_s3          UUID := 'a1000003-0000-4000-8000-000000000003';
  v_s4          UUID := 'a1000004-0000-4000-8000-000000000004';
  v_s5          UUID := 'a1000005-0000-4000-8000-000000000005';
  v_s6          UUID := 'a1000006-0000-4000-8000-000000000006';
  v_room_mp     UUID;
  v_room_stan   UUID;
BEGIN
  -- ── Limpeza prévia (room_bookings não tem class_id — seed não cria reservas)
  DELETE FROM attendance           WHERE class_id IN (v_class1, v_class2);
  DELETE FROM room_change_requests WHERE class_id IN (v_class1, v_class2);
  DELETE FROM enrollments  WHERE is_sandbox = true;
  DELETE FROM classes      WHERE is_sandbox = true;
  DELETE FROM students     WHERE is_sandbox = true;
  DELETE FROM courses      WHERE is_sandbox = true;

  -- ── Encontrar professores existentes ──────────────────────────
  SELECT id INTO v_teacher1
    FROM profiles WHERE role = 'teacher' ORDER BY created_at LIMIT 1;

  SELECT id INTO v_teacher2
    FROM profiles WHERE role = 'teacher' ORDER BY created_at OFFSET 1 LIMIT 1;

  -- Fallback: usa o admin se não houver professores suficientes
  IF v_teacher1 IS NULL THEN
    SELECT id INTO v_teacher1 FROM profiles ORDER BY created_at LIMIT 1;
  END IF;
  IF v_teacher2 IS NULL THEN
    v_teacher2 := v_teacher1;
  END IF;

  -- ── Salas (pega IDs se existirem) ─────────────────────────────
  SELECT id INTO v_room_mp   FROM rooms WHERE name = 'Martins Pena' LIMIT 1;
  SELECT id INTO v_room_stan FROM rooms WHERE name = 'Stanislavski'  LIMIT 1;

  -- ── Cursos de teste ───────────────────────────────────────────
  INSERT INTO courses (id, name, type, level, workload, is_sandbox) VALUES
    (v_course1, '[TESTE] Basico de Teatro',   'regular',    1,    120, true),
    (v_course2, '[TESTE] Peca de Verao 2026', 'production', null,  80, true)
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name, is_sandbox = true;

  -- ── Turmas de teste ───────────────────────────────────────────
  INSERT INTO classes (id, course_id, teacher_id, day_of_week, schedule,
                       start_date, status, room_id, room_name, is_sandbox) VALUES
    (v_class1, v_course1, v_teacher1, 'tuesday',  '19:00:00',
     '2026-01-01', 'active', v_room_mp,   'Martins Pena', true),
    (v_class2, v_course2, v_teacher2, 'thursday', '18:00:00',
     '2026-01-01', 'active', v_room_stan, 'Stanislavski',  true)
  ON CONFLICT (id) DO UPDATE
    SET teacher_id = EXCLUDED.teacher_id,
        room_id    = EXCLUDED.room_id,
        room_name  = EXCLUDED.room_name,
        is_sandbox = true;

  -- ── Alunos fictícios ─────────────────────────────────────────
  INSERT INTO students (id, ra, name, status, is_sandbox) VALUES
    (v_s1, '2026TS001', '[TESTE] Ana Silva',      'active', true),
    (v_s2, '2026TS002', '[TESTE] Bruno Oliveira', 'active', true),
    (v_s3, '2026TS003', '[TESTE] Carla Mendes',   'active', true),
    (v_s4, '2026TS004', '[TESTE] Diego Ferreira', 'active', true),
    (v_s5, '2026TS005', '[TESTE] Eva Costa',      'active', true),
    (v_s6, '2026TS006', '[TESTE] Felipe Santos',  'active', true)
  ON CONFLICT (id) DO NOTHING;

  -- ── Matrículas ────────────────────────────────────────────────
  INSERT INTO enrollments (student_id, class_id, piece_course, status,
                           total_value, payment_installments, is_sandbox) VALUES
    (v_s1, v_class1, '[TESTE] Basico de Teatro',   'active', 1200, 12, true),
    (v_s2, v_class1, '[TESTE] Basico de Teatro',   'active', 1200, 12, true),
    (v_s3, v_class1, '[TESTE] Basico de Teatro',   'active', 1200, 12, true),
    (v_s4, v_class2, '[TESTE] Peca de Verao 2026', 'active',  800,  8, true),
    (v_s5, v_class2, '[TESTE] Peca de Verao 2026', 'active',  800,  8, true),
    (v_s6, v_class2, '[TESTE] Peca de Verao 2026', 'active',  800,  8, true)
  ON CONFLICT DO NOTHING;

  RETURN 'Sandbox criado: 2 turmas, 6 alunos, salas atribuidas.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 2. Função reset_sandbox() corrigida ────────────────────────
CREATE OR REPLACE FUNCTION reset_sandbox() RETURNS TEXT AS $$
DECLARE
  sandbox_class_ids UUID[];
BEGIN
  SELECT ARRAY(SELECT id FROM classes WHERE is_sandbox = true)
    INTO sandbox_class_ids;

  DELETE FROM attendance
    WHERE class_id = ANY(sandbox_class_ids);

  -- room_bookings não tem class_id; seed não cria reservas
  DELETE FROM room_change_requests
    WHERE class_id = ANY(sandbox_class_ids);

  DELETE FROM enrollments  WHERE is_sandbox = true;
  DELETE FROM classes      WHERE is_sandbox = true;
  DELETE FROM students     WHERE is_sandbox = true;
  DELETE FROM courses      WHERE is_sandbox = true;

  RETURN (SELECT seed_sandbox());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 3. Recarregar schema cache do PostgREST ────────────────────
NOTIFY pgrst, 'reload schema';

-- ─── 4. Semear agora ────────────────────────────────────────────
SELECT seed_sandbox();

-- ─── 5. Verificação ─────────────────────────────────────────────
SELECT 'students'    AS tabela, COUNT(*) FILTER (WHERE is_sandbox) AS sandbox FROM students
UNION ALL
SELECT 'classes',      COUNT(*) FILTER (WHERE is_sandbox) FROM classes
UNION ALL
SELECT 'enrollments',  COUNT(*) FILTER (WHERE is_sandbox) FROM enrollments;
