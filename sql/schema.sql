-- ============================================================
-- TPC Digital - Schema do Banco de Dados (Supabase / PostgreSQL)
-- Execute este script no SQL Editor do painel do Supabase
-- ============================================================

-- Extensão para UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── PERFIS DE USUÁRIO ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('admin', 'teacher')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CURSOS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('regular', 'production')),
  level       INTEGER CHECK (level IN (1, 2, 3) OR level IS NULL),
  workload    INTEGER,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TURMAS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS classes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID REFERENCES courses(id) ON DELETE SET NULL,
  teacher_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  day_of_week TEXT NOT NULL,
  schedule    TIME NOT NULL,
  start_date  DATE,
  end_date    DATE,
  status      TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'finished')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ALUNOS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ra                TEXT UNIQUE NOT NULL,
  name              TEXT NOT NULL,
  email             TEXT,
  birth_date        DATE,
  rg                TEXT,
  cpf               TEXT,
  filiation         TEXT,
  contractor_name   TEXT,
  address           TEXT,
  address_number    TEXT,
  neighborhood      TEXT,
  zip_code          TEXT,
  city              TEXT,
  state             TEXT,
  student_phone     TEXT,
  workplace         TEXT,
  position          TEXT,
  message_phone     TEXT,
  status            TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'graduated')),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── MATRÍCULAS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enrollments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id            UUID REFERENCES students(id) ON DELETE CASCADE,
  class_id              UUID REFERENCES classes(id) ON DELETE SET NULL,
  piece_course          TEXT,
  period                TEXT,
  workload              INTEGER,
  total_value           DECIMAL(10,2) DEFAULT 0,
  discount              DECIMAL(10,2) DEFAULT 0,
  responsible_teacher   TEXT,
  payment_installments  INTEGER DEFAULT 1,
  payment_plan          TEXT,
  status                TEXT DEFAULT 'active' CHECK (status IN ('active', 'finished', 'cancelled')),
  enrolled_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PAGAMENTOS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id       UUID REFERENCES enrollments(id) ON DELETE CASCADE,
  student_id          UUID REFERENCES students(id) ON DELETE CASCADE,
  amount              DECIMAL(10,2) NOT NULL,
  due_date            DATE NOT NULL,
  paid_date           DATE,
  status              TEXT DEFAULT 'pending' CHECK (status IN ('paid', 'pending', 'overdue')),
  observations        TEXT,
  installment_number  INTEGER DEFAULT 1,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── FREQUÊNCIA ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID REFERENCES enrollments(id) ON DELETE CASCADE,
  student_id    UUID REFERENCES students(id) ON DELETE CASCADE,
  class_id      UUID REFERENCES classes(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  status        TEXT DEFAULT 'present' CHECK (status IN ('present', 'absent', 'justified')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ÍNDICES ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_students_ra ON students(ra);
CREATE INDEX IF NOT EXISTS idx_students_name ON students(name);
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_class ON enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_due_date ON payments(due_date);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_classes_teacher ON classes(teacher_id);

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────
ALTER TABLE profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE students    ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance  ENABLE ROW LEVEL SECURITY;

-- Policies: Admin tem acesso total
CREATE POLICY admin_all_profiles    ON profiles    FOR ALL USING (auth.jwt()->>'role' = 'authenticated');
CREATE POLICY admin_all_courses     ON courses     FOR ALL USING (auth.jwt()->>'role' = 'authenticated');
CREATE POLICY admin_all_classes     ON classes     FOR ALL USING (auth.jwt()->>'role' = 'authenticated');
CREATE POLICY admin_all_students    ON students    FOR ALL USING (auth.jwt()->>'role' = 'authenticated');
CREATE POLICY admin_all_enrollments ON enrollments FOR ALL USING (auth.jwt()->>'role' = 'authenticated');
CREATE POLICY admin_all_payments    ON payments    FOR ALL USING (auth.jwt()->>'role' = 'authenticated');
CREATE POLICY admin_all_attendance  ON attendance  FOR ALL USING (auth.jwt()->>'role' = 'authenticated');

-- ─── DADOS INICIAIS ──────────────────────────────────────────
INSERT INTO courses (name, type, level, workload) VALUES
  ('Nível I - Teatro',    'regular',    1, 120),
  ('Nível II - Teatro',   'regular',    2, 120),
  ('Nível III - Teatro',  'regular',    3, 120),
  ('Curso Infantil',      'production', NULL, 80)
ON CONFLICT DO NOTHING;

-- ─── FUNÇÃO: Gerar RA automático ─────────────────────────────
CREATE OR REPLACE FUNCTION generate_ra() RETURNS TEXT AS $$
DECLARE
  year_part TEXT := EXTRACT(YEAR FROM NOW())::TEXT;
  seq_num   INTEGER;
  ra_val    TEXT;
BEGIN
  SELECT COUNT(*) + 1 INTO seq_num FROM students
  WHERE ra LIKE year_part || '%';
  ra_val := year_part || LPAD(seq_num::TEXT, 4, '0');
  RETURN ra_val;
END;
$$ LANGUAGE plpgsql;

-- ─── TRIGGER: Auto RA no INSERT de aluno ─────────────────────
CREATE OR REPLACE FUNCTION auto_set_ra() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ra IS NULL OR NEW.ra = '' THEN
    NEW.ra := generate_ra();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER before_insert_student
  BEFORE INSERT ON students
  FOR EACH ROW EXECUTE FUNCTION auto_set_ra();
