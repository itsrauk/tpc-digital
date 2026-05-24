const StudentsModule = (() => {
  let allStudents = [];
  let selectedIds = new Set();
  let pendingContractData = null;

  // ─── Render principal ─────────────────────────────────────
  async function render() {
    const el = document.getElementById('view-content');
    el.innerHTML = `<div class="loading-state">Carregando alunos...</div>`;
    await loadStudents();
  }

  async function loadStudents(search = '') {
    try {
      let query = db.from('students')
        .select(`id, ra, name, email, status, birth_date, student_phone,
          enrollments(id, status, piece_course, responsible_teacher, period_start, period_end, workload_label,
            classes(courses(name, level, type), profiles(name)))`)
        .order('name');

      if (search) query = query.ilike('name', `%${search}%`);
      const { data, error } = await query;
      if (error) throw error;
      allStudents = data || [];
      renderTable();
    } catch (err) {
      const isRLS = err.message?.includes('row-level security')
        || err.message?.includes('permission denied')
        || err.code === '42501' || err.code === 'PGRST301';
      document.getElementById('view-content').innerHTML = isRLS
        ? `<div class="error-state" style="max-width:560px;margin:2rem auto;text-align:left;line-height:1.7;">
            <strong style="font-size:1rem;">Permissao negada pelo banco de dados.</strong><br><br>
            Execute o arquivo <code style="background:var(--bg-tertiary);padding:2px 6px;border-radius:4px;">sql/fix_v3.sql</code>
            no <strong>Supabase → SQL Editor</strong> e recarregue a pagina.<br><br>
            <span style="font-size:0.85rem;color:var(--text-muted)">
              Isso corrige as politicas de acesso (RLS) que bloqueiam leitura e escrita.
            </span>
          </div>`
        : `<div class="error-state">Erro ao carregar alunos: ${escapeHtml(err.message)}</div>`;
    }
  }

  function renderTable() {
    const el = document.getElementById('view-content');
    const isAdmin = Auth.isAdmin();

    el.innerHTML = `
      <div class="view-header">
        <h1 class="view-title">Alunos</h1>
        <div class="view-actions">
          <div class="search-box">
            <input type="text" id="search-students" class="input" placeholder="Buscar por nome...">
          </div>
          ${isAdmin ? `
          <div class="batch-actions" id="batch-actions" style="display:none">
            <button class="btn btn-secondary" onclick="StudentsModule.exportCards()">Carteirinhas</button>
            <button class="btn btn-secondary" onclick="StudentsModule.exportCertificates()">Certificados</button>
          </div>
          <button class="btn btn-primary" onclick="StudentsModule.openForm()">Nova Matricula</button>
          ` : ''}
        </div>
      </div>

      <div class="table-wrapper">
        <table class="data-table" id="students-table">
          <thead><tr>
            ${isAdmin ? '<th class="col-check"><input type="checkbox" id="check-all" onchange="StudentsModule.toggleAll(this)"></th>' : ''}
            <th>Aluno</th>
            <th>Matricula (RA)</th>
            <th>Nivel / Curso</th>
            <th>Professor</th>
            <th>Situacao Fin.</th>
            <th>Acoes</th>
          </tr></thead>
          <tbody id="students-tbody">
            ${renderRows(isAdmin)}
          </tbody>
        </table>
        ${allStudents.length === 0 ? '<p class="empty-state">Nenhum aluno encontrado.</p>' : ''}
      </div>
    `;

    document.getElementById('search-students')?.addEventListener('input',
      debounce(e => loadStudents(e.target.value))
    );

    selectedIds.clear();
  }

  function renderRows(isAdmin) {
    return allStudents.map(s => {
      const activeEnrollments = s.enrollments?.filter(e => e.status === 'active') || [];
      const activeEnrollment  = activeEnrollments[0];
      const courseName = activeEnrollment?.classes?.courses?.name
        || activeEnrollment?.piece_course || '—';
      const teacher = activeEnrollment?.classes?.profiles?.name
        || activeEnrollment?.responsible_teacher || '—';
      const age = calcAge(s.birth_date);
      const multiEnroll = activeEnrollments.length > 1;

      return `<tr data-id="${s.id}">
        ${isAdmin ? `<td class="col-check">
          <input type="checkbox" class="row-check" value="${s.id}"
            onchange="StudentsModule.toggleRow(this)">
        </td>` : ''}
        <td>
          <div class="cell-name">${escapeHtml(s.name)}${multiEnroll
            ? ` <span class="badge badge-info" style="font-size:0.7rem;padding:1px 5px;margin-left:4px;">${activeEnrollments.length} matr.</span>`
            : ''}</div>
          <div class="cell-sub">${age !== null ? age + ' anos' : ''} ${s.student_phone ? '· ' + s.student_phone : ''}</div>
        </td>
        <td class="text-accent">${escapeHtml(s.ra || '—')}</td>
        <td>${escapeHtml(courseName)}</td>
        <td>${escapeHtml(teacher)}</td>
        <td><span class="badge badge-${s.status === 'active' ? 'success' : 'secondary'}">
          ${STATUS_LABELS[s.status] || s.status}
        </span></td>
        <td class="actions-cell">
          <button class="btn-icon" title="Detalhes" onclick="StudentsModule.openDetail('${s.id}')">
            Ver
          </button>
          ${isAdmin ? `
          <button class="btn-icon" title="Editar" onclick="StudentsModule.openForm('${s.id}')">
            Editar
          </button>
          <button class="btn-icon btn-icon-danger" title="Excluir" onclick="StudentsModule.deleteStudent('${s.id}')">
            Excluir
          </button>` : ''}
        </td>
      </tr>`;
    }).join('');
  }

  // ─── Seleção em lote ──────────────────────────────────────
  function toggleAll(checkbox) {
    document.querySelectorAll('.row-check').forEach(c => {
      c.checked = checkbox.checked;
      if (checkbox.checked) selectedIds.add(c.value);
      else selectedIds.delete(c.value);
    });
    updateBatchActions();
  }

  function toggleRow(checkbox) {
    if (checkbox.checked) selectedIds.add(checkbox.value);
    else selectedIds.delete(checkbox.value);
    updateBatchActions();
  }

  function updateBatchActions() {
    const el = document.getElementById('batch-actions');
    if (el) el.style.display = selectedIds.size > 0 ? 'flex' : 'none';
  }

  // ─── Exportação em lote ───────────────────────────────────
  async function exportCards() {
    const students = allStudents.filter(s => selectedIds.has(s.id));
    if (!students.length) return toast('Selecione ao menos um aluno.', 'warning');
    const doc = await PDFGen.batchCards(students);
    PDFGen.downloadPDF(doc, `carteirinhas-tpc-${Date.now()}.pdf`);
  }

  async function exportCertificates() {
    const students = allStudents.filter(s => selectedIds.has(s.id));
    if (!students.length) return toast('Selecione ao menos um aluno.', 'warning');
    const { data: enrollments } = await db.from('enrollments')
      .select('*').in('student_id', students.map(s => s.id));
    const doc = await PDFGen.batchCertificates(students, enrollments || []);
    PDFGen.downloadPDF(doc, `certificados-tpc-${Date.now()}.pdf`);
  }

  // ─── Detalhes do aluno ────────────────────────────────────
  async function openDetail(id) {
    // Busca dados completos do aluno (loadStudents só traz colunas da tabela — sem RG, CPF etc.)
    const { data: student } = await db.from('students').select('*').eq('id', id).single();
    if (!student) return;

    const { data: enrollments } = await db.from('enrollments')
      .select('*, classes(courses(name, level, type), profiles(name))')
      .eq('student_id', id);

    const { data: payments } = await db.from('payments')
      .select('*').eq('student_id', id).order('due_date');

    openModal('Ficha do Aluno', `
      <div class="detail-grid">
        <div class="detail-section">
          <h3 class="detail-section-title">Dados Pessoais</h3>
          <div class="detail-row"><span>Nome</span><strong>${escapeHtml(student.name)}</strong></div>
          <div class="detail-row"><span>RA</span><strong class="text-accent">${escapeHtml(student.ra || '—')}</strong></div>
          <div class="detail-row"><span>E-mail</span><strong>${escapeHtml(student.email || '—')}</strong></div>
          <div class="detail-row"><span>Nascimento</span><strong>${formatDate(student.birth_date)}</strong></div>
          <div class="detail-row"><span>Idade</span><strong>${calcAge(student.birth_date) ?? '—'} anos</strong></div>
          <div class="detail-row"><span>RG</span><strong>${escapeHtml(student.rg || '—')}</strong></div>
          <div class="detail-row"><span>CPF</span><strong>${escapeHtml(student.cpf || '—')}</strong></div>
          <div class="detail-row"><span>Filiacao</span><strong>${escapeHtml(student.filiation || '—')}</strong></div>
          <div class="detail-row"><span>Contratante</span><strong>${escapeHtml(student.contractor_name || '—')}</strong></div>
          <div class="detail-row"><span>Telefone</span><strong>${escapeHtml(student.student_phone || '—')}</strong></div>
          <div class="detail-row"><span>Tel. Recado</span><strong>${escapeHtml(student.message_phone || '—')}</strong></div>
          <div class="detail-row"><span>Local Trabalho</span><strong>${escapeHtml(student.workplace || '—')}</strong></div>
          <div class="detail-row"><span>Cargo</span><strong>${escapeHtml(student.position || '—')}</strong></div>
          <div class="detail-row"><span>Endereco</span><strong>${escapeHtml([student.address, student.address_number, student.neighborhood, student.city, student.state].filter(Boolean).join(', ') || '—')}</strong></div>
          <div class="detail-row"><span>CEP</span><strong>${escapeHtml(student.zip_code || '—')}</strong></div>
        </div>

        <div class="detail-section">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">
            <h3 class="detail-section-title" style="margin:0;">Matriculas</h3>
            ${Auth.isAdmin() ? `
            <button class="btn btn-primary btn-sm"
              onclick="StudentsModule.openEnrollmentForm('${id}')">+ Nova Matricula</button>
            ` : ''}
          </div>
          ${(() => {
            const all   = enrollments || [];
            const main  = all.filter(e => e.status === 'active' && e.classes?.courses?.type !== 'production');
            const prods = all.filter(e => e.status === 'active' && e.classes?.courses?.type === 'production');
            const hist  = all.filter(e => e.status !== 'active');
            function card(e) {
              const level = e.classes?.courses?.level || '';
              const disc  = Number(e.discount || 0);
              const pmt   = Number(e.payment_installments) || 1;
              const installAmt = disc > 0 ? (Number(e.total_value) / pmt - disc) : null;
              return `<div class="enrollment-card">
                <div class="enrollment-card-header">
                  <div>
                    <div class="enrollment-course">${escapeHtml(e.classes?.courses?.name || e.piece_course || '—')}${level ? ` <span style="color:var(--text-muted);font-size:0.82em">${escapeHtml(level)}</span>` : ''}</div>
                  </div>
                  <span class="badge badge-${e.status === 'active' ? 'success' : 'secondary'}">${STATUS_LABELS[e.status] || e.status}</span>
                </div>
                <div class="enrollment-meta">
                  Professor: ${escapeHtml(e.classes?.profiles?.name || e.responsible_teacher || '—')}<br>
                  Periodo: ${fmtPeriodDisplay(e.period_start, e.period_end)}<br>
                  Carga: ${escapeHtml(e.workload_label || '—')}<br>
                  Valor: ${formatCurrency(e.total_value)} (${e.payment_installments}x)${installAmt !== null ? ` — <span style="color:var(--success);font-size:0.82em">${formatCurrency(installAmt)}/parc. ate dia 12</span>` : ''}
                </div>
                ${e.status === 'active' && Auth.isAdmin() ? `<div class="enrollment-actions">
                  <button class="btn btn-secondary btn-sm" onclick="StudentsModule.openEnrollmentEditForm('${e.id}', '${id}')">Editar</button>
                  <button class="btn btn-secondary btn-sm" onclick="StudentsModule.exportEnrollmentContract('${id}', '${e.id}')">Contrato</button>
                  <button class="btn btn-danger btn-sm" onclick="StudentsModule.cancelEnrollment('${e.id}', '${id}')">Cancelar</button>
                </div>` : ''}
              </div>`;
            }
            if (!all.length) return '<p class="empty-state">Sem matriculas.</p>';
            let html = '';
            if (main.length)  { html += '<p style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:.4rem">Curso Principal</p>' + main.map(card).join(''); }
            if (prods.length) { html += '<p style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin:.75rem 0 .4rem">Producoes</p>'    + prods.map(card).join(''); }
            if (hist.length)  { html += '<p style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin:.75rem 0 .4rem">Historico</p>'    + hist.map(card).join(''); }
            return html;
          })()}

          <h3 class="detail-section-title mt-4">Pagamentos</h3>
          ${payments?.length ? `
            <div class="table-wrapper mini">
              <table class="data-table">
                <thead><tr><th>Parc.</th><th>Vencimento</th><th>Valor</th><th>Situacao</th></tr></thead>
                <tbody>
                  ${payments.map(p => `<tr>
                    <td>${p.installment_number || '—'}</td>
                    <td>${formatDate(p.due_date)}</td>
                    <td>${formatCurrency(p.amount)}</td>
                    <td><span class="badge badge-${p.status === 'paid' ? 'success' : p.status === 'overdue' ? 'danger' : 'warning'}">
                      ${STATUS_LABELS[p.status] || p.status}
                    </span></td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </div>` : '<p class="empty-state">Sem lancamentos.</p>'}
        </div>
      </div>

      ${Auth.isAdmin() ? `
      <div class="modal-footer-actions">
        <button class="btn btn-secondary" onclick="StudentsModule.exportStudentCard('${student.id}')">
          Gerar Carteirinha
        </button>
        <button class="btn btn-secondary" onclick="StudentsModule.exportStudentCert('${student.id}')">
          Gerar Certificado
        </button>
        <button class="btn btn-secondary" onclick="StudentsModule.exportStudentContract('${student.id}')">
          Gerar Contrato
        </button>
        ${payments?.length ? `
        <button class="btn btn-secondary" onclick="StudentsModule.openPaymentBookConfig('${student.id}')">
          Gerar Carne
        </button>` : ''}
      </div>` : ''}
    `, true);
  }

  async function exportStudentCard(id) {
    const student = allStudents.find(s => s.id === id);
    if (!student) return;
    const doc = PDFGen.studentCard(student);
    PDFGen.downloadPDF(doc, `carteirinha-${student.ra || student.id}.pdf`);
  }

  async function exportStudentCert(id) {
    const student = allStudents.find(s => s.id === id);
    if (!student) return;
    const { data: enrollments } = await db.from('enrollments').select('*').eq('student_id', id);
    const enrollment = enrollments?.[0];
    const doc = PDFGen.certificate(student, enrollment);
    PDFGen.downloadPDF(doc, `certificado-${student.ra || student.id}.pdf`);
  }

  async function openPaymentBookConfig(studentId) {
    const student = allStudents.find(s => s.id === studentId);
    if (!student) return;

    openModal('Configurar Carne de Pagamento', `
      <p class="modal-desc">Selecione os campos que devem constar no carne:</p>
      <div class="fields-config">
        <label class="checkbox-label"><input type="checkbox" name="field-name" checked> Nome do Aluno</label>
        <label class="checkbox-label"><input type="checkbox" name="field-ra" checked> RA / Matricula</label>
        <label class="checkbox-label"><input type="checkbox" name="field-amount" checked> Valor da Parcela</label>
        <label class="checkbox-label"><input type="checkbox" name="field-dueDate" checked> Data de Vencimento</label>
        <label class="checkbox-label"><input type="checkbox" name="field-installment" checked> Numero da Parcela</label>
        <label class="checkbox-label"><input type="checkbox" name="field-observations"> Observacoes</label>
      </div>
      <div class="modal-actions mt-4">
        <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="StudentsModule.generatePaymentBook('${studentId}')">
          Gerar PDF
        </button>
      </div>
    `);
  }

  async function generatePaymentBook(studentId) {
    const student = allStudents.find(s => s.id === studentId);
    if (!student) return;

    const fields = {
      name:         document.querySelector('[name="field-name"]')?.checked,
      ra:           document.querySelector('[name="field-ra"]')?.checked,
      amount:       document.querySelector('[name="field-amount"]')?.checked,
      dueDate:      document.querySelector('[name="field-dueDate"]')?.checked,
      installment:  document.querySelector('[name="field-installment"]')?.checked,
      observations: document.querySelector('[name="field-observations"]')?.checked,
    };

    const { data: payments } = await db.from('payments')
      .select('*').eq('student_id', studentId).order('due_date');

    if (!payments?.length) return toast('Nenhum pagamento encontrado.', 'warning');

    const doc = PDFGen.paymentBook(student, payments, fields);
    PDFGen.downloadPDF(doc, `carne-${student.ra || student.id}.pdf`);
    closeModal();
  }

  // ─── Formulário de Matrícula ──────────────────────────────
  async function openForm(id = null) {
    const isEdit = !!id;
    let student = null;
    let enrollment = null;

    if (isEdit) {
      const { data: s } = await db.from('students').select('*').eq('id', id).single();
      const { data: e } = await db.from('enrollments')
        .select('*, classes(id, courses(id, name), profiles(id, name))')
        .eq('student_id', id).eq('status', 'active').single();
      student = s;
      enrollment = e;
    }

    const { data: classes } = await db.from('classes')
      .select('id, day_of_week, schedule, courses(name, level, type), profiles(name)')
      .eq('status', 'active');

    const { data: teachers } = await db.from('profiles').select('id, name').eq('role', 'teacher');

    const classOptions = (classes || []).map(c =>
      `<option value="${c.id}" ${enrollment?.class_id === c.id ? 'selected' : ''}>
        ${escapeHtml(c.courses?.name || '—')} - ${escapeHtml(c.profiles?.name || '—')}
        (${DAYS_PT[c.day_of_week] || c.day_of_week} ${c.schedule?.substring(0,5)})
      </option>`
    ).join('');

    const teacherOptions = (teachers || []).map(t =>
      `<option value="${t.name}" ${enrollment?.responsible_teacher === t.name ? 'selected' : ''}>
        ${escapeHtml(t.name)}
      </option>`
    ).join('');

    const WORKLOAD_OPTIONS = ['6 meses', '12 meses', '14 meses', '15 meses', '18 meses', '2 anos'];
    const existingWorkload = enrollment?.workload_label || '';
    const isCustomWorkload = !!(existingWorkload && !WORKLOAD_OPTIONS.includes(existingWorkload));
    const workloadSelectOptions = [
      '<option value="">— Selecione —</option>',
      ...WORKLOAD_OPTIONS.map(o =>
        `<option value="${o}" ${existingWorkload === o ? 'selected' : ''}>${o}</option>`
      ),
      `<option value="Personalizado" ${isCustomWorkload ? 'selected' : ''}>Personalizado</option>`,
    ].join('');

    openModal(isEdit ? 'Editar Dados do Aluno' : 'Nova Matricula', `
      <form id="student-form" onsubmit="StudentsModule.saveStudent(event, '${id || ''}')">
        <div class="form-sections">

          <div class="form-section">
            <h3 class="form-section-title">Bloco 1 — Dados Pessoais do Aluno</h3>
            <div class="form-grid">
              <div class="form-group span-2">
                <label>Aluno(a) *</label>
                <input type="text" name="name" class="input" required
                  value="${escapeHtml(student?.name || '')}" placeholder="Nome completo">
              </div>
              <div class="form-group">
                <label>E-mail</label>
                <input type="email" name="email" class="input"
                  value="${escapeHtml(student?.email || '')}" placeholder="email@exemplo.com">
              </div>
              <div class="form-group">
                <label>Data de Nascimento</label>
                <input type="date" name="birth_date" class="input" id="birth-date-input"
                  value="${toInputDate(student?.birth_date || '')}"
                  onchange="StudentsModule.updateAge(this.value)">
              </div>
              <div class="form-group">
                <label>Idade</label>
                <input type="text" name="age" class="input" id="age-display" readonly
                  value="${student?.birth_date ? calcAge(student.birth_date) + ' anos' : ''}">
              </div>
              <div class="form-group">
                <label>RG</label>
                <input type="text" name="rg" class="input"
                  value="${escapeHtml(student?.rg || '')}">
              </div>
              <div class="form-group">
                <label>CPF</label>
                <input type="text" name="cpf" class="input" maxlength="14"
                  value="${escapeHtml(student?.cpf || '')}"
                  oninput="this.value=maskCPF(this.value)">
              </div>
              <div class="form-group span-2">
                <label>Filiacao</label>
                <input type="text" name="filiation" class="input"
                  value="${escapeHtml(student?.filiation || '')}" placeholder="Nome do pai e/ou mae">
              </div>
              <div class="form-group span-2">
                <label>Nome do Contratante</label>
                <input type="text" name="contractor_name" class="input"
                  value="${escapeHtml(student?.contractor_name || '')}">
              </div>
              <div class="form-group span-2">
                <label>Endereco</label>
                <input type="text" name="address" class="input"
                  value="${escapeHtml(student?.address || '')}" placeholder="Logradouro">
              </div>
              <div class="form-group">
                <label>Numero</label>
                <input type="text" name="address_number" class="input"
                  value="${escapeHtml(student?.address_number || '')}">
              </div>
              <div class="form-group">
                <label>Bairro</label>
                <input type="text" name="neighborhood" class="input"
                  value="${escapeHtml(student?.neighborhood || '')}">
              </div>
              <div class="form-group">
                <label>CEP</label>
                <input type="text" name="zip_code" class="input" maxlength="9"
                  value="${escapeHtml(student?.zip_code || '')}"
                  oninput="this.value=maskCEP(this.value)">
              </div>
              <div class="form-group">
                <label>Cidade</label>
                <input type="text" name="city" class="input"
                  value="${escapeHtml(student?.city || '')}">
              </div>
              <div class="form-group">
                <label>Estado</label>
                <select name="state" class="input">
                  ${['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(s =>
                    `<option value="${s}" ${student?.state === s ? 'selected' : ''}>${s}</option>`
                  ).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>Telefone do Aluno</label>
                <input type="text" name="student_phone" class="input" maxlength="15"
                  value="${escapeHtml(student?.student_phone || '')}"
                  oninput="this.value=maskPhone(this.value)">
              </div>
              <div class="form-group">
                <label>Local de Trabalho</label>
                <input type="text" name="workplace" class="input"
                  value="${escapeHtml(student?.workplace || '')}">
              </div>
              <div class="form-group">
                <label>Cargo</label>
                <input type="text" name="position" class="input"
                  value="${escapeHtml(student?.position || '')}">
              </div>
              <div class="form-group">
                <label>Telefone para Recado</label>
                <input type="text" name="message_phone" class="input" maxlength="15"
                  value="${escapeHtml(student?.message_phone || '')}"
                  oninput="this.value=maskPhone(this.value)">
              </div>
            </div>
          </div>

          ${!isEdit ? `
          <div class="form-section">
            <h3 class="form-section-title">Bloco 2 — Dados do Contrato e Pagamento</h3>
            <div class="form-grid">
              <div class="form-group span-2">
                <label>Peca / Curso *</label>
                <input type="text" name="piece_course" class="input" required
                  value="${escapeHtml(enrollment?.piece_course || '')}"
                  placeholder="Nome do curso ou producao">
              </div>
              <div class="form-group">
                <label>Turma</label>
                <select name="class_id" class="input">
                  <option value="">— Selecione —</option>
                  ${classOptions}
                </select>
              </div>
              <div class="form-group">
                <label>Inicio do Periodo</label>
                <input type="month" name="period_start" class="input"
                  value="${enrollment?.period_start || ''}">
              </div>
              <div class="form-group">
                <label>Fim do Periodo</label>
                <input type="month" name="period_end" class="input"
                  value="${enrollment?.period_end || ''}">
              </div>
              <div class="form-group">
                <label>Carga Horaria</label>
                <select name="workload_select" class="input"
                  onchange="StudentsModule.onWorkloadChange(this)">
                  ${workloadSelectOptions}
                </select>
              </div>
              <div class="form-group" id="workload-custom-group"
                style="${isCustomWorkload ? 'display:block' : 'display:none'}">
                <label>Carga Horaria Personalizada</label>
                <input type="text" name="workload_custom" class="input"
                  placeholder="Ex: 20 meses, 3 anos..."
                  value="${isCustomWorkload ? escapeHtml(existingWorkload) : ''}">
              </div>
              <div class="form-group">
                <label>Professor Responsavel</label>
                <select name="responsible_teacher" class="input">
                  <option value="">— Selecione —</option>
                  ${teacherOptions}
                </select>
              </div>
              <div class="form-group">
                <label>Dia da Semana</label>
                <select name="day_of_week" class="input">
                  <option value="">—</option>
                  ${Object.entries(DAYS_PT).map(([v, l]) =>
                    `<option value="${v}">${l}</option>`
                  ).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>Horario da Aula</label>
                <input type="time" name="schedule" class="input">
              </div>
              <div class="form-group">
                <label>Valor Total do Contrato (R$) *</label>
                <input type="number" name="total_value" class="input" min="0" step="0.01" required
                  value="${enrollment?.total_value || ''}"
                  oninput="StudentsModule.calcInstallment()">
              </div>
              <div class="form-group">
                <label>Tipo de Desconto (valido ate dia 12) *</label>
                <select name="discount" class="input" onchange="StudentsModule.calcInstallment()">
                  <option value="0"   ${!enrollment?.discount || Number(enrollment?.discount)===0   ? 'selected':''}>Sem desconto — R$ 250,00</option>
                  <option value="70"  ${Number(enrollment?.discount)===70  ? 'selected':''}>Dia de semana (noite) — R$ 180,00 com desconto</option>
                  <option value="50"  ${Number(enrollment?.discount)===50  ? 'selected':''}>Sabado — R$ 200,00 com desconto</option>
                  <option value="100" ${Number(enrollment?.discount)===100 ? 'selected':''}>Dia de semana (tarde) — R$ 150,00 com desconto</option>
                  <option value="90"  ${Number(enrollment?.discount)===90  ? 'selected':''}>Segundo curso / Producao — R$ 160,00 com desconto</option>
                </select>
              </div>
              <div class="form-group">
                <label>Num. de Parcelas *</label>
                <input type="number" name="payment_installments" class="input" min="1" max="24" required
                  value="${enrollment?.payment_installments || 1}"
                  oninput="StudentsModule.calcInstallment()">
              </div>
              <div class="form-group span-3" id="installment-preview" style="display:none">
                <div class="installment-display">
                  <span id="installment-num-text"></span>
                  <span class="installment-words" id="installment-word-text"></span>
                </div>
              </div>
              <div class="form-group span-3">
                <label>Plano de Pagamento / Observacoes</label>
                <textarea name="payment_plan" class="input textarea" rows="3"
                  placeholder="Descreva o plano de pagamento acordado">${escapeHtml(enrollment?.payment_plan || '')}</textarea>
              </div>
            </div>
          </div>` : ''}
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">
            ${isEdit ? 'Salvar Dados' : 'Realizar Matricula'}
          </button>
        </div>
      </form>
    `, true);
  }

  function updateAge(val) {
    const el = document.getElementById('age-display');
    if (!el) return;
    const age = calcAge(val);
    el.value = age !== null ? age + ' anos' : '';
  }

  function calcInstallment() {
    // R$250 é sempre o teto (valor integral). O desconto reduz o que o aluno paga
    // se quitar até o dia 12. Após o dia 12, paga sempre R$250.
    const FULL_PRICE   = 250;
    const discount     = parseFloat(document.querySelector('[name="discount"]')?.value || 0);
    const installments = parseInt(document.querySelector('[name="payment_installments"]')?.value || 1);

    // Auto-preenche total_value = 250 × parcelas (padrão TPC — sempre)
    const totalInput = document.querySelector('[name="total_value"]');
    if (totalInput && installments > 0) {
      totalInput.value = (FULL_PRICE * installments).toFixed(2);
    }

    const discountedInstallment = Math.max(0, FULL_PRICE - discount);
    const previewEl = document.getElementById('installment-preview');
    if (!previewEl) return;

    if (installments > 0) {
      previewEl.style.display = 'block';
      const numEl  = document.getElementById('installment-num-text');
      const wordEl = document.getElementById('installment-word-text');

      if (discount > 0) {
        numEl.textContent  = `${installments}x de ${formatCurrency(discountedInstallment)} (ate dia 12)  |  Sem desconto: ${formatCurrency(FULL_PRICE)}/parcela`;
        wordEl.textContent = numberToWordsPT(discountedInstallment) + ' — com desconto ate dia 12';
      } else {
        numEl.textContent  = `${installments}x de ${formatCurrency(FULL_PRICE)}`;
        wordEl.textContent = numberToWordsPT(FULL_PRICE);
      }
    } else {
      previewEl.style.display = 'none';
    }
  }

  // ─── Salvar aluno ─────────────────────────────────────────
  async function saveStudent(event, id) {
    event.preventDefault();
    const form = event.target;
    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());
    const isEdit = !!id;

    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    try {
      // Validação de idade
      if (data.birth_date) {
        const age = calcAge(data.birth_date);
        if (age !== null && age < 14) {
          toast('Idade mínima para matrícula é 14 anos.', 'warning');
          btn.disabled = false;
          btn.textContent = isEdit ? 'Salvar Alterações' : 'Realizar Matrícula';
          return;
        }
      }

      const studentData = {
        name: data.name, email: data.email || null, birth_date: data.birth_date || null,
        rg: data.rg || null, cpf: data.cpf || null, filiation: data.filiation || null,
        contractor_name: data.contractor_name || null, address: data.address || null,
        address_number: data.address_number || null, neighborhood: data.neighborhood || null,
        zip_code: data.zip_code || null, city: data.city || null, state: data.state || null,
        student_phone: data.student_phone || null, workplace: data.workplace || null,
        position: data.position || null, message_phone: data.message_phone || null,
      };

      let studentId = id;

      if (isEdit) {
        const { error } = await db.from('students').update(studentData).eq('id', id);
        if (error) throw error;
        AuditLog.log('student_updated', 'student', id, studentData.name,
          `Cadastro do aluno ${studentData.name} atualizado`);
        toast('Dados do aluno atualizados com sucesso.', 'success');
        closeModal();
        await loadStudents();
        return;
      } else {
        // Gerar RA no cliente
        const { count, error: countErr } = await db.from('students').select('*', { count: 'exact', head: true });
        if (countErr) {
          // RLS bloqueando SELECT — usuário provavelmente não rodou fix_v2.sql
          throw new Error(`Sem permissão de leitura na tabela students. Execute o arquivo sql/fix_v2.sql no Supabase. (${countErr.message})`);
        }
        const year = new Date().getFullYear();
        studentData.ra = `${year}${String((count || 0) + 1).padStart(4, '0')}`;

        const { data: newStudents, error: insertErr } = await db.from('students').insert([studentData]).select();
        if (insertErr) {
          if (insertErr.message?.includes('row-level security') || insertErr.code === '42501' || insertErr.code === 'PGRST301') {
            throw new Error('Permissao negada pelo banco. Abra o Supabase → SQL Editor, execute o arquivo sql/fix_v3.sql e recarregue a pagina.');
          }
          throw insertErr;
        }
        studentId = newStudents[0].id;
        AuditLog.log('student_created', 'student', studentId, studentData.name,
          `Novo aluno cadastrado: ${studentData.name} (RA: ${studentData.ra})`);
      }

      // Salvar matrícula
      // discount = desconto POR PARCELA (válido até dia 12 de cada mês)
      const total        = parseFloat(data.total_value || 0);
      const discount     = parseFloat(data.discount || 0);
      const installments = parseInt(data.payment_installments || 1);
      const fullInstallment       = total / installments;
      const discountedInstallment = Math.max(0, fullInstallment - discount);

      const workloadLabel = data.workload_select === 'Personalizado'
        ? (data.workload_custom || null)
        : (data.workload_select || null);

      const enrollmentData = {
        student_id: studentId,
        class_id: data.class_id || null,
        piece_course: data.piece_course,
        period_start: data.period_start || null,
        period_end: data.period_end || null,
        workload_label: workloadLabel,
        total_value: total,
        discount: discount,
        responsible_teacher: data.responsible_teacher || null,
        payment_installments: installments,
        payment_plan: data.payment_plan || null,
        status: 'active',
      };

      // Nova matricula: criar enrollment + parcelas
      const { data: newEnrollment, error: eErr } = await db.from('enrollments')
        .insert([enrollmentData]).select();
      if (eErr) throw eErr;

      // Gerar parcelas com vencimento no dia 12
      // amount = valor COM desconto (pago até dia 12)
      // discount_amount = valor do desconto por parcela (perdido após dia 12)
      const now = new Date();
      const paymentsToInsert = [];
      for (let i = 0; i < installments; i++) {
        const dueDate = new Date(now.getFullYear(), now.getMonth() + i, 12);
        paymentsToInsert.push({
          enrollment_id:      newEnrollment[0].id,
          student_id:         studentId,
          amount:             discountedInstallment,
          discount_amount:    discount,
          due_date:           dueDate.toISOString().split('T')[0],
          status:             'pending',
          installment_number: i + 1,
        });
      }
      if (paymentsToInsert.length) {
        await db.from('payments').insert(paymentsToInsert);
      }

      AuditLog.log('enrollment_created', 'enrollment', newEnrollment[0].id, studentData.name,
        `Matricula criada: ${studentData.name} em ${enrollmentData.piece_course || 'turma'} — ${installments}x de ${formatCurrency(discountedInstallment)}`);

      // Recarrega lista e oferece download do contrato
      await loadStudents();
      let courseType = 'regular';
      if (data.class_id) {
        const { data: classInfo } = await db.from('classes')
          .select('courses(type)').eq('id', data.class_id).single();
        courseType = classInfo?.courses?.type || 'regular';
      }
      showContractPrompt(
        { ...studentData, id: studentId },
        { ...enrollmentData, id: newEnrollment[0].id },
        courseType
      );
    } catch (err) {
      console.error(err);
      toast('Erro ao salvar: ' + (err.message || 'Tente novamente.'), 'error');
      btn.disabled = false;
      btn.textContent = isEdit ? 'Salvar Alterações' : 'Realizar Matrícula';
    }
  }

  // ─── Excluir aluno ────────────────────────────────────────
  async function deleteStudent(id) {
    const student = allStudents.find(s => s.id === id);
    const confirmed = await confirmDialog(
      `Excluir o aluno "${student?.name}"? Esta acao nao pode ser desfeita.`
    );
    if (!confirmed) return;

    const { error } = await db.from('students').delete().eq('id', id);
    if (error) return toast('Erro ao excluir aluno.', 'error');

    AuditLog.log('student_deleted', 'student', id, student?.name,
      `Aluno excluido: ${student?.name} (RA: ${student?.ra || '—'})`);

    toast('Aluno excluído.', 'success');
    await loadStudents();
  }

  // ─── Helper: formatar periodo para exibição ───────────────
  function fmtPeriodDisplay(start, end) {
    const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    function fmt(val) {
      if (!val) return '';
      const [year, month] = val.split('-');
      return `${months[parseInt(month, 10) - 1]}/${year}`;
    }
    if (!start && !end) return '—';
    if (start && end) return `${fmt(start)} a ${fmt(end)}`;
    return fmt(start) || fmt(end);
  }

  // ─── Carga horária: mostrar/ocultar campo personalizado ───
  function onWorkloadChange(select) {
    const customGroup = document.getElementById('workload-custom-group');
    if (customGroup) customGroup.style.display = select.value === 'Personalizado' ? 'block' : 'none';
  }

  // ─── Prompt de contrato após matrícula ───────────────────
  function showContractPrompt(student, enrollment, courseType) {
    pendingContractData = { student, enrollment, courseType };
    openModal('Matricula Realizada', `
      <div style="text-align:center; padding:1.5rem 0 1rem;">
        <p style="font-size:1.05rem; margin-bottom:0.5rem;">
          Matricula de <strong>${escapeHtml(student.name)}</strong> realizada com sucesso.
        </p>
        <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:0;">
          Deseja gerar o contrato agora?
        </p>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeModal()">Agora nao</button>
        <button class="btn btn-primary" onclick="StudentsModule.downloadPendingContract()">
          Baixar Contrato
        </button>
      </div>
    `);
  }

  function downloadPendingContract() {
    if (!pendingContractData) return;
    const { student, enrollment, courseType } = pendingContractData;
    try {
      const doc = PDFGen.contract(student, enrollment, courseType);
      PDFGen.downloadPDF(doc, `contrato-${student.ra || student.id}.pdf`);
    } catch (e) {
      toast('Erro ao gerar contrato: ' + (e.message || 'Tente novamente.'), 'error');
    }
    pendingContractData = null;
    closeModal();
  }

  // ─── Nova matrícula para aluno existente ─────────────────
  async function openEnrollmentForm(studentId) {
    const student = allStudents.find(s => s.id === studentId);
    if (!student) return;

    const { data: classes } = await db.from('classes')
      .select('id, day_of_week, schedule, courses(name, level, type), profiles(name)')
      .eq('status', 'active');

    const { data: teachers } = await db.from('profiles').select('id, name').eq('role', 'teacher');

    const classOptions = (classes || []).map(c =>
      `<option value="${c.id}">
        ${escapeHtml(c.courses?.name || '—')} - ${escapeHtml(c.profiles?.name || '—')}
        (${DAYS_PT[c.day_of_week] || c.day_of_week} ${c.schedule?.substring(0, 5)})
      </option>`
    ).join('');

    const teacherOptions = (teachers || []).map(t =>
      `<option value="${t.name}">${escapeHtml(t.name)}</option>`
    ).join('');

    const WORKLOAD_OPTIONS = ['6 meses', '12 meses', '14 meses', '15 meses', '18 meses', '2 anos'];
    const workloadSelectOptions = [
      '<option value="">— Selecione —</option>',
      ...WORKLOAD_OPTIONS.map(o => `<option value="${o}">${o}</option>`),
      '<option value="Personalizado">Personalizado</option>',
    ].join('');

    openModal(`Nova Matricula — ${escapeHtml(student.name)}`, `
      <form id="enrollment-form" onsubmit="StudentsModule.saveEnrollment(event, '${studentId}')">
        <div class="form-sections">
          <div class="form-section">
            <h3 class="form-section-title">Dados do Contrato e Pagamento</h3>
            <div class="form-grid">
              <div class="form-group span-2">
                <label>Peca / Curso *</label>
                <input type="text" name="piece_course" class="input" required
                  placeholder="Nome do curso ou producao">
              </div>
              <div class="form-group">
                <label>Turma</label>
                <select name="class_id" class="input">
                  <option value="">— Selecione —</option>
                  ${classOptions}
                </select>
              </div>
              <div class="form-group">
                <label>Inicio do Periodo</label>
                <input type="month" name="period_start" class="input">
              </div>
              <div class="form-group">
                <label>Fim do Periodo</label>
                <input type="month" name="period_end" class="input">
              </div>
              <div class="form-group">
                <label>Carga Horaria</label>
                <select name="workload_select" class="input"
                  onchange="StudentsModule.onWorkloadChange(this)">
                  ${workloadSelectOptions}
                </select>
              </div>
              <div class="form-group" id="workload-custom-group" style="display:none">
                <label>Carga Horaria Personalizada</label>
                <input type="text" name="workload_custom" class="input"
                  placeholder="Ex: 20 meses, 3 anos...">
              </div>
              <div class="form-group">
                <label>Professor Responsavel</label>
                <select name="responsible_teacher" class="input">
                  <option value="">— Selecione —</option>
                  ${teacherOptions}
                </select>
              </div>
              <div class="form-group">
                <label>Dia da Semana</label>
                <select name="day_of_week" class="input">
                  <option value="">—</option>
                  ${Object.entries(DAYS_PT).map(([v, l]) =>
                    `<option value="${v}">${l}</option>`
                  ).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>Horario da Aula</label>
                <input type="time" name="schedule" class="input">
              </div>
              <div class="form-group">
                <label>Valor Total do Contrato (R$) *</label>
                <input type="number" name="total_value" class="input" min="0" step="0.01" required
                  oninput="StudentsModule.calcInstallment()">
              </div>
              <div class="form-group">
                <label>Tipo de Desconto (valido ate dia 12) *</label>
                <select name="discount" class="input" onchange="StudentsModule.calcInstallment()">
                  <option value="0">Sem desconto — R$ 250,00</option>
                  <option value="70">Dia de semana (noite) — R$ 180,00 com desconto</option>
                  <option value="50">Sabado — R$ 200,00 com desconto</option>
                  <option value="100">Dia de semana (tarde) — R$ 150,00 com desconto</option>
                  <option value="90">Segundo curso / Producao — R$ 160,00 com desconto</option>
                </select>
              </div>
              <div class="form-group">
                <label>Num. de Parcelas *</label>
                <input type="number" name="payment_installments" class="input" min="1" max="24"
                  required value="1" oninput="StudentsModule.calcInstallment()">
              </div>
              <div class="form-group span-3" id="installment-preview" style="display:none">
                <div class="installment-display">
                  <span id="installment-num-text"></span>
                  <span class="installment-words" id="installment-word-text"></span>
                </div>
              </div>
              <div class="form-group span-3">
                <label>Plano de Pagamento / Observacoes</label>
                <textarea name="payment_plan" class="input textarea" rows="3"
                  placeholder="Descreva o plano de pagamento acordado"></textarea>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">Realizar Matricula</button>
        </div>
      </form>
    `, true);
  }

  async function saveEnrollment(event, studentId) {
    event.preventDefault();
    const form = event.target;
    const fd   = new FormData(form);
    const data = Object.fromEntries(fd.entries());

    const btn = form.querySelector('[type="submit"]');
    btn.disabled    = true;
    btn.textContent = 'Salvando...';

    try {
      const total        = parseFloat(data.total_value || 0);
      const discount     = parseFloat(data.discount || 0);
      const installments = parseInt(data.payment_installments || 1);
      const fullInstallment       = total / installments;
      const discountedInstallment = Math.max(0, fullInstallment - discount);

      const workloadLabel = data.workload_select === 'Personalizado'
        ? (data.workload_custom || null)
        : (data.workload_select || null);

      const enrollmentData = {
        student_id:           studentId,
        class_id:             data.class_id || null,
        piece_course:         data.piece_course,
        period_start:         data.period_start || null,
        period_end:           data.period_end   || null,
        workload_label:       workloadLabel,
        total_value:          total,
        discount:             discount,
        responsible_teacher:  data.responsible_teacher || null,
        payment_installments: installments,
        payment_plan:         data.payment_plan || null,
        status:               'active',
      };

      const { data: newEnrollment, error: eErr } = await db.from('enrollments')
        .insert([enrollmentData]).select();
      if (eErr) throw eErr;

      const now = new Date();
      const paymentsToInsert = [];
      for (let i = 0; i < installments; i++) {
        const dueDate = new Date(now.getFullYear(), now.getMonth() + i, 12);
        paymentsToInsert.push({
          enrollment_id:      newEnrollment[0].id,
          student_id:         studentId,
          amount:             discountedInstallment,
          discount_amount:    discount,
          due_date:           dueDate.toISOString().split('T')[0],
          status:             'pending',
          installment_number: i + 1,
        });
      }
      if (paymentsToInsert.length) {
        await db.from('payments').insert(paymentsToInsert);
      }

      const student = allStudents.find(s => s.id === studentId);
      AuditLog.log('enrollment_created', 'enrollment', newEnrollment[0].id, student?.name,
        `Matricula adicional: ${student?.name} em ${enrollmentData.piece_course || 'turma'} — ${installments}x de ${formatCurrency(discountedInstallment)}`);

      await loadStudents();

      let courseType = 'regular';
      if (data.class_id) {
        const { data: classInfo } = await db.from('classes')
          .select('courses(type)').eq('id', data.class_id).single();
        courseType = classInfo?.courses?.type || 'regular';
      }

      const updatedStudent = allStudents.find(s => s.id === studentId) || student;
      showContractPrompt(
        { ...updatedStudent, id: studentId },
        { ...enrollmentData, id: newEnrollment[0].id },
        courseType
      );
    } catch (err) {
      console.error(err);
      toast('Erro ao salvar: ' + (err.message || 'Tente novamente.'), 'error');
      btn.disabled    = false;
      btn.textContent = 'Realizar Matricula';
    }
  }

  // ─── Editar matrícula existente ─────────────────────────
  async function openEnrollmentEditForm(enrollmentId, studentId) {
    const { data: enrollment } = await db.from('enrollments')
      .select('*, classes(id, courses(id, name, level, type), profiles(id, name))')
      .eq('id', enrollmentId).single();

    if (!enrollment) return toast('Matricula nao encontrada.', 'error');

    const { data: classes }  = await db.from('classes')
      .select('id, day_of_week, schedule, courses(name, level, type), profiles(name)')
      .eq('status', 'active');
    const { data: teachers } = await db.from('profiles').select('id, name').eq('role', 'teacher');

    const classOptions = (classes || []).map(c =>
      `<option value="${c.id}" ${enrollment.class_id === c.id ? 'selected' : ''}>
        ${escapeHtml(c.courses?.name || '—')} - ${escapeHtml(c.profiles?.name || '—')}
        (${DAYS_PT[c.day_of_week] || c.day_of_week} ${c.schedule?.substring(0, 5)})
      </option>`
    ).join('');

    const teacherOptions = (teachers || []).map(t =>
      `<option value="${t.name}" ${enrollment.responsible_teacher === t.name ? 'selected' : ''}>
        ${escapeHtml(t.name)}
      </option>`
    ).join('');

    const WORKLOAD_OPTIONS = ['6 meses', '12 meses', '14 meses', '15 meses', '18 meses', '2 anos'];
    const existingWorkload  = enrollment.workload_label || '';
    const isCustomWorkload  = !!(existingWorkload && !WORKLOAD_OPTIONS.includes(existingWorkload));
    const workloadSelectOptions = [
      '<option value="">— Selecione —</option>',
      ...WORKLOAD_OPTIONS.map(o =>
        `<option value="${o}" ${existingWorkload === o ? 'selected' : ''}>${o}</option>`
      ),
      `<option value="Personalizado" ${isCustomWorkload ? 'selected' : ''}>Personalizado</option>`,
    ].join('');

    const disc = Number(enrollment.discount || 0);

    openModal('Editar Matricula', `
      <form id="enrollment-edit-form" onsubmit="StudentsModule.saveEnrollmentEdit(event,'${enrollmentId}','${studentId}')">
        <div class="form-grid">
          <div class="form-group span-2">
            <label>Peca / Curso *</label>
            <input type="text" name="piece_course" class="input" required
              value="${escapeHtml(enrollment.piece_course || '')}">
          </div>
          <div class="form-group span-2">
            <label>Turma</label>
            <select name="class_id" class="input">
              <option value="">— Selecione —</option>
              ${classOptions}
            </select>
          </div>
          <div class="form-group">
            <label>Inicio do Periodo</label>
            <input type="month" name="period_start" class="input"
              value="${enrollment.period_start || ''}">
          </div>
          <div class="form-group">
            <label>Fim do Periodo</label>
            <input type="month" name="period_end" class="input"
              value="${enrollment.period_end || ''}">
          </div>
          <div class="form-group">
            <label>Carga Horaria</label>
            <select name="workload_select" class="input"
              onchange="StudentsModule.onWorkloadChange(this)">
              ${workloadSelectOptions}
            </select>
          </div>
          <div class="form-group" id="workload-custom-group"
            style="${isCustomWorkload ? 'display:block' : 'display:none'}">
            <label>Carga Personalizada</label>
            <input type="text" name="workload_custom" class="input"
              value="${isCustomWorkload ? escapeHtml(existingWorkload) : ''}">
          </div>
          <div class="form-group">
            <label>Professor Responsavel</label>
            <select name="responsible_teacher" class="input">
              <option value="">— Selecione —</option>
              ${teacherOptions}
            </select>
          </div>
          <div class="form-group">
            <label>Tipo de Desconto</label>
            <select name="discount" class="input">
              <option value="0"   ${disc===0   ? 'selected':''}>Sem desconto — R$ 250,00/parcela</option>
              <option value="70"  ${disc===70  ? 'selected':''}>Dia de semana (noite) — R$ 180,00 com desconto</option>
              <option value="50"  ${disc===50  ? 'selected':''}>Sabado — R$ 200,00 com desconto</option>
              <option value="100" ${disc===100 ? 'selected':''}>Dia de semana (tarde) — R$ 150,00 com desconto</option>
              <option value="90"  ${disc===90  ? 'selected':''}>Segundo curso / Producao — R$ 160,00 com desconto</option>
            </select>
            <small style="color:var(--text-muted);font-size:0.78rem;margin-top:4px;display:block">
              Alterar o desconto atualizara as parcelas <strong>pendentes</strong> automaticamente.
            </small>
          </div>
          <div class="form-group span-2">
            <label>Plano de Pagamento / Observacoes</label>
            <textarea name="payment_plan" class="input textarea" rows="3"
              >${escapeHtml(enrollment.payment_plan || '')}</textarea>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">Salvar Matricula</button>
        </div>
      </form>
    `, true);
  }

  async function saveEnrollmentEdit(event, enrollmentId, studentId) {
    event.preventDefault();
    const fd   = new FormData(event.target);
    const data = Object.fromEntries(fd.entries());
    const btn  = event.target.querySelector('[type="submit"]');
    btn.disabled    = true;
    btn.textContent = 'Salvando...';

    try {
      const FULL_PRICE = 250;
      const discount   = parseFloat(data.discount || 0);
      const workloadLabel = data.workload_select === 'Personalizado'
        ? (data.workload_custom || null)
        : (data.workload_select || null);

      const { error } = await db.from('enrollments').update({
        piece_course:        data.piece_course,
        class_id:            data.class_id || null,
        period_start:        data.period_start || null,
        period_end:          data.period_end   || null,
        workload_label:      workloadLabel,
        responsible_teacher: data.responsible_teacher || null,
        discount:            discount,
        payment_plan:        data.payment_plan || null,
      }).eq('id', enrollmentId);
      if (error) throw error;

      // Atualiza parcelas pendentes com o novo tipo de desconto
      await db.from('payments').update({
        amount:          FULL_PRICE - discount,
        discount_amount: discount,
      }).eq('enrollment_id', enrollmentId).eq('status', 'pending');

      AuditLog.log('enrollment_updated', 'enrollment', enrollmentId, null,
        `Matricula editada — desconto R$${discount}, parcela R$${FULL_PRICE - discount}`);

      toast('Matricula atualizada com sucesso.', 'success');
      closeModal();
      await loadStudents();
      openDetail(studentId);
    } catch (err) {
      console.error(err);
      toast('Erro ao salvar: ' + (err.message || 'Tente novamente.'), 'error');
      btn.disabled    = false;
      btn.textContent = 'Salvar Matricula';
    }
  }

  async function cancelEnrollment(enrollmentId, studentId) {
    const confirmed = await confirmDialog(
      'Cancelar esta matricula? Esta acao nao pode ser desfeita.'
    );
    if (!confirmed) return;

    const { error } = await db.from('enrollments')
      .update({ status: 'cancelled' }).eq('id', enrollmentId);
    if (error) return toast('Erro ao cancelar matricula.', 'error');

    AuditLog.log('enrollment_cancelled', 'enrollment', enrollmentId, null,
      'Matricula cancelada manualmente');
    toast('Matricula cancelada.', 'success');
    await loadStudents();
    openDetail(studentId);
  }

  async function exportEnrollmentContract(studentId, enrollmentId) {
    try {
      const { data: student } = await db.from('students').select('*').eq('id', studentId).single();
      const { data: enrollment } = await db.from('enrollments')
        .select('*, classes(courses(name, level, type), profiles(name))')
        .eq('id', enrollmentId).single();
      if (!student || !enrollment) return toast('Dados nao encontrados.', 'error');
      const courseType = enrollment.classes?.courses?.type || 'regular';
      const doc = PDFGen.contract(student, enrollment, courseType);
      PDFGen.downloadPDF(doc, `contrato-${student.ra || studentId}-${enrollmentId.substring(0, 8)}.pdf`);
    } catch (e) {
      toast('Erro ao gerar contrato: ' + (e.message || 'Tente novamente.'), 'error');
    }
  }

  // ─── Gerar contrato a partir da ficha do aluno ────────────
  async function exportStudentContract(id) {
    const student = allStudents.find(s => s.id === id);
    if (!student) return toast('Aluno nao encontrado.', 'error');

    try {
      const { data: enrollments } = await db.from('enrollments')
        .select('*, classes(courses(name, level, type), profiles(name))')
        .eq('student_id', id)
        .eq('status', 'active');

      const enrollment = enrollments?.[0];
      const courseType = enrollment?.classes?.courses?.type || 'regular';

      const doc = PDFGen.contract(student, enrollment || {}, courseType);
      PDFGen.downloadPDF(doc, `contrato-${student.ra || id}.pdf`);
    } catch (e) {
      toast('Erro ao gerar contrato: ' + (e.message || 'Tente novamente.'), 'error');
    }
  }

  return {
    render, openForm, openDetail, saveStudent, deleteStudent,
    toggleAll, toggleRow,
    exportCards, exportCertificates,
    exportStudentCard, exportStudentCert, exportStudentContract,
    openPaymentBookConfig, generatePaymentBook,
    updateAge, calcInstallment,
    onWorkloadChange, downloadPendingContract,
    openEnrollmentForm, saveEnrollment, cancelEnrollment, exportEnrollmentContract,
    openEnrollmentEditForm, saveEnrollmentEdit,
  };
})();
