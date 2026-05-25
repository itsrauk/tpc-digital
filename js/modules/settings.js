const SettingsModule = (() => {
  const STORAGE_KEY = 'tpc_pdf_settings';

  const ROLE_LABELS = {
    admin:     'Administrador',
    financial: 'Financeiro',
    secretary: 'Secretaria',
    teacher:   'Professor',
  };
  const ROLE_BADGE = {
    admin:     'badge-danger',
    financial: 'badge-success',
    secretary: 'badge-info',
    teacher:   'badge-warning',
  };

  let allUsers = [];

  // ─── Configurações locais ──────────────────────────────────────
  function defaults() {
    return {
      school_name:    'TPC - Teatro Popular de Comedia',
      school_address: '',
      school_city:    'Sao Paulo',
      school_state:   'SP',
      school_phone:   '',
      school_cnpj:    '',
      contract_court: 'Sao Paulo',
      cert_extra_text: '',
    };
  }

  function getSettings() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return { ...defaults(), ...(saved ? JSON.parse(saved) : {}) };
    } catch {
      return defaults();
    }
  }

  function persistSettings(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...getSettings(), ...data }));
  }

  // ─── Render principal ──────────────────────────────────────────
  async function render() {
    if (!Auth.isAdmin()) {
      document.getElementById('view-content').innerHTML =
        `<div class="error-state">Acesso restrito ao administrador.</div>`;
      return;
    }

    document.getElementById('view-content').innerHTML =
      `<div class="loading-state">Carregando configuracoes...</div>`;

    const [cfg, users] = await Promise.all([
      Promise.resolve(getSettings()),
      loadUsers(),
    ]);
    allUsers = users;

    const el     = document.getElementById('view-content');
    const states = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS',
                    'MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC',
                    'SP','SE','TO'];

    el.innerHTML = `
      <div class="view-header">
        <h1 class="view-title">Configuracoes</h1>
        <div class="view-actions">
          <span class="view-subtitle">As configuracoes de escola sao salvas localmente neste navegador.</span>
        </div>
      </div>

      <!-- ── Informações da escola ──────────────────────────── -->
      <form id="settings-form" onsubmit="SettingsModule.save(event)">
        <div class="form-sections">

          <div class="form-section">
            <h3 class="form-section-title">Informacoes da Escola</h3>
            <p class="form-section-desc">Utilizadas em contratos, carteirinhas, certificados e carnes.</p>
            <div class="form-grid">
              <div class="form-group span-2">
                <label>Nome da Escola</label>
                <input type="text" name="school_name" class="input"
                  value="${escapeHtml(cfg.school_name)}"
                  placeholder="TPC - Teatro Popular de Comedia">
              </div>
              <div class="form-group span-2">
                <label>Endereco</label>
                <input type="text" name="school_address" class="input"
                  value="${escapeHtml(cfg.school_address)}"
                  placeholder="Logradouro, numero, bairro">
              </div>
              <div class="form-group">
                <label>Cidade</label>
                <input type="text" name="school_city" class="input"
                  value="${escapeHtml(cfg.school_city)}">
              </div>
              <div class="form-group">
                <label>Estado</label>
                <select name="school_state" class="input">
                  ${states.map(s =>
                    `<option value="${s}" ${cfg.school_state === s ? 'selected' : ''}>${s}</option>`
                  ).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>Telefone</label>
                <input type="text" name="school_phone" class="input"
                  value="${escapeHtml(cfg.school_phone)}"
                  placeholder="(11) 00000-0000">
              </div>
              <div class="form-group">
                <label>CNPJ</label>
                <input type="text" name="school_cnpj" class="input"
                  value="${escapeHtml(cfg.school_cnpj)}"
                  placeholder="00.000.000/0001-00">
              </div>
            </div>
          </div>

          <div class="form-section">
            <h3 class="form-section-title">Contratos</h3>
            <div class="form-grid">
              <div class="form-group span-2">
                <label>Cidade para o Foro de Disputas</label>
                <input type="text" name="contract_court" class="input"
                  value="${escapeHtml(cfg.contract_court)}"
                  placeholder="Sao Paulo">
              </div>
            </div>
          </div>

          <div class="form-section">
            <h3 class="form-section-title">Certificados</h3>
            <div class="form-grid">
              <div class="form-group span-2">
                <label>Texto extra (opcional — aparece abaixo do nome do aluno)</label>
                <input type="text" name="cert_extra_text" class="input"
                  value="${escapeHtml(cfg.cert_extra_text)}"
                  placeholder="Ex: Aprovado com louvor">
              </div>
            </div>
          </div>

        </div>

        <div style="padding: 0 0 2rem 0;">
          <button type="submit" class="btn btn-primary">Salvar Configuracoes</button>
        </div>
      </form>

      <!-- ── Usuários com acesso ─────────────────────────────── -->
      <div class="form-section" style="border:1px solid var(--border);border-radius:8px;padding:1.25rem;margin-bottom:1.5rem;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
          <h3 class="form-section-title" style="margin:0;">Usuarios com Acesso</h3>
          <button class="btn btn-secondary" style="font-size:12px" onclick="SettingsModule.refreshUsers()">
            Atualizar lista
          </button>
        </div>
        <div id="users-list-container">
          ${renderUsersList(allUsers)}
        </div>
      </div>

      <!-- ── Adicionar novo usuário ──────────────────────────── -->
      <div class="form-section" id="add-user-section"
        style="border:1px solid var(--border);border-radius:8px;padding:1.25rem;margin-bottom:1.5rem;">
        <h3 class="form-section-title" style="margin-top:0;">Adicionar Novo Usuario</h3>
        <p style="color:var(--text-secondary);font-size:0.9rem;line-height:1.7;margin-bottom:1.25rem;">
          Usuarios precisam de uma conta no Supabase antes de receber um papel no sistema.
          Siga os passos abaixo.
        </p>

        <div class="detail-section" style="margin-bottom:1.2rem;">
          <h3 class="detail-section-title">Passo 1 — Criar conta no Supabase</h3>
          <ol style="padding-left:1.2rem;color:var(--text-secondary);font-size:0.88rem;line-height:1.9;">
            <li>Acesse <strong style="color:var(--text-primary)">app.supabase.com</strong> → seu projeto</li>
            <li>Va em <strong style="color:var(--text-primary)">Authentication → Users → Add user → Create new user</strong></li>
            <li>Informe o e-mail e uma senha para o usuario</li>
            <li>Copie o <strong style="color:var(--accent)">User UID</strong> gerado (coluna ID)</li>
          </ol>
        </div>

        <div class="detail-section" style="margin-bottom:1.2rem;">
          <h3 class="detail-section-title">Passo 2 — Preencha os dados</h3>
          <div class="form-grid" style="gap:0.75rem;margin-bottom:0.75rem;">
            <div class="form-group">
              <label>Nome do Usuario *</label>
              <input type="text" id="add-user-name" class="input"
                placeholder="Ex: Lucia Financeiro" oninput="SettingsModule.updateAddUserSQL()">
            </div>
            <div class="form-group">
              <label>Papel *</label>
              <select id="add-user-role" class="input" onchange="SettingsModule.updateAddUserSQL()">
                <option value="financial">Financeiro</option>
                <option value="secretary">Secretaria</option>
                <option value="teacher">Professor</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <div class="form-group span-2">
              <label>User UID (copiado do Supabase) *</label>
              <input type="text" id="add-user-uuid" class="input"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                oninput="SettingsModule.updateAddUserSQL()">
            </div>
          </div>
        </div>

        <div class="detail-section">
          <h3 class="detail-section-title">Passo 3 — Execute no SQL Editor do Supabase</h3>
          <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:0.5rem;">
            Supabase → SQL Editor → "New query" → cole o SQL abaixo → Run
          </p>
          <div style="background:var(--bg-tertiary);border:1px solid var(--border);border-radius:6px;
                      padding:0.85rem;font-family:monospace;font-size:0.82rem;
                      color:var(--text-primary);white-space:pre-wrap;word-break:break-all;"
               id="add-user-sql-preview">INSERT INTO profiles (id, name, role)
VALUES (
  '— preencha o UID acima —',
  '— preencha o nome acima —',
  'financial'
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role;</div>
          <button class="btn btn-secondary" style="margin-top:0.5rem;font-size:0.85rem;"
            onclick="SettingsModule.copyAddUserSQL()">
            Copiar SQL
          </button>
        </div>
      </div>

      <!-- ── Segurança ───────────────────────────────────────── -->
      <div class="form-section" style="border:1px solid var(--border); border-radius:8px; padding:1.25rem; margin-bottom:1.5rem;">
        <h3 class="form-section-title" style="margin-top:0;">Seguranca — Publicacao no GitHub Pages</h3>
        <p style="color:var(--text-secondary); font-size:0.9rem; line-height:1.7;">
          Antes de publicar, configure no painel do Supabase:<br>
          <strong style="color:var(--text-primary)">1.</strong>
          <code style="background:var(--bg-tertiary);padding:1px 6px;border-radius:4px;">Settings &rarr; API &rarr; Site URL</code>
          — informe a URL do GitHub Pages (<code>https://seu-usuario.github.io/nome-repo</code>)<br>
          <strong style="color:var(--text-primary)">2.</strong>
          <code style="background:var(--bg-tertiary);padding:1px 6px;border-radius:4px;">Authentication &rarr; URL Configuration &rarr; Redirect URLs</code>
          — adicione <code>https://seu-usuario.github.io/*</code><br>
          <strong style="color:var(--text-primary)">3.</strong> A chave <code>anon</code> no codigo e publica por design do Supabase — as politicas RLS garantem que so usuarios autenticados acessam os dados.
        </p>
      </div>

      <!-- ── Sandbox ─────────────────────────────────────────── -->
      <div class="sandbox-panel">
        <div class="sandbox-panel-header">
          <div>
            <h3 class="form-section-title" style="margin:0;">Sandbox de Testes</h3>
            <p style="color:var(--text-secondary);font-size:0.85rem;margin-top:4px;">
              Cria dados ficticios marcados com <strong>[TESTE]</strong> para treinar a equipe.
              Nao afeta alunos, turmas ou pagamentos reais.
            </p>
          </div>
          <span class="badge badge-warning">Admin</span>
        </div>

        <div class="sandbox-steps">
          <div class="sandbox-step">
            <div class="sandbox-step-num">1</div>
            <div>
              <strong>Execute fix_v8.sql</strong> no Supabase SQL Editor.<br>
              <span style="color:var(--text-muted);font-size:0.8rem;">
                Cria a tabela de frequencia e as funcoes seed/reset.
              </span>
            </div>
          </div>
          <div class="sandbox-step">
            <div class="sandbox-step-num">2</div>
            <div>
              <strong>Crie contas de professor para teste</strong> no Supabase:<br>
              <span style="color:var(--text-muted);font-size:0.8rem;">
                Authentication &rarr; Users &rarr; Add user<br>
                Sugestao: <code>prof1@tpc-teste.com</code> e <code>prof2@tpc-teste.com</code><br>
                Depois, no TPC Digital &rarr; Professores, defina o role como "Professor".
              </span>
            </div>
          </div>
          <div class="sandbox-step">
            <div class="sandbox-step-num">3</div>
            <div>
              <strong>Semeie os dados de teste</strong> com o botao abaixo.<br>
              <span style="color:var(--text-muted);font-size:0.8rem;">
                Cria 2 turmas, 6 alunos e atribui salas (Martins Pena + Stanislavski).
              </span>
            </div>
          </div>
        </div>

        <div class="sandbox-actions">
          <div class="sandbox-action-card">
            <div class="sandbox-action-title">Semear Dados de Teste</div>
            <div class="sandbox-action-desc">
              Cria 2 turmas + 6 alunos ficticios atribuidos aos professores existentes.
            </div>
            <button class="btn btn-secondary" onclick="SettingsModule.seedSandbox(this)">
              Semear Sandbox
            </button>
          </div>
          <div class="sandbox-action-card danger">
            <div class="sandbox-action-title">Resetar Sandbox</div>
            <div class="sandbox-action-desc">
              Apaga TODOS os dados [TESTE] (chamadas, reservas, matriculas, alunos, turmas)
              e recria do zero.
            </div>
            <button class="btn btn-danger" onclick="SettingsModule.resetSandbox(this)">
              Resetar Sandbox
            </button>
          </div>
        </div>

        <div id="sandbox-status" style="display:none" class="sandbox-info-box"></div>
      </div>
    `;
  }

  // ─── Lista de usuários ─────────────────────────────────────────
  async function loadUsers() {
    const { data, error } = await db
      .from('profiles')
      .select('id, name, role')
      .order('name');
    if (error) return [];
    return data || [];
  }

  function renderUsersList(users) {
    if (!users.length) {
      return `<p class="text-secondary" style="font-size:13px">Nenhum usuario encontrado. Execute fix_v18.sql no Supabase.</p>`;
    }

    const me = Auth.getProfile();

    return `
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>Nome</th>
            <th>Papel</th>
            <th>Acoes</th>
          </tr></thead>
          <tbody>
            ${users.map(u => {
              const isMe = u.id === me?.id;
              return `<tr>
                <td>
                  ${escapeHtml(u.name || '—')}
                  ${isMe ? `<span class="badge badge-info" style="font-size:9px;margin-left:6px">voce</span>` : ''}
                </td>
                <td>
                  <span class="badge ${ROLE_BADGE[u.role] || 'badge-secondary'}">
                    ${ROLE_LABELS[u.role] || u.role}
                  </span>
                </td>
                <td class="actions-cell">
                  <button class="btn-icon"
                    onclick="SettingsModule.openEditUser('${u.id}')">
                    Alterar papel
                  </button>
                  ${!isMe ? `
                  <button class="btn-icon btn-icon-danger"
                    onclick="SettingsModule.removeUser('${u.id}', '${escapeHtml(u.name || '')}')">
                    Remover acesso
                  </button>` : ''}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  async function refreshUsers() {
    const container = document.getElementById('users-list-container');
    if (container) container.innerHTML = `<p class="text-secondary" style="font-size:13px">Atualizando...</p>`;
    allUsers = await loadUsers();
    if (container) container.innerHTML = renderUsersList(allUsers);
  }

  // ─── Editar papel de usuário ───────────────────────────────────
  function openEditUser(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    openModal(`Alterar papel — ${escapeHtml(user.name || '—')}`, `
      <div style="margin-bottom:1.25rem;">
        <label class="form-label" style="display:block;margin-bottom:0.5rem;">Papel atual</label>
        <span class="badge ${ROLE_BADGE[user.role] || 'badge-secondary'}" style="font-size:13px;padding:4px 10px;">
          ${ROLE_LABELS[user.role] || user.role}
        </span>
      </div>

      <div class="form-group" style="margin-bottom:1.5rem;">
        <label>Novo papel</label>
        <select id="edit-role-select" class="input">
          ${Object.entries(ROLE_LABELS).map(([val, label]) =>
            `<option value="${val}" ${user.role === val ? 'selected' : ''}>${label}</option>`
          ).join('')}
        </select>
      </div>

      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="SettingsModule.saveUserRole('${userId}')">
          Salvar
        </button>
      </div>
    `);
  }

  async function saveUserRole(userId) {
    const newRole = document.getElementById('edit-role-select')?.value;
    if (!newRole) return;

    const { data, error } = await db
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId)
      .select('id');

    if (error) return toast('Erro ao alterar papel: ' + error.message, 'error');
    if (!data?.length) {
      toast('Sem permissao para alterar. Execute sql/fix_v18.sql no Supabase.', 'error');
      return;
    }

    const user = allUsers.find(u => u.id === userId);
    AuditLog.log('user_updated', 'teacher', userId, user?.name,
      `Papel alterado para: ${ROLE_LABELS[newRole] || newRole}`);

    toast(`Papel de ${user?.name || 'usuario'} alterado para ${ROLE_LABELS[newRole]}.`, 'success');
    closeModal();
    await refreshUsers();
  }

  // ─── Remover acesso ────────────────────────────────────────────
  async function removeUser(userId, userName) {
    const ok = await confirmDialog(
      `Remover acesso de "${userName}"?\n\nA conta no Supabase permanece, mas o usuario nao conseguira mais entrar no sistema.`
    );
    if (!ok) return;

    const { data, error } = await db
      .from('profiles')
      .delete()
      .eq('id', userId)
      .select('id');

    if (error) return toast('Erro ao remover: ' + error.message, 'error');
    if (!data?.length) {
      toast('Sem permissao para remover. Execute sql/fix_v18.sql no Supabase.', 'error');
      return;
    }

    AuditLog.log('user_deleted', 'teacher', userId, userName,
      `Acesso removido: ${userName}`);

    toast(`Acesso de ${userName} removido.`, 'success');
    await refreshUsers();
  }

  // ─── Formulário de escola ──────────────────────────────────────
  function save(event) {
    event.preventDefault();
    const fd   = new FormData(event.target);
    const data = Object.fromEntries(fd.entries());
    persistSettings(data);
    toast('Configuracoes salvas com sucesso.', 'success');
  }

  // ─── SQL de adição de usuário ──────────────────────────────────
  function updateAddUserSQL() {
    const name    = document.getElementById('add-user-name')?.value?.trim()  || '— preencha o nome acima —';
    const uuid    = document.getElementById('add-user-uuid')?.value?.trim()  || '— preencha o UID acima —';
    const role    = document.getElementById('add-user-role')?.value          || 'financial';
    const preview = document.getElementById('add-user-sql-preview');
    if (preview) {
      preview.textContent =
        `INSERT INTO profiles (id, name, role)\nVALUES (\n  '${uuid}',\n  '${name}',\n  '${role}'\n)\nON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role;`;
    }
  }

  function copyAddUserSQL() {
    const preview = document.getElementById('add-user-sql-preview');
    if (!preview) return;
    navigator.clipboard.writeText(preview.textContent)
      .then(()  => toast('SQL copiado.', 'success'))
      .catch(()  => toast('Nao foi possivel copiar. Selecione manualmente.', 'warning'));
  }

  // ─── Sandbox ───────────────────────────────────────────────────
  async function seedSandbox(btn) {
    btn.disabled    = true;
    btn.textContent = 'Semeando...';
    const statusEl  = document.getElementById('sandbox-status');
    try {
      const { data, error } = await db.rpc('seed_sandbox');
      if (error) throw error;
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.textContent   = data || 'Sandbox criado com sucesso.';
      }
      toast('Sandbox criado com sucesso.', 'success');
    } catch (e) {
      toast('Erro ao semear sandbox: ' + (e.message || 'Tente novamente.'), 'error');
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Semear Sandbox';
    }
  }

  async function resetSandbox(btn) {
    const ok = await confirmDialog(
      'Resetar o sandbox apagara TODOS os dados [TESTE] e recriara do zero. Confirmar?'
    );
    if (!ok) return;
    btn.disabled    = true;
    btn.textContent = 'Resetando...';
    const statusEl  = document.getElementById('sandbox-status');
    try {
      const { data, error } = await db.rpc('reset_sandbox');
      if (error) throw error;
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.textContent   = data || 'Sandbox resetado com sucesso.';
      }
      toast('Sandbox resetado com sucesso.', 'success');
    } catch (e) {
      toast('Erro ao resetar sandbox: ' + (e.message || 'Tente novamente.'), 'error');
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Resetar Sandbox';
    }
  }

  // ─── Compat: funções antigas renomeadas (evita quebrar chamadas residuais) ──
  function updateFinSQL()  { updateAddUserSQL(); }
  function copyFinSQL()    { copyAddUserSQL(); }

  return {
    render, save,
    loadUsers, refreshUsers, renderUsersList,
    openEditUser, saveUserRole, removeUser,
    updateAddUserSQL, copyAddUserSQL,
    updateFinSQL, copyFinSQL,
    seedSandbox, resetSandbox,
    getSettings,
  };
})();
