-- ─── fix_v12.sql ─────────────────────────────────────────────────
-- Corrige permissão de UPDATE na tabela room_bookings.
-- Sem esta policy o cancelamento de reservas parecia funcionar
-- (toast "Reserva cancelada") mas o banco não era alterado.
--
-- Execute no Supabase → SQL Editor → Run.
-- ─────────────────────────────────────────────────────────────────

-- 1. Habilitar RLS (se ainda não estiver)
ALTER TABLE room_bookings ENABLE ROW LEVEL SECURITY;

-- 2. Remover qualquer policy de UPDATE existente para recriar limpa
DROP POLICY IF EXISTS "room_bookings_update"          ON room_bookings;
DROP POLICY IF EXISTS "authenticated update bookings"  ON room_bookings;
DROP POLICY IF EXISTS "users can update own bookings"  ON room_bookings;
DROP POLICY IF EXISTS "admin can update bookings"      ON room_bookings;

-- 3. Criar policy de UPDATE
--    Admin → qualquer reserva
--    Professor → somente as próprias (teacher_id = auth.uid())
CREATE POLICY "room_bookings_update"
ON room_bookings
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'financial')
  )
  OR auth.uid() = teacher_id
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'financial')
  )
  OR auth.uid() = teacher_id
);

-- 4. Garantir que SELECT, INSERT e DELETE também existem
--    (sem estas o módulo de salas pode não funcionar corretamente)

-- SELECT: todos os autenticados podem ver reservas
DROP POLICY IF EXISTS "room_bookings_select" ON room_bookings;
CREATE POLICY "room_bookings_select"
ON room_bookings FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

-- INSERT: qualquer autenticado pode reservar
DROP POLICY IF EXISTS "room_bookings_insert" ON room_bookings;
CREATE POLICY "room_bookings_insert"
ON room_bookings FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- DELETE: apenas admin (normalmente não usamos DELETE, apenas cancelar)
DROP POLICY IF EXISTS "room_bookings_delete" ON room_bookings;
CREATE POLICY "room_bookings_delete"
ON room_bookings FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);
