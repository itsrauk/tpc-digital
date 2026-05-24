const Auth = (() => {
  let currentUser = null;
  let currentProfile = null;

  async function login(email, password) {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await loadProfile(data.user.id);
    return data;
  }

  async function logout() {
    await db.auth.signOut();
    currentUser = null;
    currentProfile = null;
    window.location.href = 'index.html';
  }

  async function loadProfile(userId) {
    const { data, error } = await db.from('profiles').select('*').eq('id', userId).single();
    if (error || !data) {
      currentProfile = { role: 'teacher', name: 'Usuário' };
      return;
    }
    currentProfile = data;
  }

  async function getSession() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) return null;
    currentUser = session.user;
    await loadProfile(session.user.id);
    return session;
  }

  function getUser()               { return currentUser; }
  function getProfile()            { return currentProfile; }
  function isAdmin()               { return currentProfile?.role === 'admin'; }
  function isTeacher()             { return currentProfile?.role === 'teacher'; }
  function isFinancial()           { return currentProfile?.role === 'financial'; }
  function isSecretary()           { return currentProfile?.role === 'secretary'; }
  function isAdminOrFinancial()    { return isAdmin() || isFinancial(); }
  // Quem pode acessar o módulo Financeiro (admin, financeiro e secretaria)
  function canAccessFinancial()    { return isAdmin() || isFinancial() || isSecretary(); }
  // Quem pode ver os totais financeiros (apenas admin e financeiro)
  function canSeeFinancialTotals() { return isAdmin() || isFinancial(); }
  // Quem pode gerenciar alunos e turmas (admin, financeiro e secretaria)
  function canManageStudents()     { return isAdmin() || isFinancial() || isSecretary(); }

  async function requireAuth() {
    const session = await getSession();
    if (!session) { window.location.href = 'index.html'; return false; }
    return true;
  }

  return { login, logout, getSession, getUser, getProfile,
           isAdmin, isTeacher, isFinancial, isSecretary,
           isAdminOrFinancial, canAccessFinancial, canSeeFinancialTotals,
           canManageStudents, requireAuth };
})();
