// ─── Roteador ─────────────────────────────────────────────────
const Router = (() => {
  const routes = {
    dashboard: DashboardModule,
    students:  StudentsModule,
    courses:   CoursesModule,
    teachers:  TeachersModule,
    rooms:     RoomsModule,
    meetings:  MeetingsModule,
    history:   HistoryModule,
    financial: FinancialModule,
    settings:  SettingsModule,
  };

  let currentView = 'dashboard';

  function navigate(view) {
    if (!routes[view]) return;

    // Restrições de acesso
    if ((view === 'financial' || view === 'settings' || view === 'history') && !Auth.isAdmin()) return;
    if (view === 'teachers' && !Auth.isAdmin()) return;

    currentView = view;
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.view === view);
    });

    const viewTitle = {
      dashboard: 'Dashboard',   students:  'Alunos',
      courses:   'Turmas',      teachers:  'Professores',
      rooms:     'Salas',       meetings:  'Reunioes',
      history:   'Historico',   financial: 'Financeiro',
      settings:  'Configuracoes',
    };
    document.getElementById('page-title').textContent = viewTitle[view] || '';

    try {
      routes[view].render();
    } catch (err) {
      console.error('[Router] erro ao renderizar', view, err);
      document.getElementById('view-content').innerHTML =
        `<div class="error-state">Erro ao carregar a pagina. Tente recarregar.</div>`;
    }
  }

  function init() {
    document.querySelectorAll('.nav-item').forEach(el => {
      el.addEventListener('click', () => navigate(el.dataset.view));
    });

    const hash = window.location.hash.replace('#', '') || 'dashboard';
    navigate(routes[hash] ? hash : 'dashboard');

    window.addEventListener('hashchange', () => {
      const v = window.location.hash.replace('#', '');
      if (routes[v]) navigate(v);
    });
  }

  return { navigate, init };
})();

// ─── Modal global ──────────────────────────────────────────────
function openModal(title, content, wide = false) {
  const overlay = document.getElementById('modal-overlay');
  const box     = document.getElementById('modal-box');
  box.className = `modal-box ${wide ? 'modal-wide' : ''}`;
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = content;
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
  document.body.style.overflow = '';
}

// ─── Inicialização ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const ok = await Auth.requireAuth();
  if (!ok) return;

  const profile  = Auth.getProfile();
  const isAdmin  = Auth.isAdmin();

  document.getElementById('user-name').textContent = profile?.name || 'Usuário';
  document.getElementById('user-role').textContent = isAdmin ? 'Administrador' : 'Professor';

  // ─── Visibilidade do menu por perfil ──────────────────────
  // Professores NÃO veem: Professores, Histórico, Financeiro, Configurações
  const adminOnly = ['nav-teachers', 'nav-history', 'nav-financial', 'nav-settings'];
  adminOnly.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = isAdmin ? 'flex' : 'none';
  });

  // ─── Modal ────────────────────────────────────────────────
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });
  document.getElementById('modal-close').addEventListener('click', closeModal);

  // ─── Logout ───────────────────────────────────────────────
  document.getElementById('btn-logout').addEventListener('click', async () => {
    const ok = await confirmDialog('Deseja sair do sistema?');
    if (ok) Auth.logout();
  });

  // ─── Notificações ─────────────────────────────────────────
  await NotificationsHelper.load();
  // Atualiza a cada 60 segundos
  setInterval(() => NotificationsHelper.load(), 60000);

  Router.init();
});
