// ─── Roteador ─────────────────────────────────────────────────
const Router = (() => {
  const routes = {
    dashboard: DashboardModule,
    students:  StudentsModule,
    courses:   CoursesModule,
    teachers:  TeachersModule,
    financial: FinancialModule,
    settings:  SettingsModule,
  };

  let currentView = 'dashboard';

  function navigate(view) {
    if (!routes[view]) return;
    if ((view === 'financial' || view === 'settings') && !Auth.isAdmin()) return;

    currentView = view;
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.view === view);
    });

    const viewTitle = {
      dashboard: 'Dashboard', students: 'Alunos', courses: 'Turmas',
      teachers: 'Professores', financial: 'Financeiro', settings: 'Configuracoes'
    };
    document.getElementById('page-title').textContent = viewTitle[view] || '';

    routes[view].render();
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

  const profile = Auth.getProfile();
  document.getElementById('user-name').textContent = profile?.name || 'Usuário';
  document.getElementById('user-role').textContent = profile?.role === 'admin' ? 'Administrador' : 'Professor';

  const financialNav = document.getElementById('nav-financial');
  if (financialNav) financialNav.style.display = Auth.isAdmin() ? 'flex' : 'none';

  const settingsNav = document.getElementById('nav-settings');
  if (settingsNav) settingsNav.style.display = Auth.isAdmin() ? 'flex' : 'none';

  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });

  document.getElementById('btn-logout').addEventListener('click', async () => {
    const ok = await confirmDialog('Deseja sair do sistema?');
    if (ok) Auth.logout();
  });

  document.getElementById('modal-close').addEventListener('click', closeModal);

  Router.init();
});
