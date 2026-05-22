const SettingsModule = (() => {
  const STORAGE_KEY = 'tpc_pdf_settings';

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

  async function render() {
    if (!Auth.isAdmin()) {
      document.getElementById('view-content').innerHTML =
        `<div class="error-state">Acesso restrito ao administrador.</div>`;
      return;
    }

    const cfg = getSettings();
    const el  = document.getElementById('view-content');
    const states = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS',
                    'MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC',
                    'SP','SE','TO'];

    el.innerHTML = `
      <div class="view-header">
        <h1 class="view-title">Configuracoes</h1>
        <div class="view-actions">
          <span class="view-subtitle">As configuracoes sao salvas localmente neste navegador.</span>
        </div>
      </div>

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

      <div class="form-section" style="border:1px solid var(--border); border-radius:8px; padding:1.25rem; margin-top:0.5rem;">
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
    `;
  }

  function save(event) {
    event.preventDefault();
    const fd   = new FormData(event.target);
    const data = Object.fromEntries(fd.entries());
    persistSettings(data);
    toast('Configuracoes salvas com sucesso.', 'success');
  }

  return { render, getSettings, save };
})();
