const HistoryModule = (() => {

  let allLogs    = [];
  let activeType = 'all';

  // ─── Ícones por tipo de ação ───────────────────────────────
  const TYPE_ICON = {
    student:    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>`,
    enrollment: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="10" rx="1"/><path d="M5 3V1M11 3V1M2 7h12"/></svg>`,
    payment:    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="12" height="9" rx="1"/><path d="M5 4V2.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5V4"/><path d="M5 8h6M5 11h4"/></svg>`,
    class:      `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>`,
    teacher:    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6" cy="5" r="2.5"/><path d="M1 14c0-2.8 2.2-5 5-5"/><circle cx="12" cy="6" r="2"/><path d="M9.5 14c0-2.2 1.1-3.8 2.5-4.5"/></svg>`,
    attendance: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 4 6 11 3 8"/></svg>`,
  };

  // ─── Cor do badge por tipo de ação ────────────────────────
  function badgeColor(actionType) {
    if (actionType.includes('created'))    return 'success';
    if (actionType.includes('paid'))       return 'success';
    if (actionType.includes('deleted'))    return 'danger';
    if (actionType.includes('cancelled'))  return 'danger';
    if (actionType.includes('reversed'))   return 'danger';
    if (actionType.includes('updated'))    return 'warning';
    if (actionType.includes('registered')) return 'info';
    return 'default';
  }

  // ─── Render principal ──────────────────────────────────────
  async function render() {
    if (!Auth.isAdmin()) {
      document.getElementById('view-content').innerHTML =
        `<div class="error-state">Acesso restrito ao administrador.</div>`;
      return;
    }

    document.getElementById('view-content').innerHTML =
      `<div class="loading-state">Carregando historico...</div>`;

    await loadLogs();
  }

  async function loadLogs() {
    try {
      const { data, error } = await db
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      allLogs = data || [];
      renderView();
    } catch (err) {
      document.getElementById('view-content').innerHTML =
        `<div class="error-state">Erro ao carregar historico: ${err.message}</div>`;
    }
  }

  function renderView() {
    const el = document.getElementById('view-content');

    const types = [
      { key: 'all',        label: 'Todos'       },
      { key: 'student',    label: 'Alunos'      },
      { key: 'enrollment', label: 'Matriculas'  },
      { key: 'payment',    label: 'Pagamentos'  },
      { key: 'class',      label: 'Turmas'      },
      { key: 'teacher',    label: 'Professores' },
      { key: 'attendance', label: 'Frequencia'  },
    ];

    el.innerHTML = `
      <div class="view-header">
        <h1 class="view-title">Historico do Sistema</h1>
        <div class="view-actions">
          <button class="btn btn-secondary" onclick="HistoryModule.refresh()">
            <svg style="width:14px;height:14px;margin-right:6px" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M14 8A6 6 0 1 1 8 2a6 6 0 0 1 4.24 1.76L14 2v4h-4l1.5-1.5"/>
            </svg>
            Atualizar
          </button>
        </div>
      </div>

      <div class="section-header" style="margin-bottom:1rem">
        <div class="filter-tabs">
          ${types.map(t => `
            <button class="filter-tab ${activeType === t.key ? 'active' : ''}"
              onclick="HistoryModule.filterType('${t.key}', this)">
              ${t.label}
            </button>
          `).join('')}
        </div>
        <div class="search-box">
          <input type="text" id="search-history" class="input" placeholder="Buscar por nome, acao...">
        </div>
      </div>

      <div id="history-list"></div>
    `;

    renderList();

    document.getElementById('search-history')?.addEventListener('input',
      debounce(e => renderList(e.target.value))
    );
  }

  function renderList(search = '') {
    let logs = [...allLogs];

    if (activeType !== 'all') {
      logs = logs.filter(l => l.entity_type === activeType);
    }

    if (search) {
      const s = search.toLowerCase();
      logs = logs.filter(l =>
        l.description?.toLowerCase().includes(s) ||
        l.entity_name?.toLowerCase().includes(s) ||
        l.user_name?.toLowerCase().includes(s) ||
        AuditLog.ACTION_LABELS[l.action_type]?.toLowerCase().includes(s)
      );
    }

    const container = document.getElementById('history-list');
    if (!container) return;

    if (!logs.length) {
      container.innerHTML = `<div class="empty-state">Nenhum registro encontrado.</div>`;
      return;
    }

    // Agrupar por data
    const grouped = {};
    logs.forEach(log => {
      const date = new Date(log.created_at).toLocaleDateString('pt-BR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      });
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(log);
    });

    container.innerHTML = Object.entries(grouped).map(([date, entries]) => `
      <div class="history-day-group">
        <div class="history-day-label">${capitalize(date)}</div>
        <div class="history-entries">
          ${entries.map(log => {
            const icon    = TYPE_ICON[log.entity_type] || TYPE_ICON.student;
            const badge   = badgeColor(log.action_type);
            const label   = AuditLog.ACTION_LABELS[log.action_type] || log.action_type;
            const time    = new Date(log.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            return `
              <div class="history-entry">
                <div class="history-entry-icon badge-${badge}">
                  ${icon}
                </div>
                <div class="history-entry-body">
                  <div class="history-entry-desc">${escapeHtml(log.description || label)}</div>
                  <div class="history-entry-meta">
                    <span class="badge badge-${badge}" style="font-size:10px">${label}</span>
                    ${log.entity_name ? `<span class="text-secondary" style="font-size:11px">• ${escapeHtml(log.entity_name)}</span>` : ''}
                    <span class="text-secondary" style="font-size:11px">• por ${escapeHtml(log.user_name || 'Sistema')}</span>
                  </div>
                </div>
                <div class="history-entry-time">${time}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `).join('');
  }

  function filterType(type, el) {
    activeType = type;
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
    renderList(document.getElementById('search-history')?.value || '');
  }

  async function refresh() {
    await loadLogs();
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  return { render, filterType, refresh };
})();
