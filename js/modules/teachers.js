const TeachersModule = (() => {

  async function render() {
    const el = document.getElementById('view-content');
    el.innerHTML = `<div class="loading-state">Carregando professores...</div>`;
    await loadTeachers();
  }

  async function loadTeachers() {
    try {
      const [profilesRes, invitesRes] = await Promise.all([
        db.from('profiles')
          .select(`id, name, role,
            classes(id, status, day_of_week, schedule,
              courses(name, level, type),
              enrollments(id, status, students(id, name, ra)))`)
          .eq('role', 'teacher')
          .order('name'),
        db.from('teacher_invites')
          .select('id, email, name, used, created_at')
          .eq('used', false)
          .order('created_at', { ascending: false })
      ]);

      renderTeachers(profilesRes.data || [], invitesRes.data || []);
    } catch (err) {
      document.getElementById('view-content').innerHTML =
        `<div class="error-state">Erro ao carregar professores: ${escapeHtml(err.message)}</div>`;
    }
  }

  function renderTeachers(teachers, pendingInvites) {
    const el = document.getElementById('view-content');
    const isAdmin = Auth.isAdmin();

    el.innerHTML = `
      <div class="view-header">
        <h1 class="view-title">Professores</h1>
        <div class="view-actions">
          ${isAdmin ? `
          <button class="btn btn-secondary" onclick="TeachersModule.showDirectAdd()">
            Cadastrar via SQL
          </button>
          <button class="btn btn-primary" onclick="TeachersModule.openForm()">
            Convidar Professor
          </button>` : ''}
        </div>
      </div>

      <!-- Professores ativos -->
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>Nome</th>
            <th>Turmas Ativas</th>
            <th>Total Alunos</th>
            <th>Horarios</th>
            <th>Acoes</th>
          </tr></thead>
          <tbody>
            ${teachers.length ? teachers.map(t => {
              const activeClasses = (t.classes || []).filter(c => c.status === 'active');
              const totalStudents = activeClasses.reduce((sum, c) => {
                return sum + (c.enrollments || []).filter(e => e.status === 'active').length;
              }, 0);
              const schedules = activeClasses
                .map(c => `${DAYS_PT[c.day_of_week] || c.day_of_week} ${c.schedule?.substring(0,5) || ''}`)
                .join(', ') || '—';

              return `<tr>
                <td><div class="cell-name">${escapeHtml(t.name)}</div></td>
                <td>${activeClasses.length}</td>
                <td>${totalStudents}</td>
                <td class="text-secondary">${schedules}</td>
                <td class="actions-cell">
                  <button class="btn-icon" onclick="TeachersModule.openDetail('${t.id}')">Detalhar</button>
                  ${isAdmin ? `
                  <button class="btn-icon" onclick="TeachersModule.openForm('${t.id}')">Editar</button>
                  <button class="btn-icon btn-icon-danger" onclick="TeachersModule.deleteTeacher('${t.id}')">Excluir</button>
                  ` : ''}
                </td>
              </tr>`;
            }).join('') : `<tr><td colspan="5" class="empty-state">Nenhum professor cadastrado ainda.</td></tr>`}
          </tbody>
        </table>
      </div>

      <!-- Convites pendentes -->
      ${isAdmin && pendingInvites.length ? `
      <div class="section-header mt-6">
        <h2 class="section-title">Convites Pendentes (${pendingInvites.length})</h2>
      </div>
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>Nome</th><th>E-mail</th><th>Convidado em</th><th>Acoes</th>
          </tr></thead>
          <tbody>
            ${pendingInvites.map(inv => `<tr>
              <td>${escapeHtml(inv.name)}</td>
              <td class="text-secondary">${escapeHtml(inv.email)}</td>
              <td>${formatDate(inv.created_at?.split('T')[0])}</td>
              <td class="actions-cell">
                <button class="btn-icon" onclick="TeachersModule.showRegisterLink()">Ver Link</button>
                <button class="btn-icon btn-icon-danger" onclick="TeachersModule.cancelInvite('${inv.id}')">Cancelar</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}
    `;
  }

  // ─── Detalhe do professor ─────────────────────────────────
  async function openDetail(id) {
    const { data: teacher, error } = await db.from('profiles')
      .select(`id, name, role, phone, cpf, birth_date, days_at_school,
        classes(id, status, day_of_week, schedule,
          courses(name, level, type, workload),
          enrollments(id, status, students(id, name, ra, student_phone)))`)
      .eq('id', id).single();

    if (error || !teacher) return toast('Erro ao carregar professor.', 'error');

    const activeClasses   = (teacher.classes || []).filter(c => c.status === 'active');
    const finishedClasses = (teacher.classes || []).filter(c => c.status === 'finished');

    const daysDisplay = teacher.days_at_school
      ? teacher.days_at_school.split(',').map(d => DAYS_PT[d] || d).join(', ')
      : null;

    openModal('Ficha do Professor', `
      <div class="teacher-header">
        <h2 class="teacher-name">${escapeHtml(teacher.name)}</h2>
        <span class="badge badge-secondary">Professor</span>
      </div>

      <div class="detail-grid" style="margin-bottom:1.5rem;">
        <div class="detail-section">
          <h3 class="detail-section-title">Dados Pessoais</h3>
          ${teacher.phone ? `<div class="detail-row"><span>Telefone</span><strong>${escapeHtml(teacher.phone)}</strong></div>` : ''}
          ${teacher.cpf ? `<div class="detail-row"><span>CPF</span><strong>${escapeHtml(teacher.cpf)}</strong></div>` : ''}
          ${teacher.birth_date ? `<div class="detail-row"><span>Nascimento</span><strong>${formatDate(teacher.birth_date)}</strong></div>` : ''}
          ${daysDisplay ? `<div class="detail-row"><span>Dias na Escola</span><strong>${daysDisplay}</strong></div>` : ''}
          ${!teacher.phone && !teacher.cpf && !teacher.birth_date && !daysDisplay
            ? `<p class="empty-state" style="font-size:0.85rem;">Nenhum dado pessoal cadastrado. Clique em Editar para preencher.</p>` : ''}
        </div>
      </div>

      <h3 class="detail-section-title mt-4">Turmas Ativas (${activeClasses.length})</h3>
      ${activeClasses.length ? activeClasses.map(c => {
        const activeStudents = (c.enrollments || []).filter(e => e.status === 'active');
        const typeLabel  = c.courses?.type === 'production' ? 'Producao' : c.courses?.type === 'infantil' ? 'Infantil' : 'Regular';
        const badgeClass = c.courses?.type === 'production' ? 'badge-accent' : c.courses?.type === 'infantil' ? 'badge-warning' : 'badge-secondary';
        return `
          <div class="teacher-class-block">
            <div class="teacher-class-header">
              <span class="teacher-class-name">${escapeHtml(c.courses?.name || '—')}</span>
              <span class="teacher-class-schedule">
                ${DAYS_PT[c.day_of_week] || c.day_of_week} - ${c.schedule?.substring(0,5) || '—'}
              </span>
              <span class="badge ${badgeClass}">${typeLabel}</span>
            </div>
            ${activeStudents.length ? `
            <div class="teacher-student-list">
              ${activeStudents.map(e => `
                <div class="teacher-student-item">
                  <span class="student-name">${escapeHtml(e.students?.name || '—')}</span>
                  <span class="student-ra text-accent">${escapeHtml(e.students?.ra || '—')}</span>
                  <span class="student-phone text-secondary">${escapeHtml(e.students?.student_phone || '')}</span>
                </div>`).join('')}
            </div>` : '<p class="empty-state mini">Nenhum aluno matriculado.</p>'}
          </div>`;
      }).join('') : '<p class="empty-state">Nenhuma turma ativa.</p>'}

      ${finishedClasses.length ? `
      <h3 class="detail-section-title mt-4">Turmas Concluidas (${finishedClasses.length})</h3>
      <div class="table-wrapper mini">
        <table class="data-table">
          <thead><tr><th>Curso</th><th>Alunos</th></tr></thead>
          <tbody>
            ${finishedClasses.map(c => `<tr>
              <td>${escapeHtml(c.courses?.name || '—')}</td>
              <td>${(c.enrollments || []).length}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}
    `, true);
  }

  // ─── Formulário: criar convite ou editar nome ─────────────
  async function openForm(id = null) {
    let teacher = null;
    if (id) {
      const { data } = await db.from('profiles').select('*').eq('id', id).single();
      teacher = data;
    }

    const currentDays = (teacher?.days_at_school || '').split(',').filter(Boolean);

    openModal(id ? 'Editar Professor' : 'Convidar Professor', `
      <form id="teacher-form" onsubmit="TeachersModule.saveTeacher(event, '${id || ''}')">
        <div class="form-grid">
          <div class="form-group span-2">
            <label>Nome Completo *</label>
            <input type="text" name="name" class="input" required
              value="${escapeHtml(teacher?.name || '')}" placeholder="Nome do professor">
          </div>
          ${!id ? `
          <div class="form-group span-2">
            <label>E-mail *</label>
            <input type="email" name="email" class="input" required placeholder="email@tpc.com.br">
          </div>` : `
          <div class="form-group">
            <label>Telefone</label>
            <input type="text" name="phone" class="input" maxlength="15"
              value="${escapeHtml(teacher?.phone || '')}"
              oninput="this.value=maskPhone(this.value)">
          </div>
          <div class="form-group">
            <label>CPF</label>
            <input type="text" name="cpf" class="input" maxlength="14"
              value="${escapeHtml(teacher?.cpf || '')}"
              oninput="this.value=maskCPF(this.value)">
          </div>
          <div class="form-group">
            <label>Data de Nascimento</label>
            <input type="date" name="birth_date" class="input"
              value="${teacher?.birth_date?.substring(0, 10) || ''}">
          </div>
          <div class="form-group span-2">
            <label>Dias na Escola</label>
            <div class="days-checkboxes">
              ${Object.entries(DAYS_PT).map(([v, l]) => `
                <label class="checkbox-label">
                  <input type="checkbox" name="day_${v}"
                    ${currentDays.includes(v) ? 'checked' : ''}>
                  ${l}
                </label>`).join('')}
            </div>
          </div>`}
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">${id ? 'Salvar' : 'Criar Convite'}</button>
        </div>
      </form>
      ${!id ? `<p class="form-note">
        Um convite sera gerado. Compartilhe o link de cadastro com o professor para que ele crie sua propria senha.
      </p>` : ''}
    `);
  }

  async function saveTeacher(event, id) {
    event.preventDefault();
    const fd   = new FormData(event.target);
    const data = Object.fromEntries(fd.entries());
    const btn  = event.target.querySelector('[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    try {
      if (id) {
        // Coletar dias marcados
        const selectedDays = Object.keys(DAYS_PT)
          .filter(v => data[`day_${v}`] === 'on')
          .join(',');

        const { error } = await db.from('profiles').update({
          name:           data.name,
          phone:          data.phone || null,
          cpf:            data.cpf   || null,
          birth_date:     data.birth_date || null,
          days_at_school: selectedDays || null,
        }).eq('id', id);
        if (error) throw error;
        AuditLog.log('teacher_updated', 'teacher', id, data.name,
          `Perfil do professor ${data.name} atualizado`);
        toast('Professor atualizado.', 'success');
        closeModal();

      } else {
        // Criar convite (professor cria a própria senha em /register.html)
        const { error } = await db.from('teacher_invites').insert([{
          email: data.email.trim().toLowerCase(),
          name:  data.name.trim()
        }]);

        if (error) {
          if (error.code === '23505') throw new Error('Este e-mail ja foi convidado ou ja esta cadastrado.');
          throw error;
        }

        // Mostrar link de cadastro
        const registerUrl = `${window.location.origin}/register.html`;
        closeModal();
        openModal('Convite Criado', `
          <div class="invite-success">
            <p>Convite criado para <strong>${escapeHtml(data.name)}</strong>.</p>
            <p style="margin-top:10px;">Compartilhe o link abaixo com o professor:</p>
            <div class="register-url-box">
              <code id="reg-url-text">${registerUrl}</code>
              <button class="btn btn-secondary" onclick="navigator.clipboard.writeText('${registerUrl}').then(() => this.textContent='Copiado!')">
                Copiar Link
              </button>
            </div>
            <p class="form-note" style="margin-top:12px;">
              O professor deve usar o e-mail <strong>${escapeHtml(data.email)}</strong> na pagina de cadastro.
            </p>
          </div>
          <div class="modal-actions">
            <button class="btn btn-primary" onclick="closeModal()">Entendido</button>
          </div>
        `);
      }

      await loadTeachers();
    } catch (err) {
      toast('Erro: ' + (err.message || 'Tente novamente.'), 'error');
      btn.disabled = false;
      btn.textContent = id ? 'Salvar' : 'Criar Convite';
    }
  }

  function showRegisterLink() {
    const url = `${window.location.origin}/register.html`;
    openModal('Link de Cadastro', `
      <p>Envie este link para o professor criar sua conta:</p>
      <div class="register-url-box" style="margin-top:12px;">
        <code>${url}</code>
        <button class="btn btn-secondary" onclick="navigator.clipboard.writeText('${url}').then(() => this.textContent='Copiado!')">Copiar</button>
      </div>
      <div class="modal-actions"><button class="btn btn-primary" onclick="closeModal()">Fechar</button></div>
    `);
  }

  async function cancelInvite(id) {
    const confirmed = await confirmDialog('Cancelar este convite? O professor não poderá mais usar este e-mail para se cadastrar.');
    if (!confirmed) return;
    const { error } = await db.from('teacher_invites').delete().eq('id', id);
    if (error) return toast('Erro ao cancelar convite.', 'error');
    toast('Convite cancelado.', 'success');
    await loadTeachers();
  }

  async function deleteTeacher(id) {
    const confirmed = await confirmDialog('Remover este professor? As turmas atribuídas a ele serão mantidas.');
    if (!confirmed) return;
    const { error } = await db.from('profiles').delete().eq('id', id);
    if (error) return toast('Erro ao remover: ' + error.message, 'error');
    toast('Professor removido.', 'success');
    await loadTeachers();
  }

  // ─── Cadastro direto via SQL (sem envio de e-mail) ────────
  function showDirectAdd() {
    openModal('Cadastrar Professor sem E-mail', `
      <div style="line-height:1.7">
        <p style="margin-bottom:1rem;">
          Use este metodo quando o limite de e-mails do Supabase estiver esgotado
          ou quando preferir nao enviar convite.
        </p>

        <div class="detail-section" style="margin-bottom:1.2rem;">
          <h3 class="detail-section-title">Passo 1 — Criar o usuario no Supabase</h3>
          <ol style="padding-left:1.2rem; color:var(--text-secondary); font-size:0.9rem;">
            <li>Acesse <strong style="color:var(--text-primary)">app.supabase.com</strong> → seu projeto</li>
            <li>Va em <strong style="color:var(--text-primary)">Authentication &rarr; Users</strong></li>
            <li>Clique em <strong style="color:var(--text-primary)">"Add user" &rarr; "Create new user"</strong></li>
            <li>Informe o e-mail e uma senha provisoria para o professor</li>
            <li>Copie o <strong style="color:var(--accent)">User UID</strong> gerado (coluna ID)</li>
          </ol>
        </div>

        <div class="detail-section" style="margin-bottom:1.2rem;">
          <h3 class="detail-section-title">Passo 2 — Preencha os dados abaixo</h3>
          <div class="form-grid" style="grid-template-columns:1fr 1fr; gap:0.75rem; margin-bottom:0.75rem;">
            <div class="form-group">
              <label>Nome do Professor *</label>
              <input type="text" id="sql-teacher-name" class="input"
                placeholder="Ex: Maria Silva" oninput="TeachersModule.updateDirectSQL()">
            </div>
            <div class="form-group">
              <label>User UID (copiado do Supabase) *</label>
              <input type="text" id="sql-teacher-uuid" class="input"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                oninput="TeachersModule.updateDirectSQL()">
            </div>
          </div>
        </div>

        <div class="detail-section">
          <h3 class="detail-section-title">Passo 3 — Execute no SQL Editor do Supabase</h3>
          <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:0.5rem;">
            Supabase → SQL Editor → "New query" → cole o SQL abaixo → Run
          </p>
          <div style="background:var(--bg-tertiary); border:1px solid var(--border); border-radius:6px; padding:0.85rem; font-family:monospace; font-size:0.82rem; color:var(--text-primary); white-space:pre-wrap; word-break:break-all;" id="sql-preview">
INSERT INTO profiles (id, name, role)
VALUES (
  '— preencha o UID acima —',
  '— preencha o nome acima —',
  'teacher'
);</div>
          <button class="btn btn-secondary" style="margin-top:0.5rem; font-size:0.85rem;"
            onclick="TeachersModule.copyDirectSQL()">
            Copiar SQL
          </button>
        </div>
      </div>

      <div class="modal-actions" style="margin-top:1.5rem;">
        <button class="btn btn-secondary" onclick="closeModal()">Fechar</button>
        <button class="btn btn-primary" onclick="closeModal(); TeachersModule.render();">
          Ja executei — Recarregar lista
        </button>
      </div>
    `, true);
  }

  function updateDirectSQL() {
    const name = document.getElementById('sql-teacher-name')?.value?.trim() || '— preencha o nome acima —';
    const uuid = document.getElementById('sql-teacher-uuid')?.value?.trim() || '— preencha o UID acima —';
    const preview = document.getElementById('sql-preview');
    if (preview) {
      preview.textContent =
        `INSERT INTO profiles (id, name, role)\nVALUES (\n  '${uuid}',\n  '${name}',\n  'teacher'\n);`;
    }
  }

  function copyDirectSQL() {
    const preview = document.getElementById('sql-preview');
    if (!preview) return;
    navigator.clipboard.writeText(preview.textContent)
      .then(() => toast('SQL copiado.', 'success'))
      .catch(() => toast('Nao foi possivel copiar. Selecione e copie manualmente.', 'warning'));
  }

  return {
    render, openDetail, openForm, saveTeacher,
    showRegisterLink, cancelInvite, deleteTeacher,
    showDirectAdd, updateDirectSQL, copyDirectSQL
  };
})();
