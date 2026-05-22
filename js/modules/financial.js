const FinancialModule = (() => {

  let allPayments = [];
  let currentFilter = 'due_this_month';

  async function render() {
    if (!Auth.isAdmin()) {
      document.getElementById('view-content').innerHTML =
        `<div class="error-state">Acesso restrito ao administrador.</div>`;
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

    // Atualizar status de pagamentos vencidos
    const today = new Date(); today.setHours(0,0,0,0);
    const overdueIds = allPayments
      .filter(p => p.status === 'pending' && new Date(p.due_date + 'T00:00:00') < today)
      .map(p => p.id);

    el.innerHTML = `
      <div class="view-header">
        <h1 class="view-title">Financeiro</h1>
        <div class="view-actions">
          <button class="btn btn-secondary" onclick="FinancialModule.exportReport()">
            Exportar Relatorio
          </button>
        </div>
      </div>

      <div class="cards-grid">
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
          <div class="stat-value">${formatCurrency(allPayments.reduce((s,p) => s + Number(p.amount), 0))}</div>
          <div class="stat-desc">todos os lancamentos</div>
        </div>
      </div>

      <div class="section-header mt-6">
        <h2 class="section-title">Lancamentos</h2>
        <div class="filter-tabs">
          <button class="filter-tab ${currentFilter === 'due_this_month' ? 'active' : ''}" onclick="FinancialModule.filter('due_this_month')">Vencem esse mes</button>
          <button class="filter-tab ${currentFilter === 'pending'        ? 'active' : ''}" onclick="FinancialModule.filter('pending')">Pendentes</button>
          <button class="filter-tab ${currentFilter === 'overdue'        ? 'active' : ''}" onclick="FinancialModule.filter('overdue')">Em Atraso</button>
          <button class="filter-tab ${currentFilter === 'paid'           ? 'active' : ''}" onclick="FinancialModule.filter('paid')">Pagos</button>
          <button class="filter-tab ${currentFilter === 'all'            ? 'active' : ''}" onclick="FinancialModule.filter('all')">Todos</button>
        </div>
        <div class="search-box">
          <input type="text" id="search-financial" class="input" placeholder="Buscar por aluno...">
        </div>
      </div>

      <div id="payments-table"></div>
    `;

    renderPaymentsTable(overdueIds);

    document.getElementById('search-financial')?.addEventListener('input',
      debounce(e => renderPaymentsTable(overdueIds, e.target.value))
    );
  }

  function renderPaymentsTable(overdueIds = [], search = '') {
    let payments = [...allPayments];

    // Marcar vencidos no display
    payments = payments.map(p => {
      if (overdueIds.includes(p.id)) return { ...p, status: 'overdue' };
      return p;
    });

    if (currentFilter === 'due_this_month') {
      const now = new Date();
      payments = payments.filter(p => {
        const due = new Date(p.due_date + 'T00:00:00');
        return due.getMonth() === now.getMonth() && due.getFullYear() === now.getFullYear();
      });
    } else if (currentFilter !== 'all') {
      payments = payments.filter(p => p.status === currentFilter);
    }

    if (search) {
      const s = search.toLowerCase();
      payments = payments.filter(p => p.students?.name?.toLowerCase().includes(s));
    }

    const container = document.getElementById('payments-table');
    if (!container) return;

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
              // Se não pago e já passou dia 12 do mês de vencimento: cobra valor integral
              const effectiveAmt = (p.status !== 'paid' && pastDay12 && discountAmt > 0)
                ? Number(p.amount) + discountAmt
                : Number(p.amount);
              const hasLostDiscount = p.status !== 'paid' && pastDay12 && discountAmt > 0;

              return `<tr>
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
                <td>${p.paid_date ? formatDate(p.paid_date) : '—'}</td>
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

  function filter(status) {
    currentFilter = status;
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    renderPaymentsTable();
  }

  async function markPaid(id, effectiveAmount) {
    const today = new Date().toISOString().split('T')[0];
    // Grava o valor efetivamente cobrado (com ou sem desconto conforme dia 12)
    const updatePayload = { status: 'paid', paid_date: today };
    if (effectiveAmount !== undefined) updatePayload.amount = effectiveAmount;

    const { error } = await db.from('payments').update(updatePayload).eq('id', id);
    if (error) return toast('Erro ao atualizar pagamento.', 'error');
    toast('Pagamento registrado.', 'success');
    await loadFinancial();
  }

  async function markPending(id) {
    const confirmed = await confirmDialog('Estornar este pagamento? O status voltará para Pendente.');
    if (!confirmed) return;
    const { error } = await db.from('payments')
      .update({ status: 'pending', paid_date: null })
      .eq('id', id);
    if (error) return toast('Erro ao estornar.', 'error');
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
    const fd = new FormData(event.target);
    const data = Object.fromEntries(fd.entries());

    const { error } = await db.from('payments').update({
      amount:          parseFloat(data.amount),
      discount_amount: parseFloat(data.discount_amount || 0),
      due_date:        data.due_date,
      status:          data.status,
      paid_date:       data.paid_date || null,
      observations:    data.observations || null,
    }).eq('id', id);

    if (error) return toast('Erro ao salvar.', 'error');
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

    // ─── Cabeçalho ────────────────────────────────────────────
    doc.setFillColor(30, 30, 30);
    doc.rect(0, 0, W, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text('TPC - Teatro Popular de Comedia  |  Relatorio Financeiro', mL, 8);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(
      `Gerado em ${now.toLocaleDateString('pt-BR')} as ${now.toLocaleTimeString('pt-BR')}  |  Total: ${allPayments.length} lancamentos`,
      mR, 8, { align: 'right' }
    );

    // ─── Indicadores rápidos ──────────────────────────────────
    const paid    = allPayments.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.amount), 0);
    const pending = allPayments.filter(p => p.status !== 'paid').reduce((s, p) => s + Number(p.amount), 0);
    doc.setFontSize(8); doc.setTextColor(200, 200, 200);
    doc.text(`Total pago: ${formatCurrency(paid)}`, mL, 14);
    doc.text(`Total em aberto: ${formatCurrency(pending)}`, mL + 70, 14);

    // ─── Tabela ────────────────────────────────────────────────
    const headers = ['Aluno', 'RA', 'Curso', 'Parcela', 'Valor', 'Vencimento', 'Situacao', 'Pagamento', 'Observacoes'];
    const colX    = [mL, 60, 90, 130, 148, 168, 190, 214, 238];
    let y = 26;

    // Cabeçalho da tabela
    doc.setFillColor(245, 245, 245);
    doc.rect(mL - 2, y - 4, mR - mL + 4, 7, 'F');
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
    headers.forEach((h, i) => doc.text(h, colX[i], y));
    y += 4;
    doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3);
    doc.line(mL - 2, y, mR + 2, y);
    y += 4;

    // Linhas de dados
    let rowBg = false;
    allPayments.forEach(p => {
      if (y > H - 14) {
        // Nova página
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
      doc.text((p.students?.name || '—').substring(0, 22), colX[0], y);
      doc.text(p.students?.ra || '—', colX[1], y);
      doc.text((p.enrollments?.piece_course || '—').substring(0, 16), colX[2], y);
      doc.text(`${p.installment_number || '—'} / ${p.enrollments?.payment_installments || '—'}`, colX[3], y);

      // Valor em negrito
      doc.setFont('helvetica', 'bold');
      doc.text(formatCurrency(p.amount), colX[4], y);
      doc.setFont('helvetica', 'normal');

      doc.text(formatDate(p.due_date), colX[5], y);

      // Status colorido
      const statusColor = { paid: [39, 174, 96], pending: [200, 140, 20], overdue: [192, 57, 43] };
      const sc = statusColor[p.status] || [100, 100, 100];
      doc.setTextColor(...sc);
      doc.setFont('helvetica', 'bold');
      doc.text(STATUS_LABELS[p.status] || p.status, colX[6], y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(20, 20, 20);

      doc.text(p.paid_date ? formatDate(p.paid_date) : '—', colX[7], y);
      doc.text((p.observations || '').substring(0, 20), colX[8], y);

      y += 6.5;
      doc.setDrawColor(230, 230, 230);
      doc.line(mL - 2, y - 2.5, mR + 2, y - 2.5);
    });

    // ─── Rodapé ────────────────────────────────────────────────
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

    doc.save(`relatorio-financeiro-tpc-${now.toISOString().split('T')[0]}.pdf`);
  }

  return { render, filter, markPaid, markPending, openEdit, savePayment, exportReport };
})();
