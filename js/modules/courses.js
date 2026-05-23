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
    const isSandbox  = c.is_sandbox;

    return `
      <div class="class-card ${isSandbox ? 'class-card-sandbox' : ''}"
        onclick="CoursesModule.openClassDetail('${c.id}')">
        <div class="class-card-header">
          <div style="display:flex;align-items:center;gap:6px;">
            <div class="class-type-badge ${badge.css}">${badge.label}</div>
            ${isSandbox ? '<span class="badge badge-warning" style="font-size:9px;padding:1px 5px;">TESTE</span>' : ''}
          </div>
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
          ${activeStudents.length > 0 ? `
          <button class="btn btn-secondary btn-sm"
            onclick="event.stopPropagation(); CoursesModule.openChamada('${c.id}')">
            Chamada
          </button>` : ''}
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
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">
            <h3 class="detail-section-title" style="margin:0;">
              Alunos Matriculados (${activeEnrollments.length})
            </h3>
            ${activeEnrollments.length ? `
            <button class="btn btn-primary btn-sm"
              onclick="CoursesModule.openChamada('${id}')">
              Fazer Chamada
            </button>` : ''}
          </div>
          ${activeEnrollments.length ? `
          <div class="table-wrapper mini">
            <table class="data-table">
              <thead><tr>
                <th>Nome</th><th>RA</th><th>Telefone</th><th>Historico</th>
              </tr></thead>
              <tbody>
                ${activeEnrollments.map(e => `<tr>
                  <td>${escapeHtml(e.students?.name || '—')}</td>
                  <td class="text-accent">${escapeHtml(e.students?.ra || '—')}</td>
                  <td>${escapeHtml(e.students?.student_phone || '—')}</td>
                  <td>
                    <button class="btn-icon" onclick="CoursesModule.openAttendance('${e.id}', '${id}')">
                      Ver faltas
                    </button>
                  </td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>` : '<p class="empty-state">Nenhum aluno matriculado.</p>'}
        </div>
      </div>
    `, true);
  }

  // ─── Chamada em massa ────────────────────────────────────
  async function openChamada(classId) {
    const today = new Date().toISOString().split('T')[0];

    const { data: cls } = await db.from('classes')
      .select(`*, courses(name), profiles(name),
        enrollments(id, student_id, status, students(id, name, ra))`)
      .eq('id', classId).single();

    if (!cls) return toast('Turma nao encontrada.', 'error');

    const actives = (cls.enrollments || []).filter(e => e.status === 'active');
    if (!actives.length) return toast('Nenhum aluno matriculado nesta turma.', 'warning');

    // Busca chamada já registrada para hoje
    const { data: existingAtt } = await db.from('attendance')
      .select('enrollment_id, status')
      .eq('class_id', classId)
      .eq('date', today);

    const attMap = {};
    (existingAtt || []).forEach(a => { attMap[a.enrollment_id] = a.status; });

    const alreadySaved = existingAtt?.length > 0;

    openModal(`Chamada — ${escapeHtml(cls.courses?.name || '—')}`, `
      <div class="chamada-header">
        <div class="form-group" style="margin:0;flex:1;">
          <label>Data da Aula</label>
          <input type="date" id="chamada-date" class="input" value="${today}">
        </div>
        <div class="chamada-legend">
          <span class="chamada-dot present">P</span> Presente &nbsp;
          <span class="chamada-dot absent">F</span> Falta &nbsp;
          <span class="chamada-dot justified">J</span> Justificada
        </div>
      </div>

      ${alreadySaved ? `
      <div class="sandbox-info-box" style="margin-bottom:1rem;">
        Chamada ja registrada para hoje. Salvar novamente ira sobrescrever.
      </div>` : ''}

      <div class="chamada-list">
        ${actives.map((e, i) => {
          const st = attMap[e.id] || 'present';
          return `<div class="chamada-row" data-enrollment="${e.id}" data-student="${e.students?.id || ''}">
            <div class="chamada-num">${i + 1}</div>
            <div class="chamada-student">
              <div class="chamada-student-name">${escapeHtml(e.students?.name || '—')}</div>
              <div class="chamada-student-ra">${escapeHtml(e.students?.ra || '—')}</div>
            </div>
            <div class="chamada-btns">
              <button class="chamada-btn present ${st === 'present'   ? 'active' : ''}"
                data-status="present"
                onclick="CoursesModule.setChamadaStatus(this)">P</button>
              <button class="chamada-btn absent ${st === 'absent'    ? 'active' : ''}"
                data-status="absent"
                onclick="CoursesModule.setChamadaStatus(this)">F</button>
              <button class="chamada-btn justified ${st === 'justified' ? 'active' : ''}"
                data-status="justified"
                onclick="CoursesModule.setChamadaStatus(this)">J</button>
            </div>
          </div>`;
        }).join('')}
      </div>

      <div class="chamada-summary" id="chamada-summary">
        ${buildChamadaSummary(actives.length, attMap)}
      </div>

      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="CoursesModule.saveChamada('${classId}')">
          Salvar Chamada
        </button>
      </div>
    `, true);
  }

  function buildChamadaSummary(total, attMap) {
    const counts = { present: 0, absent: 0, justified: 0 };
    Object.values(attMap).forEach(s => { if (counts[s] !== undefined) counts[s]++; });
    // conta os que ainda estão como default (present) se não estiverem no mapa
    const mapped = Object.keys(attMap).length;
    counts.present += (total - mapped);
    return `<span class="chamada-count present">${counts.present} presentes</span>
            <span class="chamada-count absent">${counts.absent} faltas</span>
            <span class="chamada-count justified">${counts.justified} justificadas</span>`;
  }

  function setChamadaStatus(btn) {
    const row = btn.closest('.chamada-row');
    row.querySelectorAll('.chamada-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Recalcula resumo ao vivo
    const allRows = document.querySelectorAll('.chamada-row');
    const counts  = { present: 0, absent: 0, justified: 0 };
    allRows.forEach(r => {
      const active = r.querySelector('.chamada-btn.active');
      const s = active?.dataset.status || 'present';
      if (counts[s] !== undefined) counts[s]++;
    });
    const sumEl = document.getElementById('chamada-summary');
    if (sumEl) sumEl.innerHTML =
      `<span class="chamada-count present">${counts.present} presentes</span>
       <span class="chamada-count absent">${counts.absent} faltas</span>
       <span class="chamada-count justified">${counts.justified} justificadas</span>`;
  }

  async function saveChamada(classId) {
    const date = document.getElementById('chamada-date')?.value;
    if (!date) return toast('Selecione a data.', 'warning');

    const rows    = document.querySelectorAll('.chamada-row');
    if (!rows.length) return;

    const records = [];
    rows.forEach(row => {
      const enrollmentId = row.dataset.enrollment;
      const studentId    = row.dataset.student;
      const activeBtn    = row.querySelector('.chamada-btn.active');
      const status       = activeBtn?.dataset.status || 'present';
      if (enrollmentId) records.push({
        enrollment_id: enrollmentId,
        student_id:    studentId || null,
        class_id:      classId,
        date, status,
      });
    });

    const { error } = await db.from('attendance')
      .upsert(records, { onConflict: 'enrollment_id,date' });

    if (error) return toast('Erro ao salvar chamada: ' + error.message, 'error');

    const presentes = records.filter(r => r.status === 'present').length;
    const faltas    = records.filter(r => r.status !== 'present').length;

    AuditLog.log('attendance_registered', 'class', classId, null,
      `Chamada — ${date}: ${presentes} presentes, ${faltas} faltas`);

    toast(`Chamada salva: ${presentes} presentes · ${faltas} faltas.`, 'success');
    closeModal();
  }

  // ─── Frequência individual ────────────────────────────────
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
    const { data: studentInfo } = await db.from('enrollments')
      .select('students(name)').eq('id', enrollmentId).single();
    AuditLog.log('attendance_registered', 'attendance', enrollmentId,
      studentInfo?.students?.name,
      `Frequencia registrada: ${studentInfo?.students?.name || 'aluno'} — ${date} (${status === 'present' ? 'Presente' : 'Falta'})`);

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
        AuditLog.log('class_updated', 'class', id, payload.teacher_name || data.teacher_id,
          `Turma atualizada: ${payload.teacher_name || 'turma'}`);
      } else {
        const { data: newClass, error } = await db.from('classes').insert([payload]).select().single();
        if (error) throw error;
        AuditLog.log('class_created', 'class', newClass?.id, payload.teacher_name || data.teacher_id,
          `Nova turma criada — Professor: ${payload.teacher_name || '—'}`);
      }

      toast(id ? 'Turma atualizada.' : 'Turma criada.', 'success');
      closeModal();
      await loadClasses();
    } catch (err) {
      toast('Erro ao salvar: ' + (err.message || ''), 'error');
      btn.disabled = false;
    }
  }

  return {
    render, openClassDetail, openClassForm, saveClass, onCourseChange,
    openChamada, setChamadaStatus, saveChamada,
    openAttendance, saveAttendance,
  };
})();
