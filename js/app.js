// ─── Busca Global ─────────────────────────────────────────────
const GlobalSearch = (() => {
  let _open   = false;
  let _timer  = null;

  function toggle() {
    _open = !_open;
    const panel = document.getElementById('global-search-panel');
    const input = document.getElementById('global-search-input');
    if (!panel) return;
    panel.style.display = _open ? 'block' : 'none';
    if (_open) { input?.focus(); }
    else { clear(); }
  }

  function close() {
    _open = false;
    const panel = document.getElementById('global-search-panel');
    if (panel) panel.style.display = 'none';
    clear();
  }

  function clear() {
    const input = document.getElementById('global-search-input');
    const res   = document.getElementById('global-search-results');
    if (input) input.value = '';
    if (res)   res.innerHTML = '';
  }

  async function search(q) {
    clearTimeout(_timer);
    const res = document.getElementById('global-search-results');
    if (!res) return;
    if (!q || q.length < 2) { res.innerHTML = ''; return; }

    res.innerHTML = `<div class="gs-loading">Buscando...</div>`;

    _timer = setTimeout(async () => {
      // Busca por nome OU por RA (ilike em ambos)
      const [byName, byRa] = await Promise.all([
        db.from('students')
          .select('id, name, ra, status, enrollments(status, classes(courses(name, level)))')
          .ilike('name', `%${q}%`)
          .limit(8),
        db.from('students')
          .select('id, name, ra, status, enrollments(status, classes(courses(name, level)))')
          .ilike('ra', `%${q}%`)
          .limit(4),
      ]);

      const seen = new Set();
      const students = [];
      for (const s of [...(byName.data || []), ...(byRa.data || [])]) {
        if (!seen.has(s.id)) { seen.add(s.id); students.push(s); }
      }

      if (!students.length) {
        res.innerHTML = `<div class="gs-empty">Nenhum aluno encontrado.</div>`;
        return;
      }

      res.innerHTML = students.map(s => {
        const activeEnroll = (s.enrollments || []).find(e => e.status === 'active');
        const curso = activeEnroll?.classes?.courses?.name || '—';
        const nivel = activeEnroll?.classes?.courses?.level ? ` Nível ${activeEnroll.classes.courses.level}` : '';
        return `<div class="gs-item" onclick="GlobalSearch.goTo('${s.id}')">
          <div class="gs-item-name">${escapeHtml(s.name)}</div>
          <div class="gs-item-meta">
            <span class="text-accent">${escapeHtml(s.ra || '—')}</span>
            · ${escapeHtml(curso + nivel)}
            · <span class="badge badge-${s.status === 'active' ? 'success' : 'secondary'}" style="font-size:9px">${STATUS_LABELS[s.status] || s.status}</span>
          </div>
        </div>`;
      }).join('');
    }, 300);
  }

  function goTo(studentId) {
    close();
    // Navega para Alunos e abre o detalhe
    Router.navigate('students');
    // Aguarda o módulo carregar, então abre o modal
    setTimeout(() => StudentsModule.openDetail(studentId), 600);
  }

  // Fecha ao clicar fora
  document.addEventListener('click', e => {
    const wrap = document.getElementById('global-search-wrap');
    if (_open && wrap && !wrap.contains(e.target)) close();
  });

  // Atalho Ctrl+K / Cmd+K
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      toggle();
    }
    if (e.key === 'Escape' && _open) close();
  });

  return { toggle, close, search, goTo };
})();

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
    // Professor: dashboard, turmas (só as suas, sem chamada/faltas), salas, reuniões
    if (view === 'settings' && !Auth.isAdmin()) return;
    if ((view === 'history' || view === 'teachers') && !Auth.isAdminOrFinancial()) return;
    if (view === 'students' && !Auth.canManageStudents()) return;
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
  // admin + financial + secretary: Alunos, Financeiro
  ['nav-students', 'nav-financial'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = canManage ? 'flex' : 'none';
  });

  // Turmas: todos os perfis (professor vê só as suas turmas, sem chamada/faltas)
  // nav-courses é sempre visível — sem hide/show necessário

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
