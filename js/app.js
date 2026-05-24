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

    // Restrições de acesso por perfil
    // Admin: tudo
    // Financeiro: tudo exceto configurações
    // Secretaria: dashboard, alunos, turmas, salas, reuniões, financeiro (sem totais)
    // Professor: dashboard, salas, reuniões
    if (view === 'settings' && !Auth.isAdmin()) return;
    if ((view === 'history' || view === 'teachers') && !Auth.isAdminOrFinancial()) return;
    if ((view === 'students' || view === 'courses') && !Auth.canManageStudents()) return;
    if (view === 'financial' && !Auth.canAccessFinancial()) return;

    // Fecha sidebar mobile ao navegar
    document.body.classList.remove('sidebar-open');

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

// ─── Sidebar mobile ────────────────────────────────────────────
function toggleSidebar() {
  document.body.classList.toggle('sidebar-open');
}

// ─── Inicialização ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const ok = await Auth.requireAuth();
  if (!ok) return;

  const profile      = Auth.getProfile();
  const isAdmin      = Auth.isAdmin();
  const isFinancial  = Auth.isFinancial();
  const isSecretary  = Auth.isSecretary();
  const canManage    = Auth.canManageStudents();    // admin + financial + secretary
  const canSeeAll    = Auth.isAdminOrFinancial();   // admin + financial
  const canFinancial = Auth.canAccessFinancial();   // admin + financial + secretary

  document.getElementById('user-name').textContent = profile?.name || 'Usuário';
  document.getElementById('user-role').textContent =
    isAdmin     ? 'Administrador' :
    isFinancial ? 'Financeiro'    :
    isSecretary ? 'Secretaria'    : 'Professor';

  // ─── Visibilidade do menu por perfil ──────────────────────
  // admin + financial + secretary: Alunos, Turmas, Financeiro
  ['nav-students', 'nav-courses', 'nav-financial'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = canManage ? 'flex' : 'none';
  });

  // admin + financial: Professores, Histórico
  ['nav-teachers', 'nav-history'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = canSeeAll ? 'flex' : 'none';
  });

  // Somente admin: Configurações
  const navSettings = document.getElementById('nav-settings');
  if (navSettings) navSettings.style.display = isAdmin ? 'flex' : 'none';

  // Salas e Reuniões: sempre visíveis (IDs já existem em app.html)
  // nav-rooms e nav-meetings não precisam de hide/show (sempre flex)

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
  setInterval(() => NotificationsHelper.load(), 60000);

  Router.init();
});
