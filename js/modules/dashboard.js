const DashboardModule = (() => {

  // Estado do filtro de matrículas
  let lastEnrollments  = [];
  let enrollFilterMode = 'day'; // 'day' | 'range'

  const TYPE_LABELS = { matricula: 'Matrícula', rematricula: 'Rematrícula', producao: 'Produção' };
  const TYPE_BADGE  = { matricula: 'badge-success', rematricula: 'badge-warning', producao: 'badge-info' };

  async function render() {
    const el = document.getElementById('view-content');
    el.innerHTML = `<div class="loading-state">Carregando...</div>`;

    try {
      const [studentsRes, paymentsRes, enrollmentsRes] = await Promise.all([
        db.from('students').select('id, status'),
        db.from('payments').select('amount, discount_amount, status, due_date, paid_date'),
        db.from('enrollments').select('id, status, student_id, class_id')
      ]);

      const students    = studentsRes.data   || [];
      const payments    = paymentsRes.data   || [];
      const enrollments = enrollmentsRes.data || [];

      const now       = new Date();
      const thisMonth = now.getMonth();
      const thisYear  = now.getFullYear();
      const todayStr  = now.toISOString().split('T')[0];

      function eff(p) {
        const disc = Number(p.discount_amount || 0);
        if (!disc || p.status === 'paid') return Number(p.amount);
        const due    = new Date(p.due_date + 'T00:00:00');
        const cutoff = new Date(due.getFullYear(), due.getMonth(), 12, 23, 59, 59);
        return new Date() > cutoff ? Number(p.amount) + disc : Number(p.amount);
      }

      const paidThisMonth = payments.filter(p =>
        p.status === 'paid' && p.paid_date &&
        new Date(p.paid_date).getMonth() === thisMonth &&
        new Date(p.paid_date).getFullYear() === thisYear
      );

      const pendingThisMonth = payments.filter(p => {
        const due = new Date(p.due_date);
        return p.status !== 'paid' &&
          due.getMonth() === thisMonth &&
          due.getFullYear() === thisYear;
      });

      const forecastThisMonth = payments.filter(p => {
        const due = new Date(p.due_date);
        return due.getMonth() === thisMonth && due.getFullYear() === thisYear;
      });

      const realized    = paidThisMonth.reduce((s, p)    => s + Number(p.amount), 0);
      const forecast    = forecastThisMonth.reduce((s, p) => s + eff(p), 0);
      const pending     = pendingThisMonth.reduce((s, p)  => s + eff(p), 0);
      const defaultRate = forecast > 0 ? ((pending / forecast) * 100).toFixed(1) : 0;

      const activeStudents = students.filter(s => s.status === 'active').length;
      const isAdmin        = Auth.isAdmin();
      const canManage      = Auth.canManageStudents();

      el.innerHTML = `
        <div class="view-header">
          <h1 class="view-title">Dashboard</h1>
          <span class="view-subtitle">${now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span>
        </div>

        <div class="cards-grid">
          <div class="card stat-card">
            <div class="stat-label">Alunos Ativos</div>
            <div class="stat-value">${activeStudents}</div>
            <div class="stat-desc">total matriculados</div>
          </div>
          <div class="card stat-card">
            <div class="stat-label">Turmas Ativas</div>
            <div class="stat-value" id="active-classes-count">—</div>
            <div class="stat-desc">em andamento</div>
          </div>
          ${isAdmin ? `
          <div class="card stat-card accent">
            <div class="stat-label">Receita Realizada</div>
            <div class="stat-value">${formatCurrency(realized)}</div>
            <div class="stat-desc">mês atual</div>
          </div>
          <div class="card stat-card ${Number(defaultRate) > 20 ? 'danger' : ''}">
            <div class="stat-label">Inadimplência</div>
            <div class="stat-value">${defaultRate}%</div>
            <div class="stat-desc">${formatCurrency(pending)} pendentes</div>
          </div>
          <div class="card stat-card">
            <div class="stat-label">Faturamento Previsto</div>
            <div class="stat-value">${formatCurrency(forecast)}</div>
            <div class="stat-desc">mês atual</div>
          </div>
          ` : ''}
        </div>

        ${isAdmin ? `
        <div class="section-header mt-6">
          <h2 class="section-title">Pagamentos em Aberto</h2>
        </div>
        <div id="pending-payments-table"></div>
        ` : ''}

        <div class="section-header mt-6" style="flex-wrap:wrap;gap:8px;align-items:flex-start">
          <div>
            <h2 class="section-title" style="margin-bottom:0">Matrículas</h2>
            <div class="text-secondary" style="font-size:11px;margin-top:2px" id="enroll-section-label">Hoje — ${now.toLocaleDateString('pt-BR')}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-left:auto">
            <div id="enroll-date-filter" style="display:none;gap:8px;align-items:center">
              <input type="date" id="enroll-date-start" class="input" style="width:150px" value="${todayStr}">
              <span class="text-secondary" style="font-size:12px">até</span>
              <input type="date" id="enroll-date-end" class="input" style="width:150px" value="${todayStr}">
              <button class="btn btn-primary" style="font-size:12px;padding:6px 12px"
                onclick="DashboardModule.applyDateFilter()">Filtrar</button>
            </div>
            <button id="btn-enroll-toggle" class="btn btn-secondary" style="font-size:12px;padding:6px 12px"
              onclick="DashboardModule.toggleDateFilter()">Matrículas anteriores</button>
            ${canManage ? `<button class="btn btn-secondary" style="font-size:12px;padding:6px 12px"
              onclick="DashboardModule.exportEnrollmentsPDF()">&#8595; Exportar PDF</button>` : ''}
          </div>
        </div>
        <div id="recent-enrollments-table"></div>
      `;

      await loadActiveClassesCount();
      if (isAdmin) await loadPendingPayments();
      await loadRecentEnrollments(todayStr, todayStr);

    } catch (err) {
      console.error(err);
      document.getElementById('view-content').innerHTML =
        `<div class="error-state">Erro ao carregar dashboard.</div>`;
    }
  }

  async function loadActiveClassesCount() {
    const { count } = await db.from('classes').select('*', { count: 'exact', head: true }).eq('status', 'active');
    const el = document.getElementById('active-classes-count');
    if (el) el.textContent = count ?? 0;
  }

  async function loadPendingPayments() {
    const { data } = await db.from('payments')
      .select('*, students(name, ra)')
      .in('status', ['pending', 'overdue'])
      .order('due_date', { ascending: true })
      .limit(8);

    const container = document.getElementById('pending-payments-table');
    if (!container) return;

    if (!data?.length) {
      container.innerHTML = `<p class="empty-state">Nenhum pagamento pendente.</p>`;
      return;
    }

    container.innerHTML = `
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>Aluno</th><th>RA</th><th>Valor</th>
            <th>Vencimento</th><th>Situacao</th>
          </tr></thead>
          <tbody>
            ${data.map(p => {
              const due    = new Date(p.due_date + 'T00:00:00');
              const today  = new Date(); today.setHours(0, 0, 0, 0);
              const overdue = p.status === 'overdue' || due < today;
              const disc    = Number(p.discount_amount || 0);
              const cutoff  = new Date(due.getFullYear(), due.getMonth(), 12, 23, 59, 59);
              const effAmt  = disc > 0 && new Date() > cutoff ? Number(p.amount) + disc : Number(p.amount);
              return `<tr>
                <td>${escapeHtml(p.students?.name || '—')}</td>
                <td class="text-accent">${escapeHtml(p.students?.ra || '—')}</td>
                <td>${formatCurrency(effAmt)}${disc > 0 && new Date() > cutoff ? `<div style="font-size:10px;color:var(--danger)">Desconto perdido</div>` : ''}</td>
                <td>${formatDate(p.due_date)}</td>
                <td><span class="badge ${overdue ? 'badge-danger' : 'badge-warning'}">
                  ${overdue ? 'Em Atraso' : 'Pendente'}
                </span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // ─── Toggle filtro de data ─────────────────────────────────────────
  function toggleDateFilter() {
    const filterDiv = document.getElementById('enroll-date-filter');
    const btn       = document.getElementById('btn-enroll-toggle');
    if (!filterDiv) return;

    enrollFilterMode = enrollFilterMode === 'day' ? 'range' : 'day';
    filterDiv.style.display = enrollFilterMode === 'range' ? 'flex' : 'none';
    btn.textContent = enrollFilterMode === 'range' ? 'Hoje' : 'Matrículas anteriores';

    if (enrollFilterMode === 'day') {
      const today = new Date().toISOString().split('T')[0];
      loadRecentEnrollments(today, today);
      const label = document.getElementById('enroll-section-label');
      if (label) label.textContent = `Hoje — ${new Date().toLocaleDateString('pt-BR')}`;
    }
  }

  async function applyDateFilter() {
    const start = document.getElementById('enroll-date-start')?.value;
    const end   = document.getElementById('enroll-date-end')?.value;
    if (!start || !end) { toast('Selecione as datas.', 'warning'); return; }
    if (start > end)    { toast('Data inicial deve ser antes da final.', 'warning'); return; }

    const label = document.getElementById('enroll-section-label');
    if (label) {
      const s = new Date(start + 'T12:00:00').toLocaleDateString('pt-BR');
      const e = new Date(end   + 'T12:00:00').toLocaleDateString('pt-BR');
      label.textContent = start === end ? s : `${s} até ${e}`;
    }
    await loadRecentEnrollments(start, end);
  }

  async function loadRecentEnrollments(dateStart, dateEnd) {
    const container = document.getElementById('recent-enrollments-table');
    if (!container) return;
    container.innerHTML = `<div class="loading-state" style="padding:1rem">Carregando...</div>`;

    const { data, error } = await db.from('enrollments')
      .select(`id, created_at, status, piece_course, responsible_teacher, student_id,
               students(id, name, ra, enrollments(id)),
               classes(id, day_of_week, courses(name, level, type), profiles(name)),
               payments(amount, discount_amount, payment_method, installment_number, status)`)
      .gte('created_at', dateStart + 'T00:00:00')
      .lte('created_at', dateEnd   + 'T23:59:59')
      .order('created_at', { ascending: false });

    if (error) {
      container.innerHTML = `<p class="empty-state">Erro ao carregar matrículas.</p>`;
      return;
    }

    lastEnrollments = data || [];

    if (!lastEnrollments.length) {
      container.innerHTML = `<p class="empty-state">Nenhuma matrícula no período.</p>`;
      return;
    }

    container.innerHTML = `
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>Tipo</th><th>Aluno</th><th>RA</th><th>Curso / Nível</th>
            <th>Dia</th><th>Professor</th><th>Data</th><th>Situacao</th>
          </tr></thead>
          <tbody>
            ${lastEnrollments.map(e => {
              const tipo  = getEnrollmentType(e);
              const nivel = e.classes?.courses?.level ? `Nível ${e.classes.courses.level}` : '';
              const dia   = DAYS_PT[e.classes?.day_of_week] || '—';
              const prof  = e.classes?.profiles?.name || e.responsible_teacher || '—';
              const curso = e.classes?.courses?.name || e.piece_course || '—';
              const data  = e.created_at
                ? new Date(e.created_at).toLocaleDateString('pt-BR')
                : '—';
              return `<tr>
                <td><span class="badge ${TYPE_BADGE[tipo] || 'badge-secondary'}">${TYPE_LABELS[tipo] || tipo}</span></td>
                <td>${escapeHtml(e.students?.name || '—')}</td>
                <td class="text-accent">${escapeHtml(e.students?.ra || '—')}</td>
                <td>${escapeHtml(curso)}${nivel ? ` <span class="text-secondary" style="font-size:11px">· ${nivel}</span>` : ''}</td>
                <td class="text-secondary">${escapeHtml(dia)}</td>
                <td>${escapeHtml(prof)}</td>
                <td class="text-secondary">${data}</td>
                <td><span class="badge badge-${e.status === 'active' ? 'success' : 'secondary'}">
                  ${STATUS_LABELS[e.status] || e.status}
                </span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // ─── Tipo de matrícula ─────────────────────────────────────────────
  function getEnrollmentType(e) {
    if (e.classes?.courses?.type === 'production') return 'producao';
    const total = (e.students?.enrollments || []).length;
    return total > 1 ? 'rematricula' : 'matricula';
  }

  // ─── Exportar matrículas do período como PDF (janela de impressão) ──
  function exportEnrollmentsPDF() {
    if (!lastEnrollments.length) {
      toast('Nenhuma matrícula para exportar.', 'warning');
      return;
    }

    const label  = document.getElementById('enroll-section-label')?.textContent || 'Matrículas';
    const METHOD = { pix: 'PIX', cash: 'Dinheiro', debit: 'Débito' };

    function firstPayment(e) {
      return (e.payments || []).sort((a, b) => (a.installment_number || 0) - (b.installment_number || 0))[0] || null;
    }

    let totalPago = 0;
    const rows = lastEnrollments.map(e => {
      const tipo  = getEnrollmentType(e);
      const nivel = e.classes?.courses?.level ? `Nível ${e.classes.courses.level}` : '—';
      const dia   = DAYS_PT[e.classes?.day_of_week] || '—';
      const prof  = e.classes?.profiles?.name || e.responsible_teacher || '—';
      const curso = e.classes?.courses?.name  || e.piece_course || '—';
      const pmt   = firstPayment(e);
      const valor = pmt ? Number(pmt.amount) : 0;
      const forma = pmt?.payment_method ? METHOD[pmt.payment_method] : '—';
      totalPago  += valor;

      const tipoBg = tipo === 'producao' ? '#3b82f6' : tipo === 'rematricula' ? '#f59e0b' : '#22c55e';

      return `<tr>
        <td><span style="background:${tipoBg}22;color:${tipoBg};border:1px solid ${tipoBg}44;
          border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700;white-space:nowrap">
          ${TYPE_LABELS[tipo] || tipo}
        </span></td>
        <td><strong>${escapeHtml(e.students?.name || '—')}</strong></td>
        <td>${escapeHtml(nivel)}</td>
        <td>${escapeHtml(dia)}</td>
        <td>${escapeHtml(prof)}</td>
        <td style="text-align:right;white-space:nowrap">${formatCurrency(valor)}</td>
        <td style="white-space:nowrap">${escapeHtml(forma)}</td>
      </tr>`;
    }).join('');

    const today = new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Matrículas — ${label}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700;900&display=swap" rel="stylesheet">
<style>
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:'Roboto',Arial,sans-serif; color:#111; padding:28px 36px; font-size:12px; }
.pdf-header { text-align:center; margin-bottom:24px; }
.main-title { font-size:20px; font-weight:900; letter-spacing:3px; text-transform:uppercase; margin-bottom:6px; }
.sub-title { font-size:13px; color:#444; margin-bottom:3px; }
.updated-label { font-size:10px; color:#888; }
table { width:100%; border-collapse:collapse; margin-top:8px; }
th {
  background:#111; color:#fff; padding:7px 8px;
  font-size:10px; font-weight:700; letter-spacing:0.5px;
  text-align:left; border:1px solid #111;
}
td { border:1px solid #ccc; padding:6px 8px; font-size:11px; vertical-align:middle; }
tr:nth-child(even) td { background:#f9f9f9; }
.footer-row td {
  background:#111; color:#fff; font-weight:700;
  font-size:12px; border-color:#111;
  text-align:right; padding:8px;
}
.footer-row td:first-child { text-align:left; letter-spacing:1px; text-transform:uppercase; }
.pdf-footer { margin-top:20px; text-align:center; font-size:10px; color:#888; font-style:italic; }
@media print { body { padding:12px 16px; } }
</style>
</head>
<body>
<div class="pdf-header">
  <div class="main-title">TPC — Teatro Popular de Comédia</div>
  <div class="sub-title">Matrículas — ${escapeHtml(label)}</div>
  <div class="updated-label">Gerado em ${today}</div>
</div>
<table>
  <thead>
    <tr>
      <th>Tipo</th>
      <th>Nome completo</th>
      <th>Nível</th>
      <th>Dia da semana</th>
      <th>Professor</th>
      <th style="text-align:right">Valor pago</th>
      <th>Forma de Pagamento</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
    <tr class="footer-row">
      <td colspan="5">Total</td>
      <td>${formatCurrency(totalPago)}</td>
      <td></td>
    </tr>
  </tbody>
</table>
<div class="pdf-footer">TPC Digital — ${lastEnrollments.length} matrícula${lastEnrollments.length !== 1 ? 's' : ''} no período</div>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) { toast('Permita popups no navegador para exportar o PDF.', 'warning'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    w.document.fonts.ready
      .then(() => setTimeout(() => w.print(), 200))
      .catch(()  => setTimeout(() => w.print(), 1400));
  }

  return { render, toggleDateFilter, applyDateFilter, exportEnrollmentsPDF };
})();
