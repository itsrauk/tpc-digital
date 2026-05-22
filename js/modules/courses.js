const CoursesModule = (() => {

  // Converte "YYYY-MM" (ou "YYYY-MM-DD") para "Maio/2026"
  function fmtMonthLocal(val) {
    if (!val) return '—';
    const months = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho',
                    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const ym = String(val).substring(0, 7); // "YYYY-MM"
    const [year, month] = ym.split('-');
    if (!year || !month) return val;
    return `${months[parseInt(month, 10) - 1]}/${year}`;
  }

  async function render() {
    const el = document.getElementById('view-content');
    el.innerHTML = `<div class="loading-state">Carregando turmas...</div>`;
    await loadClasses();
  }

  async function loadClasses() {
    const isAdmin = Auth.isAdmin();
    const profile = Auth.getProfile();

    try {
      let query = db.from('classes')
        .select(`id, day_of_week, schedule, start_date, end_date, status,
          courses(id, name, level, type, workload),
          profiles(id, name),
          enrollments(id, status, students(id, name, ra))`)
        .order('status').order('created_at', { ascending: false });

      if (!isAdmin) {
        query = query.eq('teacher_id', profile?.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      renderClasses(data || [], isAdmin);
    } catch (err) {
      document.getElementById('view-content').innerHTML =
        `<div class="error-state">Erro ao carregar turmas.</div>`;
    }
  }

  function renderClasses(classes, isAdmin) {
    const el = document.getElementById('view-content');
    const active = classes.filter(c => c.status === 'active');
    const others = classes.filter(c => c.status !== 'active');

    el.innerHTML = `
      <div class="view-header">
        <h1 class="view-title">Turmas e Producoes</h1>
        <div class="view-actions">
          ${isAdmin ? `<button class="btn btn-primary" onclick="CoursesModule.openClassForm()">Nova Turma</button>` : ''}
        </div>
      </div>

      <div class="section-header">
        <h2 class="section-title">Turmas Ativas (${active.length})</h2>
      </div>
      <div class="classes-grid" id="active-classes-grid">
        ${active.length ? active.map(c => renderClassCard(c, isAdmin)).join('') :
          '<p class="empty-state">Nenhuma turma ativa.</p>'}
      </div>

      ${others.length ? `
      <div class="section-header mt-6">
        <h2 class="section-title">Historico</h2>
      </div>
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>Curso</th><th>Professor</th><th>Dia / Horario</th>
            <th>Alunos</th><th>Situacao</th>${isAdmin ? '<th>Acoes</th>' : ''}
          </tr></thead>
          <tbody>
            ${others.map(c => renderClassRow(c, isAdmin)).join('')}
          </tbody>
        </table>
      </div>` : ''}
    `;
  }

  function courseTypeBadge(type) {
    if (type === 'production') return { css: 'production', label: 'Producao' };
    if (type === 'infantil')   return { css: 'infantil',   label: 'Infantil' };
    return { css: 'regular', label: 'Regular' };
  }

  function renderClassCard(c, isAdmin) {
    const activeStudents = (c.enrollments || []).filter(e => e.status === 'active');
    const badge = courseTypeBadge(c.courses?.type);
    const endPreview = c.end_date ? fmtMonthLocal(c.end_date) : 'Em andamento';

    return `
      <div class="class-card" onclick="CoursesModule.openClassDetail('${c.id}')">
        <div class="class-card-header">
          <div class="class-type-badge ${badge.css}">${badge.label}</div>
          ${isAdmin ? `<button class="btn-icon-sm" onclick="event.stopPropagation(); CoursesModule.openClassForm('${c.id}')">
            Editar
          </button>` : ''}
        </div>
        <h3 class="class-card-title">${escapeHtml(c.courses?.name || '—')}</h3>
        <div class="class-card-meta">
          <span class="meta-item">Professor: ${escapeHtml(c.profiles?.name || '—')}</span>
          <span class="meta-item">${DAYS_PT[c.day_of_week] || c.day_of_week} - ${c.schedule?.substring(0,5) || '—'}</span>
          <span class="meta-item">${c.courses?.workload || '—'}h de carga horaria</span>
        </div>
        <div class="class-card-footer">
          <span class="student-count">${activeStudents.length} alunos</span>
          <span class="end-date">Previsao: ${endPreview}</span>
        </div>
      </div>`;
  }

  function renderClassRow(c, isAdmin) {
    const activeStudents = (c.enrollments || []).filter(e => e.status === 'active');
    const badge = courseTypeBadge(c.courses?.type);
    return `<tr>
      <td>
        ${escapeHtml(c.courses?.name || '—')}
        <span class="badge badge-secondary" style="margin-left:6px;font-size:9px">${badge.label}</span>
      </td>
      <td>${escapeHtml(c.profiles?.name || '—')}</td>
      <td>${DAYS_PT[c.day_of_week] || c.day_of_week} ${c.schedule?.substring(0,5) || ''}</td>
      <td>${activeStudents.length}</td>
      <td><span class="badge badge-secondary">${STATUS_LABELS[c.status] || c.status}</span></td>
      ${isAdmin ? `<td class="actions-cell">
        <button class="btn-icon" onclick="CoursesModule.openClassDetail('${c.id}')">Ver</button>
        <button class="btn-icon" onclick="CoursesModule.openClassForm('${c.id}')">Editar</button>
      </td>` : ''}
    </tr>`;
  }

  // ─── Detalhe da turma ─────────────────────────────────────
  async function openClassDetail(id) {
    const { data: cls, error } = await db.from('classes')
      .select(`*, courses(*), profiles(name),
        enrollments(*, students(id, name, ra, student_phone))`)
      .eq('id', id).single();

    if (error || !cls) return toast('Erro ao carregar turma.', 'error');

    const activeEnrollments = (cls.enrollments || []).filter(e => e.status === 'active');

    openModal('Detalhes da Turma', `
      <div class="detail-grid">
        <div class="detail-section">
          <h3 class="detail-section-title">Informacoes da Turma</h3>
          <div class="detail-row"><span>Curso</span><strong>${escapeHtml(cls.courses?.name || '—')}</strong></div>
          <div class="detail-row"><span>Tipo</span><strong>${cls.courses?.type === 'production' ? 'Producao' : 'Regular'}</strong></div>
          ${cls.courses?.level ? `<div class="detail-row"><span>Nivel</span><strong>${LEVEL_LABELS[cls.courses.level]}</strong></div>` : ''}
          <div class="detail-row"><span>Diretor / Professor</span><strong>${escapeHtml(cls.profiles?.name || '—')}</strong></div>
          <div class="detail-row"><span>Dia</span><strong>${DAYS_PT[cls.day_of_week] || cls.day_of_week}</strong></div>
          <div class="detail-row"><span>Horario</span><strong>${cls.schedule?.substring(0,5) || '—'}</strong></div>
          <div class="detail-row"><span>Inicio</span><strong>${fmtMonthLocal(cls.start_date) || '—'}</strong></div>
          <div class="detail-row"><span>Previsao de Termino</span><strong>${cls.end_date ? fmtMonthLocal(cls.end_date) : 'Em andamento'}</strong></div>
          <div class="detail-row"><span>Carga Horaria</span><strong>${cls.courses?.workload || '—'}h</strong></div>
          <div class="detail-row"><span>Situacao</span>
            <span class="badge badge-${cls.status === 'active' ? 'success' : 'secondary'}">
              ${STATUS_LABELS[cls.status] || cls.status}
            </span>
          </div>
        </div>
        <div class="detail-section">
          <h3 class="detail-section-title">Alunos Matriculados (${activeEnrollments.length})</h3>
          ${activeEnrollments.length ? `
          <div class="table-wrapper mini">
            <table class="data-table">
              <thead><tr><th>Nome</th><th>RA</th><th>Telefone</th>${Auth.isAdmin() ? '<th>Frequencia</th>' : ''}</tr></thead>
              <tbody>
                ${activeEnrollments.map(e => `<tr>
                  <td>${escapeHtml(e.students?.name || '—')}</td>
                  <td class="text-accent">${escapeHtml(e.students?.ra || '—')}</td>
                  <td>${escapeHtml(e.students?.student_phone || '—')}</td>
                  ${Auth.isAdmin() ? `<td>
                    <button class="btn-icon" onclick="CoursesModule.openAttendance('${e.id}', '${id}')">
                      Frequencia
                    </button>
                  </td>` : `<td>
                    <button class="btn-icon" onclick="CoursesModule.openAttendance('${e.id}', '${id}')">
                      Frequencia
                    </button>
                  </td>`}
                </tr>`).join('')}
              </tbody>
            </table>
          </div>` : '<p class="empty-state">Nenhum aluno matriculado.</p>'}
        </div>
      </div>
    `, true);
  }

  // ─── Frequência ───────────────────────────────────────────
  async function openAttendance(enrollmentId, classId) {
    const today = new Date().toISOString().split('T')[0];

    const { data: existing } = await db.from('attendance')
      .select('*').eq('enrollment_id', enrollmentId).order('date', { ascending: false }).limit(10);

    openModal('Registro de Frequencia', `
      <div class="attendance-form">
        <div class="form-group">
          <label>Data</label>
          <input type="date" id="att-date" class="input" value="${today}">
        </div>
        <div class="form-group">
          <label>Situacao</label>
          <select id="att-status" class="input">
            <option value="present">Presente</option>
            <option value="absent">Falta</option>
            <option value="justified">Falta Justificada</option>
          </select>
        </div>
        <button class="btn btn-primary mt-2" onclick="CoursesModule.saveAttendance('${enrollmentId}', '${classId}')">
          Registrar
        </button>
      </div>

      <h3 class="detail-section-title mt-4">Historico Recente</h3>
      <div class="table-wrapper mini">
        <table class="data-table">
          <thead><tr><th>Data</th><th>Situacao</th></tr></thead>
          <tbody>
            ${(existing || []).map(a => `<tr>
              <td>${formatDate(a.date)}</td>
              <td><span class="badge badge-${a.status === 'present' ? 'success' : a.status === 'justified' ? 'warning' : 'danger'}">
                ${a.status === 'present' ? 'Presente' : a.status === 'justified' ? 'Justificada' : 'Falta'}
              </span></td>
            </tr>`).join('') || '<tr><td colspan="2" class="empty-state">Sem registros.</td></tr>'}
          </tbody>
        </table>
      </div>
    `);
  }

  async function saveAttendance(enrollmentId, classId) {
    const date   = document.getElementById('att-date')?.value;
    const status = document.getElementById('att-status')?.value;
    if (!date) return toast('Selecione a data.', 'warning');

    const { data: enrollment } = await db.from('enrollments').select('student_id').eq('id', enrollmentId).single();

    const { error } = await db.from('attendance').upsert([{
      enrollment_id: enrollmentId,
      student_id: enrollment?.student_id,
      class_id: classId,
      date, status
    }], { onConflict: 'enrollment_id,date' });

    if (error) {
      console.error('Attendance error:', error);
      const hint = error.message?.includes('unique') || error.message?.includes('constraint')
        ? ' Execute sql/fix_v4.sql no Supabase para corrigir.'
        : (' ' + error.message);
      return toast('Erro ao registrar frequencia.' + hint, 'error');
    }
    toast('Frequencia registrada.', 'success');
    closeModal();
  }

  // ─── Formulário de Turma ──────────────────────────────────
  async function openClassForm(id = null) {
    let cls = null;
    if (id) {
      const { data } = await db.from('classes').select('*, courses(*), profiles(*)').eq('id', id).single();
      cls = data;
    }

    const { data: courses } = await db.from('courses').select('*').order('type').order('level');
    const { data: teachers } = await db.from('profiles').select('*').eq('role', 'teacher');

    // Agrupar cursos por tipo para o select
    const typeLabel = { regular: 'Regular', infantil: 'Infantil', production: 'Producao (Peca)' };
    const grouped = {};
    (courses || []).forEach(c => {
      if (!grouped[c.type]) grouped[c.type] = [];
      grouped[c.type].push(c);
    });
    const courseOptions = Object.entries(grouped).map(([type, list]) =>
      `<optgroup label="${typeLabel[type] || type}">
        ${list.map(c =>
          `<option value="${c.id}" ${cls?.course_id === c.id ? 'selected' : ''}>
            ${escapeHtml(c.name)}
          </option>`
        ).join('')}
      </optgroup>`
    ).join('') + `<optgroup label="Producao (Peca de Teatro)">
        <option value="__new_production__">+ Nova Peca / Producao</option>
      </optgroup>`;

    openModal(id ? 'Editar Turma' : 'Nova Turma', `
      <form id="class-form" onsubmit="CoursesModule.saveClass(event, '${id || ''}')">
        <div class="form-grid">
          <div class="form-group span-2">
            <label>Curso / Nivel *</label>
            <select name="course_id" class="input" required
              onchange="CoursesModule.onCourseChange(this)">
              <option value="">— Selecione —</option>
              ${courseOptions}
            </select>
          </div>
          <div class="form-group span-2" id="new-production-row" style="display:none">
            <label>Nome da Peca / Producao *</label>
            <input type="text" id="new-production-name" class="input"
              placeholder="Ex: A Peca que deu Errado">
          </div>
          <div class="form-group span-2">
            <label>Professor Responsavel *</label>
            <select name="teacher_id" class="input" required>
              <option value="">— Selecione —</option>
              ${(teachers || []).map(t =>
                `<option value="${t.id}" ${cls?.teacher_id === t.id ? 'selected' : ''}>
                  ${escapeHtml(t.name)}
                </option>`
              ).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Dia da Semana *</label>
            <select name="day_of_week" class="input" required>
              ${Object.entries(DAYS_PT).map(([v, l]) =>
                `<option value="${v}" ${cls?.day_of_week === v ? 'selected' : ''}>${l}</option>`
              ).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Horario *</label>
            <input type="time" name="schedule" class="input" required
              value="${cls?.schedule?.substring(0,5) || ''}">
          </div>
          <div class="form-group">
            <label>Mes de Inicio</label>
            <input type="month" name="start_date" class="input"
              value="${cls?.start_date?.substring(0, 7) || ''}">
          </div>
          <div class="form-group">
            <label>Previsao de Termino</label>
            <input type="month" name="end_date" class="input"
              value="${cls?.end_date?.substring(0, 7) || ''}">
          </div>
          <div class="form-group">
            <label>Situacao</label>
            <select name="status" class="input">
              <option value="active"   ${cls?.status === 'active'   ? 'selected' : ''}>Ativa</option>
              <option value="inactive" ${cls?.status === 'inactive' ? 'selected' : ''}>Inativa</option>
              <option value="finished" ${cls?.status === 'finished' ? 'selected' : ''}>Concluida</option>
            </select>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">${id ? 'Salvar' : 'Criar Turma'}</button>
        </div>
      </form>
    `);
  }

  function onCourseChange(select) {
    const newProdRow = document.getElementById('new-production-row');
    if (newProdRow) {
      newProdRow.style.display = select.value === '__new_production__' ? 'block' : 'none';
    }
  }

  async function saveClass(event, id) {
    event.preventDefault();
    const fd   = new FormData(event.target);
    const data = Object.fromEntries(fd.entries());
    const btn  = event.target.querySelector('[type="submit"]');
    btn.disabled = true;

    try {
      let courseId = data.course_id;

      // Se for uma nova produção, criar o curso primeiro
      if (courseId === '__new_production__') {
        const prodName = document.getElementById('new-production-name')?.value?.trim();
        if (!prodName) {
          toast('Informe o nome da peca ou producao.', 'warning');
          btn.disabled = false;
          return;
        }
        const { data: newCourse, error: cErr } = await db.from('courses').insert([{
          name: prodName, type: 'production', level: null, workload: null
        }]).select().single();
        if (cErr) throw cErr;
        courseId = newCourse.id;
      }

      const payload = {
        course_id:   courseId || null,
        teacher_id:  data.teacher_id || null,
        day_of_week: data.day_of_week,
        schedule:    data.schedule,
        start_date:  data.start_date ? data.start_date + '-01' : null,
        end_date:    data.end_date   ? data.end_date   + '-01' : null,
        status:      data.status,
      };

      if (id) {
        const { error } = await db.from('classes').update(payload).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await db.from('classes').insert([payload]);
        if (error) throw error;
      }

      toast(id ? 'Turma atualizada.' : 'Turma criada.', 'success');
      closeModal();
      await loadClasses();
    } catch (err) {
      toast('Erro ao salvar: ' + (err.message || ''), 'error');
      btn.disabled = false;
    }
  }

  return { render, openClassDetail, openClassForm, saveClass, onCourseChange, openAttendance, saveAttendance };
})();
