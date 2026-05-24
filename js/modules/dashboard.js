const DashboardModule = (() => {

  async function render() {
    const el = document.getElementById('view-content');
    el.innerHTML = `<div class="loading-state">Carregando...</div>`;

    try {
      const [studentsRes, paymentsRes, enrollmentsRes] = await Promise.all([
        db.from('students').select('id, status'),
        db.from('payments').select('amount, discount_amount, status, due_date, paid_date'),
        db.from('enrollments').select('id, status, student_id, class_id')
      ]);

      const students   = studentsRes.data   || [];
      const payments   = paymentsRes.data   || [];
      const enrollments = enrollmentsRes.data || [];

      const now        = new Date();
      const thisMonth  = now.getMonth();
      const thisYear   = now.getFullYear();

      // Valor efetivo: sem desconto se não pago após dia 12 do mês
      function eff(p) {
        const disc = Number(p.discount_amount || 0);
        if (!disc || p.status === 'paid') return Number(p.amount);
        const due = new Date(p.due_date + 'T00:00:00');
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

      const realized    = paidThisMonth.reduce((s, p)     => s + Number(p.amount), 0);
      const forecast    = forecastThisMonth.reduce((s, p)  => s + eff(p), 0);
      const pending     = pendingThisMonth.reduce((s, p)   => s + eff(p), 0);
      const defaultRate = forecast > 0 ? ((pending / forecast) * 100).toFixed(1) : 0;

      const activeStudents = students.filter(s => s.status === 'active').length;
      const isAdmin = Auth.isAdmin();

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

        <div class="section-header mt-6">
          <h2 class="section-title">Ultimas Matriculas</h2>
        </div>
        <div id="recent-enrollments-table"></div>
      `;

      await loadActiveClassesCount();
      if (isAdmin) await loadPendingPayments();
      await loadRecentEnrollments();

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
              const today  = new Date(); today.setHours(0,0,0,0);
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

  async function loadRecentEnrollments() {
    const { data } = await db.from('enrollments')
      .select('id, created_at, status, piece_course, responsible_teacher, students(name, ra), classes(courses(name), profiles(name))')
      .order('created_at', { ascending: false })
      .limit(8);

    const container = document.getElementById('recent-enrollments-table');
    if (!container) return;

    if (!data?.length) {
      container.innerHTML = `<p class="empty-state">Nenhuma matricula recente.</p>`;
      return;
    }

    container.innerHTML = `
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>Aluno</th><th>RA</th><th>Curso</th>
            <th>Professor</th><th>Data da Matricula</th><th>Situacao</th>
          </tr></thead>
          <tbody>
            ${data.map(e => {
              const enrolledAt = e.created_at
                ? new Date(e.created_at).toLocaleDateString('pt-BR')
                : '—';
              return `<tr>
                <td>${escapeHtml(e.students?.name || '—')}</td>
                <td class="text-accent">${escapeHtml(e.students?.ra || '—')}</td>
                <td>${escapeHtml(e.classes?.courses?.name || e.piece_course || '—')}</td>
                <td>${escapeHtml(e.classes?.profiles?.name || e.responsible_teacher || '—')}</td>
                <td class="text-secondary">${enrolledAt}</td>
                <td><span class="badge badge-${e.status === 'active' ? 'success' : 'secondary'}">
                  ${STATUS_LABELS[e.status] || e.status}
                </span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  return { render };
})();
