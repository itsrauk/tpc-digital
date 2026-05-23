-- ─── fix_v7.sql ─────────────────────────────────────────────────
-- Execute no Supabase SQL Editor
--
-- O que este script faz:
--   1. Adiciona o valor 'financial' ao check de role em profiles
--   2. Refina RLS de students: admin/financial veem tudo,
--      professor vê apenas alunos nas suas turmas
--   3. Refina RLS de enrollments e payments por perfil
--
-- ATENÇÃO: o campo de chave estrangeira do professor em "classes"
-- é assumido como "teacher_id". Se o nome for diferente no seu
-- banco, ajuste as linhas marcadas com "-- ⚠️ ajuste se necessário".

-- ─── 1. Role 'financial' em profiles ────────────────────────────
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'teacher', 'financial'));

-- ─── 2. RLS — students ──────────────────────────────────────────
-- Remove políticas antigas (nomes comuns usados nos scripts anteriores)
DROP POLICY IF EXISTS "students_select"    ON students;
DROP POLICY IF EXISTS "students_insert"    ON students;
DROP POLICY IF EXISTS "students_update"    ON students;
DROP POLICY IF EXISTS "students_delete"    ON students;
DROP POLICY IF EXISTS "select_students"    ON students;
DROP POLICY IF EXISTS "insert_students"    ON students;
DROP POLICY IF EXISTS "update_students"    ON students;
DROP POLICY IF EXISTS "delete_students"    ON students;
DROP POLICY IF EXISTS "Students are visible to authenticated users" ON students;
DROP POLICY IF EXISTS "all_students"       ON students;

-- Admin e financial: veem e manipulam todos os alunos
-- Professor: vê apenas alunos matriculados nas suas turmas
CREATE POLICY "students_select" ON students FOR SELECT USING (
  -- admin e financial veem todos
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'financial')
  )
  OR
  -- professor vê alunos nas suas turmas (via enrollments → classes.teacher_id)
  EXISTS (
    SELECT 1 FROM enrollments e
    JOIN classes c ON c.id = e.class_id
    WHERE e.student_id = students.id
      AND c.teacher_id = auth.uid()  -- ⚠️ ajuste se necessário
  )
);

CREATE POLICY "students_insert" ON students FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'financial')
  )
);

CREATE POLICY "students_update" ON students FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'financial')
  )
  OR
  EXISTS (
    SELECT 1 FROM enrollments e
    JOIN classes c ON c.id = e.class_id
    WHERE e.student_id = students.id
      AND c.teacher_id = auth.uid()  -- ⚠️ ajuste se necessário
  )
);

CREATE POLICY "students_delete" ON students FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- ─── 3. RLS — enrollments ───────────────────────────────────────
DROP POLICY IF EXISTS "enrollments_select" ON enrollments;
DROP POLICY IF EXISTS "enrollments_insert" ON enrollments;
DROP POLICY IF EXISTS "enrollments_update" ON enrollments;
DROP POLICY IF EXISTS "enrollments_delete" ON enrollments;
DROP POLICY IF EXISTS "all_enrollments"    ON enrollments;

CREATE POLICY "enrollments_select" ON enrollments FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'financial')
  )
  OR
  -- professor vê matrículas das suas turmas
  EXISTS (
    SELECT 1 FROM classes c
    WHERE c.id = enrollments.class_id
      AND c.teacher_id = auth.uid()  -- ⚠️ ajuste se necessário
  )
);

CREATE POLICY "enrollments_insert" ON enrollments FOR INSERT WITH CHECK (
  auth.role() = 'authenticated'
);

CREATE POLICY "enrollments_update" ON enrollments FOR UPDATE USING (
  auth.role() = 'authenticated'
);

CREATE POLICY "enrollments_delete" ON enrollments FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- ─── 4. RLS — payments ──────────────────────────────────────────
DROP POLICY IF EXISTS "payments_select"    ON payments;
DROP POLICY IF EXISTS "payments_insert"    ON payments;
DROP POLICY IF EXISTS "payments_update"    ON payments;
DROP POLICY IF EXISTS "payments_delete"    ON payments;
DROP POLICY IF EXISTS "all_payments"       ON payments;

-- Todos os autenticados podem ver pagamentos
-- (professores podem precisar verificar situação financeira dos alunos)
CREATE POLICY "payments_select" ON payments FOR SELECT USING (
  auth.role() = 'authenticated'
);

-- Apenas admin e financial podem lançar / alterar pagamentos
CREATE POLICY "payments_insert" ON payments FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'financial')
  )
);

CREATE POLICY "payments_update" ON payments FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'financial')
  )
);

CREATE POLICY "payments_delete" ON payments FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- ─── Verificação ──────────────────────────────────────────────
-- Confirma que os perfis existentes têm role válido
SELECT id, name, role FROM profiles ORDER BY role, name;
