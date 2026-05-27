const FinancialModule = (() => {

  let allPayments        = [];
  let currentFilter      = 'due_this_month';
  let currentMonthFilter = null;   // "YYYY-MM" ou null
  let expandedStudents   = new Set(); // IDs expandidos na view "Em Aberto"

  const METHOD_LABELS = { pix: 'PIX', cash: 'Dinheiro', debit: 'Débito' };
  const METHOD_COLORS = { pix: '#22c55e', cash: '#3b82f6', debit: '#a855f7' };

  async function render() {
    if (!Auth.canAccessFinancial()) {
      document.getElementById('view-content').innerHTML =
        `<div class="error-state">Acesso restrito.</div>`;
      return;
    }
    document.getElementById('view-content').innerHTML =
      `<div class="loading-state">Carregando dados financeiros...</div>`;
    await loadFinancial();
  }

  async function loadFinancial() {
    try {
      const { data, error } = await db.from('payments')
        .select('*, students(name, ra), enrollments(piece_course, payment_installments, discount)')
        .order('due_date', { ascending: false });

      if (error) throw error;
      allPayments = data || [];
      renderFinancial();
    } catch (err) {
      document.getElementById('view-content').innerHTML =
        `<div class="error-state">Erro ao carregar financeiro.</div>`;
    }
  }

  function renderFinancial() {
    const el = document.getElementById('view-content');
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear  = now.getFullYear();
    const canTotals = Auth.canSeeFinancialTotals();

    // Valor efetivo: desconto perdido se não pago após dia 12 do mês de vencimento
    function effectiveAmt(p) {
      const disc = Number(p.discount_amount || 0);
      if (!disc || p.status === 'paid') return Number(p.amount);
      const due12 = new Date(new Date(p.due_date + 'T00:00:00').getFullYear(),
                             new Date(p.due_date + 'T00:00:00').getMonth(), 12);
      due12.setHours(23, 59, 59, 0);
      return new Date() > due12 ? Number(p.amount) + disc : Number(p.amount);
    }

    const monthPayments = allPayments.filter(p => {
      const due = new Date(p.due_date + 'T00:00:00');
      return due.getMonth() === thisMonth && due.getFullYear() === thisYear;
    });

    const realized = allPayments.filter(p => {
      if (p.status !== 'paid' || !p.paid_date) return false;
      const paid = new Date(p.paid_date + 'T00:00:00');
      return paid.getMonth() === thisMonth && paid.getFullYear() === thisYear;
    }).reduce((s, p) => s + Number(p.amount), 0);

    const forecast    = monthPayments.reduce((s, p) => s + effectiveAmt(p), 0);
    const pending     = monthPayments.filter(p => p.status !== 'paid').reduce((s, p) => s + effectiveAmt(p), 0);
    const defaultRate = forecast > 0 ? ((pending / forecast) * 100).toFixed(1) : '0.0';

    // Marcar vencidos
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const overdueIds = allPayments
      .filter(p => p.status === 'pending' && new Date(p.due_date + 'T00:00:00') < today)
      .map(p => p.id);

    el.innerHTML = `
      <div class="view-header">
        <h1 class="view-title">Financeiro</h1>
        <div class="view-actions">
          ${canTotals ? `
          <button class="btn btn-secondary" onclick="FinancialModule.openInadimplencia()">
            Inadimplentes${overdueIds.length ? ` <span class="badge badge-danger" style="margin-left:4px;font-size:10px">${overdueIds.length}</span>` : ''}
          </button>
          <button class="btn btn-secondary" onclick="FinancialModule.exportReport()">
            Exportar Relatorio
          </button>` : ''}
        </div>
      </div>

      <div class="cards-grid">
        ${canTotals ? `
        <div class="card stat-card accent">
          <div class="stat-label">Receita Realizada</div>
          <div class="stat-value">${formatCurrency(realized)}</div>
          <div class="stat-desc">mês atual</div>
        </div>
        <div class="card stat-card ${Number(defaultRate) > 20 ? 'danger' : ''}">
          <div class="stat-label">Inadimplencia</div>
          <div class="stat-value">${defaultRate}%</div>
          <div class="stat-desc">${formatCurrency(pending)} em aberto</div>
        </div>
        <div class="card stat-card">
          <div class="stat-label">Faturamento Previsto</div>
          <div class="stat-value">${formatCurrency(forecast)}</div>
          <div class="stat-desc">mês atual (dia 12)</div>
        </div>
        <div class="card stat-card">
          <div class="stat-label">Total no Sistema</div>
          <div class="stat-value">${formatCurrency(allPayments.reduce((s, p) => s + Number(p.amount), 0))}</div>
          <div class="stat-desc">todos os lancamentos</div>
        </div>
        ` : ''}
        ${renderPaymentMethodChart()}
      </div>

      <div class="section-header mt-6">
        <h2 class="section-title">Lancamentos</h2>
        <div class="filter-tabs">
          <button class="filter-tab ${currentFilter === 'due_this_month' ? 'active' : ''}" onclick="FinancialModule.filter('due_this_month')">${currentMonthFilter ? new Date(currentMonthFilter + '-02').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : 'Vencem esse mes'}</button>
          <button class="filter-tab ${currentFilter === 'pending'        ? 'active' : ''}" onclick="FinancialModule.filter('pending')" title="Nao pagos do mes atual e proximo mes">Pendentes</button>
          <button class="filter-tab ${currentFilter === 'overdue'        ? 'active' : ''}" onclick="FinancialModule.filter('overdue')">Em Atraso</button>
          <button class="filter-tab ${currentFilter === 'pending_all'    ? 'active' : ''}" onclick="FinancialModule.filter('pending_all')" title="Todos os nao pagos agrupados por aluno">Em Aberto</button>
          <button class="filter-tab ${currentFilter === 'paid'           ? 'active' : ''}" onclick="FinancialModule.filter('paid')">Pagos</button>
          <button class="filter-tab ${currentFilter === 'all'            ? 'active' : ''}" onclick="FinancialModule.filter('all')">Todos</button>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
          <input type="month" id="filter-month" class="input"
            style="width:150px;font-size:13px;padding:6px 10px"
            value="${currentMonthFilter || ''}"
            onchange="FinancialModule.setMonthFilter(this.value)"
            title="Filtrar por mes">
          <button id="btn-clear-month" class="btn-icon"
            onclick="FinancialModule.setMonthFilter('')"
            title="Limpar filtro de mes"
            style="display:${currentMonthFilter ? 'inline-flex' : 'none'};padding:4px 8px">✕</button>
        </div>
        <div class="search-box">
          <input type="text" id="search-financial" class="input" placeholder="Buscar por aluno...">
        </div>
      </div>

      <div id="payments-table"></div>
    `;

    renderPaymentsTable();

    document.getElementById('search-financial')?.addEventListener('input',
      debounce(e => renderPaymentsTable(e.target.value))
    );
  }

  // ─── Gráfico de formas de pagamento ──────────────────────────────
  function renderPaymentMethodChart() {
    const now = new Date();
    const paidThisMonth = allPayments.filter(p => {
      if (p.status !== 'paid' || !p.paid_date) return false;
      const d = new Date(p.paid_date + 'T00:00:00');
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });

    const total = paidThisMonth.length;
    const count = { pix: 0, cash: 0, debit: 0 };
    paidThisMonth.forEach(p => {
      if (p.payment_method === 'pix')   count.pix++;
      else if (p.payment_method === 'cash')  count.cash++;
      else if (p.payment_method === 'debit') count.debit++;
    });
    const withMethod = count.pix + count.cash + count.debit;

    if (!total) {
      return `<div class="card stat-card">
        <div class="stat-label">Formas de Pagamento</div>
        <div class="stat-desc" style="padding:8px 0">Nenhum pagamento este mês.</div>
      </div>`;
    }

    const bars = Object.entries(count).map(([key, cnt]) => {
      const pct = withMethod > 0 ? Math.round(cnt / withMethod * 100) : 0;
      return `
        <div style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px">
            <span style="display:flex;align-items:center;gap:5px">
              <span style="width:8px;height:8px;border-radius:50%;background:${METHOD_COLORS[key]};display:inline-block;flex-shrink:0"></span>
              ${METHOD_LABELS[key]}
            </span>
            <span><strong>${pct}%</strong> <span style="color:var(--text-secondary)">(${cnt})</span></span>
          </div>
          <div style="height:5px;background:var(--border);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${METHOD_COLORS[key]};border-radius:3px"></div>
          </div>
        </div>`;
    }).join('');

    const semRegistro = total - withMethod;
    return `<div class="card stat-card">
      <div class="stat-label">Formas de Pagamento</div>
      <div style="margin:10px 0 4px">${bars}</div>
      ${semRegistro > 0 ? `<div style="font-size:10px;color:var(--text-secondary);margin-bottom:4px">${semRegistro} sem forma registrada</div>` : ''}
      <div class="stat-desc">${total} pagamentos este mês</div>
    </div>`;
  }

  function renderPaymentsTable(search = '') {
    let payments = [...allPayments];
    const today = new Date(); today.setHours(0, 0, 0, 0);

    // Sempre recalcula overdue internamente (não depende de parâmetro externo)
    payments = payments.map(p => {
      if (p.status === 'pending' && new Date(p.due_date + 'T00:00:00') < today) {
        return { ...p, status: 'overdue' };
      }
      return p;
    });

    // Filtro de status / mês
    if (currentFilter === 'due_this_month') {
      const target = currentMonthFilter ? new Date(currentMonthFilter + '-02') : new Date();
      payments = payments.filter(p => {
        const due = new Date(p.due_date + 'T00:00:00');
        return due.getMonth() === target.getMonth() && due.getFullYear() === target.getFullYear();
      });
    } else if (currentFilter === 'pending') {
      // Mês atual + próximo mês não pagos (visão de curto prazo)
      const ref = currentMonthFilter ? new Date(currentMonthFilter + '-02') : new Date();
      const curr = { m: ref.getMonth(), y: ref.getFullYear() };
      const next = curr.m === 11
        ? { m: 0, y: curr.y + 1 }
        : { m: curr.m + 1, y: curr.y };
      payments = payments.filter(p => {
        if (p.status === 'paid') return false;
        const due = new Date(p.due_date + 'T00:00:00');
        return (due.getMonth() === curr.m && due.getFullYear() === curr.y) ||
               (due.getMonth() === next.m && due.getFullYear() === next.y);
      });
    } else if (currentFilter === 'pending_all') {
      // Todos os não pagos — renderizados agrupados por aluno
      payments = payments.filter(p => p.status !== 'paid');
      if (currentMonthFilter) {
        const target = new Date(currentMonthFilter + '-02');
        const fy = target.getFullYear(), fm = target.getMonth();
        payments = payments.filter(p => {
          const d = new Date(p.due_date + 'T00:00:00');
          return d.getFullYear() === fy && d.getMonth() === fm;
        });
      }
    } else {
      if (currentFilter !== 'all') {
        payments = payments.filter(p => p.status === currentFilter);
      }
      if (currentMonthFilter) {
        const target = new Date(currentMonthFilter + '-02');
        const fy = target.getFullYear(), fm = target.getMonth();
        payments = payments.filter(p => {
          const dateStr = (currentFilter === 'paid' && p.paid_date) ? p.paid_date : p.due_date;
          if (!dateStr) return false;
          const d = new Date(dateStr + 'T00:00:00');
          return d.getFullYear() === fy && d.getMonth() === fm;
        });
      }
    }

    if (search) {
      const s = search.toLowerCase();
      payments = payments.filter(p => p.students?.name?.toLowerCase().includes(s));
    }

    const container = document.getElementById('payments-table');
    if (!container) return;

    // View agrupada por aluno (Em Aberto)
    if (currentFilter === 'pending_all') {
      renderGroupedPending(payments, container);
      return;
    }

    container.innerHTML = `
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>Aluno</th>
            <th>RA</th>
            <th>Curso</th>
            <th>Parcela</th>
            <th>Valor Efetivo</th>
            <th>Vencimento</th>
            <th>Situacao</th>
            <th>Pagamento</th>
            <th>Observacoes</th>
            <th>Acoes</th>
          </tr></thead>
          <tbody>
            ${payments.map(p => {
              const discountAmt  = Number(p.discount_amount || 0);
              const due          = new Date(p.due_date + 'T00:00:00');
              const today        = new Date(); today.setHours(0, 0, 0, 0);
              const pastDay12    = today.getDate() > 12 && today >= new Date(due.getFullYear(), due.getMonth(), 1);
              const effectiveAmt = (p.status !== 'paid' && pastDay12 && discountAmt > 0)
                ? Number(p.amount) + discountAmt
                : Number(p.amount);
              const hasLostDiscount = p.status !== 'paid' && pastDay12 && discountAmt > 0;

              const methodBadge = p.payment_method
                ? `<div style="margin-top:3px"><span style="font-size:10px;padding:1px 7px;border-radius:3px;background:${METHOD_COLORS[p.payment_method]}22;color:${METHOD_COLORS[p.payment_method]};font-weight:700;border:1px solid ${METHOD_COLORS[p.payment_method]}44">${METHOD_LABELS[p.payment_method]}</span></div>`
                : '';

              return `<tr class="${p.status === 'overdue' ? 'tr-overdue' : ''}">
                <td>${escapeHtml(p.students?.name || '—')}</td>
                <td class="text-accent">${escapeHtml(p.students?.ra || '—')}</td>
                <td class="text-secondary">${escapeHtml(p.enrollments?.piece_course || '—')}</td>
                <td>${p.installment_number || '—'} / ${p.enrollments?.payment_installments || '—'}</td>
                <td>
                  <strong>${formatCurrency(effectiveAmt)}</strong>
                  ${hasLostDiscount
                    ? `<div style="font-size:10px;color:var(--danger)">Desconto perdido (+${formatCurrency(discountAmt)})</div>`
                    : discountAmt > 0 && p.status !== 'paid'
                      ? `<div style="font-size:10px;color:var(--success)">Com desconto (ate dia 12)</div>`
                      : ''}
                </td>
                <td>${formatDate(p.due_date)}</td>
                <td><span class="badge badge-${p.status === 'paid' ? 'success' : p.status === 'overdue' ? 'danger' : 'warning'}">
                  ${STATUS_LABELS[p.status] || p.status}
                </span></td>
                <td>
                  ${p.paid_date ? formatDate(p.paid_date) : '—'}
                  ${methodBadge}
                </td>
                <td class="text-secondary">${escapeHtml(p.observations || '—')}</td>
                <td class="actions-cell">
                  ${p.status !== 'paid' ? `
                  <button class="btn-icon" onclick="FinancialModule.markPaid('${p.id}', ${effectiveAmt})">
                    Pago
                  </button>` : `
                  <button class="btn-icon btn-icon-danger" onclick="FinancialModule.markPending('${p.id}')">
                    Estornar
                  </button>`}
                  <button class="btn-icon" onclick="FinancialModule.openEdit('${p.id}')">
                    Editar
                  </button>
                </td>
              </tr>`;
            }).join('') || `<tr><td colspan="10" class="empty-state">Nenhum lancamento.</td></tr>`}
          </tbody>
        </table>
      </div>`;
  }

  // ─── View agrupada por aluno (Em Aberto) ─────────────────────
  function renderGroupedPending(payments, container) {
    if (!payments.length) {
      container.innerHTML = `<p class="empty-state" style="padding:2rem">Nenhum lancamento em aberto.</p>`;
      return;
    }

    // Agrupa por aluno
    const byStudent = {};
    payments.forEach(p => {
      const sid = p.student_id;
      if (!byStudent[sid]) byStudent[sid] = {
        sid, name: p.students?.name || '—', ra: p.students?.ra || '—', payments: []
      };
      byStudent[sid].payments.push(p);
    });

    const students = Object.values(byStudent)
      .sort((a, b) => a.name.localeCompare(b.name));

    container.innerHTML = `
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th style="width:32px"></th>
            <th>Aluno</th>
            <th>RA</th>
            <th>Parcelas em Aberto</th>
            <th>Total em Aberto</th>
          </tr></thead>
          <tbody>
            ${students.map(student => {
              const isExpanded  = expandedStudents.has(student.sid);
              const overdueCount = student.payments.filter(p => p.status === 'overdue').length;
              const total        = student.payments.reduce((s, p) => s + Number(p.amount), 0);
              const sorted       = [...student.payments].sort((a, b) => a.due_date.localeCompare(b.due_date));

              return `
                <tr class="student-group-row${overdueCount > 0 ? ' tr-overdue' : ''}"
                    onclick="FinancialModule.toggleStudent('${student.sid}')"
                    style="cursor:pointer">
                  <td style="text-align:center;color:var(--text-muted);font-size:11px;user-select:none">
                    ${isExpanded ? '▼' : '▶'}
                  </td>
                  <td><strong>${escapeHtml(student.name)}</strong></td>
                  <td class="text-accent">${escapeHtml(student.ra)}</td>
                  <td>
                    ${student.payments.length} parcela${student.payments.length !== 1 ? 's' : ''}
                    ${overdueCount > 0
                      ? `<span class="badge badge-danger" style="margin-left:6px;font-size:10px">${overdueCount} em atraso</span>`
                      : ''}
                  </td>
                  <td><strong>${formatCurrency(total)}</strong></td>
                </tr>
                ${isExpanded ? sorted.map(p => {
                  const discAmt = Number(p.discount_amount || 0);
                  const today2  = new Date(); today2.setHours(0,0,0,0);
                  const due     = new Date(p.due_date + 'T00:00:00');
                  const pastDay12 = today2.getDate() > 12 && today2 >= new Date(due.getFullYear(), due.getMonth(), 1);
                  const effAmt  = (p.status !== 'paid' && pastDay12 && discAmt > 0)
                    ? Number(p.amount) + discAmt : Number(p.amount);
                  return `
                    <tr class="${p.status === 'overdue' ? 'tr-overdue' : ''}"
                        style="background:var(--surface-hover)">
                      <td></td>
                      <td colspan="2" style="padding-left:1.75rem;font-size:12px;color:var(--text-secondary)">
                        ${escapeHtml(p.enrollments?.piece_course || '—')}
                      </td>
                      <td style="font-size:12px">
                        Parc. ${p.installment_number || '?'}/${p.enrollments?.payment_installments || '?'}
                        &nbsp;·&nbsp; vence ${formatDate(p.due_date)}
                        &nbsp;·&nbsp;
                        <span class="badge badge-${p.status === 'overdue' ? 'danger' : 'warning'}"
                              style="font-size:10px">${STATUS_LABELS[p.status] || p.status}</span>
                      </td>
                      <td>
                        <strong>${formatCurrency(effAmt)}</strong>
                        <button class="btn-icon" style="margin-left:8px"
                          onclick="event.stopPropagation();FinancialModule.markPaid('${p.id}',${effAmt})">
                          Pago
                        </button>
                      </td>
                    </tr>`;
                }).join('') : ''}
              `;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function toggleStudent(studentId) {
    if (expandedStudents.has(studentId)) {
      expandedStudents.delete(studentId);
    } else {
      expandedStudents.add(studentId);
    }
    renderPaymentsTable(document.getElementById('search-financial')?.value || '');
  }

  function filter(status) {
    currentFilter = status;
    document.querySelectorAll('.filter-tab').forEach(t => {
      t.classList.toggle('active', t.getAttribute('onclick')?.includes(`'${status}'`));
    });
    renderPaymentsTable(document.getElementById('search-financial')?.value || '');
  }

  function setMonthFilter(val) {
    currentMonthFilter = val || null;
    const input = document.getElementById('filter-month');
    if (input) input.value = val || '';
    const clearBtn = document.getElementById('btn-clear-month');
    if (clearBtn) clearBtn.style.display = currentMonthFilter ? 'inline-flex' : 'none';
    // Atualiza label da aba "Vencem esse mes"
    const dueTab = document.querySelector('.filter-tab[onclick*="due_this_month"]');
    if (dueTab) {
      dueTab.textContent = currentMonthFilter
        ? new Date(currentMonthFilter + '-02').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
        : 'Vencem esse mes';
    }
    renderPaymentsTable(document.getElementById('search-financial')?.value || '');
  }

  // ─── Registrar pagamento (modal com forma de pagamento) ───────────
  async function markPaid(id, effectiveAmount) {
    const p = allPayments.find(x => x.id === id);
    const studentName = p?.students?.name || '—';

    openModal('Registrar Pagamento', `
      <div style="margin-bottom:12px">
        <div class="text-secondary" style="font-size:12px">Aluno</div>
        <div style="font-weight:600">${escapeHtml(studentName)}</div>
      </div>
      <form id="markpaid-form" onsubmit="FinancialModule.confirmMarkPaid(event, '${id}')">
        <div class="form-grid">
          <div class="form-group span-3">
            <label>Valor Recebido (R$) *</label>
            <input type="number" name="paid_amount" class="input" step="0.01" min="0"
              value="${effectiveAmount.toFixed(2)}" required>
          </div>
          <div class="form-group span-3">
            <label>Forma de Pagamento *</label>
            <div style="display:flex;gap:10px;margin-top:8px">
              ${['pix', 'cash', 'debit'].map(m => `
                <button type="button" class="method-btn" data-method="${m}"
                  onclick="FinancialModule.selectMethod(this)"
                  style="flex:1;padding:10px 0;border:2px solid var(--border);border-radius:8px;
                         background:transparent;cursor:pointer;font-weight:700;font-size:13px;
                         color:var(--text-secondary);transition:.15s">
                  ${METHOD_LABELS[m]}
                </button>`).join('')}
            </div>
            <input type="hidden" id="selected-method" name="payment_method">
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">Confirmar Pagamento</button>
        </div>
      </form>
    `);
  }

  function selectMethod(btn) {
    document.querySelectorAll('.method-btn').forEach(b => {
      b.style.borderColor = 'var(--border)';
      b.style.background  = 'transparent';
      b.style.color       = 'var(--text-secondary)';
    });
    btn.style.borderColor = METHOD_COLORS[btn.dataset.method] || 'var(--accent)';
    btn.style.background  = (METHOD_COLORS[btn.dataset.method] || '#d4af37') + '18';
    btn.style.color       = METHOD_COLORS[btn.dataset.method] || 'var(--accent)';
    document.getElementById('selected-method').value = btn.dataset.method;
  }

  async function confirmMarkPaid(event, id) {
    event.preventDefault();
    const fd     = new FormData(event.target);
    const method = fd.get('payment_method');
    if (!method) { toast('Selecione a forma de pagamento.', 'warning'); return; }

    const paidAmount = parseFloat(fd.get('paid_amount'));
    const today      = new Date().toISOString().split('T')[0];

    const { error } = await db.from('payments').update({
      status:         'paid',
      paid_date:      today,
      amount:         paidAmount,
      payment_method: method,
    }).eq('id', id);

    if (error) return toast('Erro ao atualizar pagamento.', 'error');

    const p = allPayments.find(x => x.id === id);
    AuditLog.log('payment_paid', 'payment', id, p?.students?.name,
      `Pagamento confirmado: ${p?.students?.name || '—'} — parcela ${p?.installment_number || '?'} — ${METHOD_LABELS[method]} — ${formatCurrency(paidAmount)}`);

    toast('Pagamento registrado.', 'success');
    closeModal();
    await loadFinancial();
  }

  async function markPending(id) {
    const confirmed = await confirmDialog('Estornar este pagamento? O status voltará para Pendente.');
    if (!confirmed) return;
    const p = allPayments.find(x => x.id === id);
    const { error } = await db.from('payments')
      .update({ status: 'pending', paid_date: null, payment_method: null })
      .eq('id', id);
    if (error) return toast('Erro ao estornar.', 'error');

    AuditLog.log('payment_reversed', 'payment', id, p?.students?.name,
      `Pagamento estornado: ${p?.students?.name || '—'} — parcela ${p?.installment_number || '?'}`);

    toast('Estorno realizado.', 'success');
    await loadFinancial();
  }

  async function openEdit(id) {
    const payment = allPayments.find(p => p.id === id);
    if (!payment) return;

    const discAmt = Number(payment.discount_amount || 0);
    const fullAmt = Number(payment.amount) + discAmt;

    openModal('Editar Lancamento', `
      <form id="payment-form" onsubmit="FinancialModule.savePayment(event, '${id}')">
        <div class="form-grid">
          <div class="form-group span-3">
            <label>Aluno</label>
            <input type="text" class="input" value="${escapeHtml(payment.students?.name || '—')}" readonly>
          </div>
          <div class="form-group">
            <label>Valor com Desconto (R$) *</label>
            <input type="number" name="amount" class="input" step="0.01" min="0" required
              value="${payment.amount}">
          </div>
          <div class="form-group">
            <label>Desconto por Parcela (R$)</label>
            <input type="number" name="discount_amount" class="input" step="0.01" min="0"
              value="${discAmt}">
          </div>
          <div class="form-group">
            <label>Valor Integral</label>
            <input type="text" class="input" value="${formatCurrency(fullAmt)}" readonly
              style="color:var(--text-secondary)">
          </div>
          <div class="form-group">
            <label>Vencimento (dia 12) *</label>
            <input type="date" name="due_date" class="input" required
              value="${toInputDate(payment.due_date)}">
          </div>
          <div class="form-group">
            <label>Situacao</label>
            <select name="status" class="input">
              <option value="pending" ${payment.status === 'pending' ? 'selected' : ''}>Pendente</option>
              <option value="paid"    ${payment.status === 'paid'    ? 'selected' : ''}>Pago</option>
              <option value="overdue" ${payment.status === 'overdue' ? 'selected' : ''}>Em Atraso</option>
            </select>
          </div>
          <div class="form-group">
            <label>Data de Pagamento</label>
            <input type="date" name="paid_date" class="input"
              value="${toInputDate(payment.paid_date)}">
          </div>
          <div class="form-group">
            <label>Forma de Pagamento</label>
            <select name="payment_method" class="input">
              <option value="">— Nao registrada —</option>
              <option value="pix"   ${payment.payment_method === 'pix'   ? 'selected' : ''}>PIX</option>
              <option value="cash"  ${payment.payment_method === 'cash'  ? 'selected' : ''}>Dinheiro</option>
              <option value="debit" ${payment.payment_method === 'debit' ? 'selected' : ''}>Debito</option>
            </select>
          </div>
          <div class="form-group span-3">
            <label>Observacoes</label>
            <textarea name="observations" class="input textarea" rows="3"
              placeholder="Observacoes sobre este lancamento">${escapeHtml(payment.observations || '')}</textarea>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">Salvar</button>
        </div>
      </form>
    `);
  }

  async function savePayment(event, id) {
    event.preventDefault();
    const fd   = new FormData(event.target);
    const data = Object.fromEntries(fd.entries());

    const { error } = await db.from('payments').update({
      amount:          parseFloat(data.amount),
      discount_amount: parseFloat(data.discount_amount || 0),
      due_date:        data.due_date,
      status:          data.status,
      paid_date:       data.paid_date || null,
      payment_method:  data.payment_method || null,
      observations:    data.observations || null,
    }).eq('id', id);

    if (error) return toast('Erro ao salvar.', 'error');

    const p = allPayments.find(x => x.id === id);
    AuditLog.log('payment_updated', 'payment', id, p?.students?.name,
      `Lancamento editado: ${p?.students?.name || '—'} — parcela ${p?.installment_number || '?'}`);

    toast('Lancamento atualizado.', 'success');
    closeModal();
    await loadFinancial();
  }

  async function exportReport() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const W = 297, H = 210;
    const mL = 14, mR = W - 14;
    const now = new Date();

    const FILTER_LABELS = {
      due_this_month: 'Vencem esse Mes',
      pending:        'Pendentes (mes atual + proximo)',
      overdue:        'Em Atraso',
      pending_all:    'Em Aberto',
      paid:           'Pagos',
      all:            'Todos',
    };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const overdueMarked = allPayments.map(p =>
      p.status === 'pending' && new Date(p.due_date + 'T00:00:00') < today
        ? { ...p, status: 'overdue' } : p
    );
    let paymentsToExport = [...overdueMarked];
    if (currentFilter === 'due_this_month') {
      const target = currentMonthFilter ? new Date(currentMonthFilter + '-02') : now;
      paymentsToExport = paymentsToExport.filter(p => {
        const due = new Date(p.due_date + 'T00:00:00');
        return due.getMonth() === target.getMonth() && due.getFullYear() === target.getFullYear();
      });
    } else if (currentFilter === 'pending') {
      const ref  = currentMonthFilter ? new Date(currentMonthFilter + '-02') : now;
      const curr = { m: ref.getMonth(), y: ref.getFullYear() };
      const next = curr.m === 11 ? { m: 0, y: curr.y + 1 } : { m: curr.m + 1, y: curr.y };
      paymentsToExport = paymentsToExport.filter(p => {
        if (p.status === 'paid') return false;
        const due = new Date(p.due_date + 'T00:00:00');
        return (due.getMonth() === curr.m && due.getFullYear() === curr.y) ||
               (due.getMonth() === next.m && due.getFullYear() === next.y);
      });
    } else if (currentFilter === 'pending_all') {
      paymentsToExport = paymentsToExport.filter(p => p.status !== 'paid');
      if (currentMonthFilter) {
        const target = new Date(currentMonthFilter + '-02');
        const fy = target.getFullYear(), fm = target.getMonth();
        paymentsToExport = paymentsToExport.filter(p => {
          const d = new Date(p.due_date + 'T00:00:00');
          return d.getFullYear() === fy && d.getMonth() === fm;
        });
      }
    } else {
      if (currentFilter !== 'all') {
        paymentsToExport = paymentsToExport.filter(p => p.status === currentFilter);
      }
      if (currentMonthFilter) {
        const target = new Date(currentMonthFilter + '-02');
        const fy = target.getFullYear(), fm = target.getMonth();
        paymentsToExport = paymentsToExport.filter(p => {
          const dateStr = (currentFilter === 'paid' && p.paid_date) ? p.paid_date : p.due_date;
          if (!dateStr) return false;
          const d = new Date(dateStr + 'T00:00:00');
          return d.getFullYear() === fy && d.getMonth() === fm;
        });
      }
    }
    const filterLabel = FILTER_LABELS[currentFilter] || 'Todos';

    doc.setFillColor(30, 30, 30);
    doc.rect(0, 0, W, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text(`TPC - Teatro Popular de Comedia  |  Relatorio Financeiro — ${filterLabel}`, mL, 8);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(
      `Gerado em ${now.toLocaleDateString('pt-BR')} as ${now.toLocaleTimeString('pt-BR')}  |  Total: ${paymentsToExport.length} lancamentos`,
      mR, 8, { align: 'right' }
    );

    const paid    = paymentsToExport.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.amount), 0);
    const pending = paymentsToExport.filter(p => p.status !== 'paid').reduce((s, p) => s + Number(p.amount), 0);
    doc.setFontSize(8); doc.setTextColor(200, 200, 200);
    doc.text(`Total pago: ${formatCurrency(paid)}`, mL, 14);
    doc.text(`Total em aberto: ${formatCurrency(pending)}`, mL + 70, 14);

    const headers = ['Aluno', 'RA', 'Curso', 'Parcela', 'Valor', 'Vencimento', 'Situacao', 'Pagamento', 'Forma', 'Obs'];
    const colX    = [mL, 58, 88, 126, 144, 162, 183, 206, 226, 248];
    let y = 26;

    doc.setFillColor(245, 245, 245);
    doc.rect(mL - 2, y - 4, mR - mL + 4, 7, 'F');
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
    headers.forEach((h, i) => doc.text(h, colX[i], y));
    y += 4;
    doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3);
    doc.line(mL - 2, y, mR + 2, y);
    y += 4;

    let rowBg = false;
    paymentsToExport.forEach(p => {
      if (y > H - 14) {
        doc.addPage();
        doc.setFillColor(30, 30, 30);
        doc.rect(0, 0, W, 12, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8); doc.setFont('helvetica', 'bold');
        doc.text('TPC - Relatorio Financeiro (continuacao)', mL, 8);
        y = 20;
        doc.setFillColor(245, 245, 245);
        doc.rect(mL - 2, y - 4, mR - mL + 4, 7, 'F');
        doc.setTextColor(50, 50, 50);
        doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
        headers.forEach((h, i) => doc.text(h, colX[i], y));
        y += 4;
        doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3);
        doc.line(mL - 2, y, mR + 2, y);
        y += 4;
        rowBg = false;
      }

      if (rowBg) {
        doc.setFillColor(250, 250, 250);
        doc.rect(mL - 2, y - 3.5, mR - mL + 4, 6.5, 'F');
      }
      rowBg = !rowBg;

      doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
      doc.setTextColor(20, 20, 20);
      doc.text((p.students?.name || '—').substring(0, 20), colX[0], y);
      doc.text(p.students?.ra || '—', colX[1], y);
      doc.text((p.enrollments?.piece_course || '—').substring(0, 15), colX[2], y);
      doc.text(`${p.installment_number || '—'} / ${p.enrollments?.payment_installments || '—'}`, colX[3], y);

      doc.setFont('helvetica', 'bold');
      doc.text(formatCurrency(p.amount), colX[4], y);
      doc.setFont('helvetica', 'normal');

      doc.text(formatDate(p.due_date), colX[5], y);

      const statusColor = { paid: [39, 174, 96], pending: [200, 140, 20], overdue: [192, 57, 43] };
      const sc = statusColor[p.status] || [100, 100, 100];
      doc.setTextColor(...sc);
      doc.setFont('helvetica', 'bold');
      doc.text(STATUS_LABELS[p.status] || p.status, colX[6], y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(20, 20, 20);

      doc.text(p.paid_date ? formatDate(p.paid_date) : '—', colX[7], y);
      doc.text(METHOD_LABELS[p.payment_method] || '—', colX[8], y);
      doc.text((p.observations || '').substring(0, 16), colX[9], y);

      y += 6.5;
      doc.setDrawColor(230, 230, 230);
      doc.line(mL - 2, y - 2.5, mR + 2, y - 2.5);
    });

    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFillColor(245, 245, 245);
      doc.rect(0, H - 10, W, 10, 'F');
      doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.2);
      doc.line(0, H - 10, W, H - 10);
      doc.setTextColor(120, 120, 120); doc.setFontSize(7);
      doc.text('TPC - Teatro Popular de Comedia', mL, H - 4);
      doc.text(`Pagina ${i} de ${totalPages}`, W / 2, H - 4, { align: 'center' });
      doc.text('Documento confidencial — uso interno', mR, H - 4, { align: 'right' });
    }

    doc.save(`relatorio-financeiro-tpc-${filterLabel.toLowerCase().replace(/ /g, '-')}-${now.toISOString().split('T')[0]}.pdf`);
  }

  // ─── Modal de inadimplentes ────────────────────────────────────
  function openInadimplencia() {
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const overdue = allPayments
      .filter(p => p.status === 'pending' && new Date(p.due_date + 'T00:00:00') < today)
      .map(p => ({ ...p, status: 'overdue' }));

    // Agrupa por aluno
    const byStudent = {};
    overdue.forEach(p => {
      const sid  = p.student_id;
      const name = p.students?.name || '—';
      const ra   = p.students?.ra   || '—';
      if (!byStudent[sid]) byStudent[sid] = { name, ra, total: 0, parcelas: [] };
      byStudent[sid].total += Number(p.amount);
      byStudent[sid].parcelas.push(p);
    });

    const rows = Object.values(byStudent)
      .sort((a, b) => b.total - a.total);

    const totalGeral = rows.reduce((s, r) => s + r.total, 0);

    if (!rows.length) {
      openModal('Inadimplentes', `
        <div class="empty-state" style="padding:2rem;">
          Nenhum pagamento em atraso.
        </div>`);
      return;
    }

    openModal('Inadimplentes', `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
        <div>
          <span class="badge badge-danger" style="font-size:13px;padding:4px 12px;">
            ${rows.length} alunos
          </span>
          <span style="margin-left:10px;color:var(--text-secondary);font-size:13px;">
            Total em atraso: <strong style="color:var(--danger)">${formatCurrency(totalGeral)}</strong>
          </span>
        </div>
        <button class="btn btn-secondary" style="font-size:12px" onclick="FinancialModule.exportInadimplencia()">
          Exportar PDF
        </button>
      </div>

      <div class="table-wrapper" style="max-height:60vh;overflow-y:auto;">
        <table class="data-table">
          <thead><tr>
            <th>Aluno</th><th>RA</th><th>Parcelas</th><th>Total em Atraso</th><th>Proxima Acao</th>
          </tr></thead>
          <tbody>
            ${rows.map(r => {
              const parcs = r.parcelas
                .sort((a, b) => a.due_date.localeCompare(b.due_date))
                .map(p => `${p.installment_number || '?'} (${formatDate(p.due_date)})`)
                .join(', ');
              return `<tr class="tr-overdue">
                <td><strong>${escapeHtml(r.name)}</strong></td>
                <td class="text-accent">${escapeHtml(r.ra)}</td>
                <td class="text-secondary" style="font-size:12px">${parcs}</td>
                <td><strong style="color:var(--danger)">${formatCurrency(r.total)}</strong></td>
                <td>
                  <button class="btn-icon" onclick="FinancialModule.filter('overdue');closeModal()">
                    Ver lancamentos
                  </button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `, true);
  }

  function exportInadimplencia() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, mL = 14, mR = W - 14;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const now = new Date();

    const overdue = allPayments
      .filter(p => p.status === 'pending' && new Date(p.due_date + 'T00:00:00') < today);

    const byStudent = {};
    overdue.forEach(p => {
      const sid = p.student_id;
      if (!byStudent[sid]) byStudent[sid] = { name: p.students?.name || '—', ra: p.students?.ra || '—', total: 0, count: 0 };
      byStudent[sid].total += Number(p.amount);
      byStudent[sid].count++;
    });
    const rows = Object.values(byStudent).sort((a, b) => b.total - a.total);
    const totalGeral = rows.reduce((s, r) => s + r.total, 0);

    doc.setFillColor(30, 30, 30);
    doc.rect(0, 0, W, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text('TPC - Teatro Popular de Comedia', mL, 9);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Relatorio de Inadimplencia — ${now.toLocaleDateString('pt-BR')}`, mL, 15);
    doc.text(`${rows.length} alunos  |  Total: ${formatCurrency(totalGeral)}`, mR, 12, { align: 'right' });

    let y = 30;
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.setFillColor(245, 245, 245);
    doc.rect(mL - 2, y - 4, mR - mL + 4, 7, 'F');
    doc.setTextColor(50, 50, 50);
    ['Aluno', 'RA', 'Parcelas em atraso', 'Total'].forEach((h, i) => {
      doc.text(h, [mL, 75, 120, 165][i], y);
    });
    y += 7;

    rows.forEach((r, idx) => {
      if (y > 270) { doc.addPage(); y = 20; }
      if (idx % 2 === 0) {
        doc.setFillColor(253, 235, 235);
        doc.rect(mL - 2, y - 3.5, mR - mL + 4, 6.5, 'F');
      }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(20, 20, 20);
      doc.text(r.name.substring(0, 28), mL, y);
      doc.text(r.ra, 75, y);
      doc.text(`${r.count} parcela${r.count > 1 ? 's' : ''}`, 120, y);
      doc.setTextColor(192, 57, 43); doc.setFont('helvetica', 'bold');
      doc.text(formatCurrency(r.total), 165, y);
      doc.setTextColor(20, 20, 20); doc.setFont('helvetica', 'normal');
      y += 6.5;
    });

    doc.save(`inadimplencia-tpc-${now.toISOString().split('T')[0]}.pdf`);
    toast('PDF gerado.', 'success');
  }

  return {
    render, filter, setMonthFilter, toggleStudent,
    markPaid, selectMethod, confirmMarkPaid,
    markPending, openEdit, savePayment, exportReport,
    openInadimplencia, exportInadimplencia,
  };
})();
