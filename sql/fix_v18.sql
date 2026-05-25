-- ─── fix_v18.sql ─────────────────────────────────────────────────
-- Permite que admins gerenciem usuários diretamente pelo sistema:
--   • Ver todos os perfis (SELECT já deveria existir, garante aqui)
--   • Alterar o papel (role) de qualquer usuário (UPDATE)
--   • Remover acesso (DELETE) sem apagar a conta do Supabase Auth
--
-- Sem isso, o UPDATE/DELETE em profiles de outros usuários é bloqueado
-- silenciosamente pelo RLS (sem erro, sem efeito).
--
-- Execute no Supabase → SQL Editor → Run.
-- ─────────────────────────────────────────────────────────────────

-- ─── Garante RLS habilitado ───────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ─── Limpa políticas antigas que possam conflitar ─────────────────
DROP POLICY IF EXISTS "admin_update_profiles"         ON profiles;
DROP POLICY IF EXISTS "admin_delete_profiles"         ON profiles;
DROP POLICY IF EXISTS "admin_select_all_profiles"     ON profiles;
DROP POLICY IF EXISTS "users_read_own_profile"        ON profiles;
DROP POLICY IF EXISTS "users_update_own_profile"      ON profiles;

-- ─── SELECT: todos autenticados veem todos os perfis ─────────────
-- (necessário para listas de professores, salas, etc.)
CREATE POLICY "authenticated_select_profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

-- ─── UPDATE: usuário pode atualizar o próprio perfil ─────────────
CREATE POLICY "users_update_own_profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ─── UPDATE: admin pode alterar qualquer perfil (troca de papel) ──
CREATE POLICY "admin_update_profiles"
  ON profiles FOR UPDATE
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

-- ─── DELETE: admin pode remover acesso (apaga perfil, não conta Auth) ─
CREATE POLICY "admin_delete_profiles"
  ON profiles FOR DELETE
  TO authenticated
  USING (
    id <> auth.uid()   -- admin não se auto-remove acidentalmente
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id  = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- ─── Verificação ───────────────────────────────────────────────────
-- SELECT policyname, cmd, qual
-- FROM pg_policies
-- WHERE tablename = 'profiles'
-- ORDER BY cmd, policyname;
