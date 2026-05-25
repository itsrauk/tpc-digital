-- ─── fix_v17.sql ─────────────────────────────────────────────────
-- Permite que admins aprovem/recusem pedidos de troca de sala.
-- Sem isso, o UPDATE em room_change_requests é bloqueado silenciosamente
-- pelo RLS e o status nunca muda (mesmo recebendo toast de sucesso).
--
-- Execute no Supabase → SQL Editor → Run.
-- ─────────────────────────────────────────────────────────────────

-- Habilita RLS na tabela (idempotente)
ALTER TABLE room_change_requests ENABLE ROW LEVEL SECURITY;

-- Remove políticas antigas de UPDATE (se existirem) para recriar limpo
DROP POLICY IF EXISTS "Admins podem atualizar room_change_requests" ON room_change_requests;
DROP POLICY IF EXISTS "admin_update_room_change_requests"           ON room_change_requests;

-- Admins podem atualizar qualquer pedido (aprovar / recusar)
CREATE POLICY "admin_update_room_change_requests"
  ON room_change_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id  = auth.uid()
        AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id  = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- Professores e secretaria podem inserir pedidos (caso ainda não exista)
DROP POLICY IF EXISTS "authenticated_insert_room_change_requests" ON room_change_requests;
CREATE POLICY "authenticated_insert_room_change_requests"
  ON room_change_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (teacher_id = auth.uid());

-- Todos autenticados podem visualizar os pedidos
DROP POLICY IF EXISTS "authenticated_select_room_change_requests" ON room_change_requests;
CREATE POLICY "authenticated_select_room_change_requests"
  ON room_change_requests
  FOR SELECT
  TO authenticated
  USING (true);

-- Verificação:
-- SELECT policyname, cmd, qual
-- FROM pg_policies
-- WHERE tablename = 'room_change_requests';
