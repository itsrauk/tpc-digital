const MeetingsModule = (() => {

  let proposals  = [];
  let myResponses = {};

  // ─── Render ────────────────────────────────────────────────
  async function render() {
    document.getElementById('view-content').innerHTML =
      `<div class="loading-state">Carregando reunioes...</div>`;
    await loadProposals();
  }

  async function loadProposals() {
    try {
      const profile = Auth.getProfile();

      const [propRes, respRes] = await Promise.all([
        db.from('meeting_proposals').select('*').order('proposed_date'),
        db.from('meeting_responses')
          .select('*')
          .eq('user_id', profile?.id),
      ]);

      proposals   = propRes.data  || [];
      myResponses = {};
      (respRes.data || []).forEach(r => { myResponses[r.proposal_id] = r; });

      renderView();
    } catch (err) {
      document.getElementById('view-content').innerHTML =
        `<div class="error-state">Erro ao carregar: ${escapeHtml(err.message)}<br>
         Execute sql/fix_v6.sql no Supabase.</div>`;
    }
  }

  async function renderView() {
    const el = document.getElementById('view-content');
    const profile = Auth.getProfile();

    // Contar todas as respostas por proposta
    const { data: allResp } = await db.from('meeting_responses').select('*');
    const respByProposal = {};
    (allResp || []).forEach(r => {
      if (!respByProposal[r.proposal_id]) respByProposal[r.proposal_id] = [];
      respByProposal[r.proposal_id].push(r);
    });

    const upcoming = proposals.filter(p => p.status !== 'cancelled' && new Date(p.proposed_date+'T23:59:59') >= new Date());
    const past     = proposals.filter(p => p.status !== 'cancelled' && new Date(p.proposed_date+'T23:59:59') < new Date());
    const cancelled = proposals.filter(p => p.status === 'cancelled');

    el.innerHTML = `
      <div class="view-header">
        <h1 class="view-title">Agenda de Reunioes</h1>
        <div class="view-actions">
          <button class="btn btn-primary" onclick="MeetingsModule.openProposalForm()">
            + Propor Reuniao
          </button>
        </div>
      </div>

      ${upcoming.length ? `
        <h2 class="section-title" style="margin-bottom:0.75rem">Proximas Reunioes</h2>
        <div class="meetings-list">
          ${upcoming.map(p => renderCard(p, respByProposal[p.id]||[], profile)).join('')}
        </div>
      ` : `<div class="empty-state" style="margin:2rem 0">Nenhuma reuniao agendada.</div>`}

      ${past.length ? `
        <h2 class="section-title" style="margin:1.5rem 0 0.75rem">Reunioes Passadas</h2>
        <div class="meetings-list">
          ${past.map(p => renderCard(p, respByProposal[p.id]||[], profile)).join('')}
        </div>
      ` : ''}

      ${cancelled.length ? `
        <h2 class="section-title" style="margin:1.5rem 0 0.75rem;color:var(--text-muted)">Canceladas</h2>
        <div class="meetings-list">
          ${cancelled.map(p => renderCard(p, respByProposal[p.id]||[], profile)).join('')}
        </div>
      ` : ''}
    `;
  }

  function renderCard(proposal, responses, profile) {
    const myResp   = myResponses[proposal.id];
    const confirmed = responses.filter(r => r.response === 'confirmed');
    const rejected  = responses.filter(r => r.response === 'rejected');
    const isOwner   = proposal.created_by === profile?.id;
    const isAdmin   = Auth.isAdmin();

    const statusBadge = {
      voting:    'badge-warning',
      confirmed: 'badge-success',
      cancelled: 'badge-danger',
    }[proposal.status] || 'badge-warning';

    const statusLabel = {
      voting:    'Votando',
      confirmed: 'Confirmada',
      cancelled: 'Cancelada',
    }[proposal.status] || proposal.status;

    return `
      <div class="meeting-card">
        <div class="meeting-card-header">
          <div>
            <div class="meeting-card-title">${escapeHtml(proposal.title)}</div>
            <div class="meeting-card-meta text-secondary">
              Proposta por ${escapeHtml(proposal.created_by_name||'—')} •
              ${formatDate(proposal.proposed_date)}
              ${proposal.proposed_time ? ' às ' + proposal.proposed_time.slice(0,5) : ''}
            </div>
          </div>
          <span class="badge ${statusBadge}">${statusLabel}</span>
        </div>

        ${proposal.description ? `<p class="meeting-card-desc">${escapeHtml(proposal.description)}</p>` : ''}

        <div class="meeting-card-responses">
          <div class="meeting-resp-summary">
            <span class="text-success">✓ ${confirmed.length} confirmaram</span>
            <span class="text-danger" style="margin-left:1rem">✗ ${rejected.length} recusaram</span>
            ${responses.length ? `<span class="text-secondary" style="margin-left:1rem;font-size:11px">${responses.length} responderam no total</span>` : ''}
          </div>

          ${rejected.length ? `
            <div class="meeting-alt-dates">
              ${rejected.map(r => r.alternative_date ? `
                <div class="meeting-alt-item">
                  <span>${escapeHtml(r.user_name||'—')}</span> sugere
                  <strong>${formatDate(r.alternative_date)}</strong>
                  ${r.message ? `— "${escapeHtml(r.message)}"` : ''}
                </div>` : '').filter(Boolean).join('')}
            </div>
          ` : ''}
        </div>

        ${proposal.status === 'voting' ? `
          <div class="meeting-card-actions">
            ${myResp
              ? `<div class="text-secondary" style="font-size:12px">
                  Sua resposta: <strong>${myResp.response === 'confirmed' ? '✓ Confirmado' : '✗ Recusado'}</strong>
                  ${myResp.alternative_date ? `(sugere ${formatDate(myResp.alternative_date)})` : ''}
                  <button class="btn btn-secondary" style="font-size:11px;margin-left:8px"
                    onclick="MeetingsModule.openResponse('${proposal.id}')">Alterar</button>
                </div>`
              : `<button class="btn btn-primary" style="font-size:12px"
                   onclick="MeetingsModule.openResponse('${proposal.id}')">
                   Responder
                 </button>`
            }
            ${(isOwner || isAdmin) ? `
              <button class="btn btn-secondary" style="font-size:12px"
                onclick="MeetingsModule.confirmMeeting('${proposal.id}')">
                Confirmar Data
              </button>
              <button class="btn-icon btn-icon-danger" style="font-size:12px"
                onclick="MeetingsModule.cancelMeeting('${proposal.id}')">
                Cancelar
              </button>
            ` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }

  // ─── Propor reunião ────────────────────────────────────────
  function openProposalForm() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    openModal('Propor Reuniao', `
      <form id="proposal-form" onsubmit="MeetingsModule.saveProposal(event)">
        <div class="form-grid">
          <div class="form-group span-2">
            <label>Titulo *</label>
            <input type="text" name="title" class="input" required
              placeholder="Ex: Reuniao de planejamento semestral">
          </div>
          <div class="form-group span-2">
            <label>Descricao (opcional)</label>
            <textarea name="description" class="input textarea" rows="3"
              placeholder="Pauta, local, o que sera discutido..."></textarea>
          </div>
          <div class="form-group">
            <label>Data Proposta *</label>
            <input type="date" name="proposed_date" class="input" required
              min="${tomorrow.toISOString().split('T')[0]}">
          </div>
          <div class="form-group">
            <label>Horario (opcional)</label>
            <input type="time" name="proposed_time" class="input">
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">Enviar para Todos</button>
        </div>
      </form>
    `);
  }

  async function saveProposal(event) {
    event.preventDefault();
    const fd      = new FormData(event.target);
    const data    = Object.fromEntries(fd.entries());
    const profile = Auth.getProfile();
    const btn     = event.target.querySelector('[type="submit"]');
    btn.disabled  = true;

    const { data: newProp, error } = await db.from('meeting_proposals').insert([{
      created_by:      profile?.id,
      created_by_name: profile?.name,
      title:           data.title,
      description:     data.description || null,
      proposed_date:   data.proposed_date,
      proposed_time:   data.proposed_time || null,
      status:          'voting',
    }]).select().single();

    if (error) {
      toast('Erro ao criar proposta: ' + error.message, 'error');
      btn.disabled = false;
      return;
    }

    // Notificar todos (exceto o próprio propositor)
    await NotificationsHelper.notifyAll(
      `Nova reuniao proposta: ${data.title}`,
      `${profile?.name} propoe reuniao em ${formatDate(data.proposed_date)}${data.proposed_time ? ' às ' + data.proposed_time.slice(0,5) : ''}. Confirme sua presença.`,
      'meeting',
      newProp?.id,
      profile?.id
    );

    AuditLog.log('meeting_proposed', 'meeting', newProp?.id, profile?.name,
      `Reuniao proposta: "${data.title}" em ${formatDate(data.proposed_date)}`);

    toast('Proposta enviada! Todos foram notificados.', 'success');
    closeModal();
    await loadProposals();
  }

  // ─── Responder proposta ────────────────────────────────────
  function openResponse(proposalId) {
    const proposal = proposals.find(p => p.id === proposalId);
    const myResp   = myResponses[proposalId];

    openModal('Responder Reuniao', `
      <form id="response-form" onsubmit="MeetingsModule.saveResponse(event,'${proposalId}')">
        <p style="margin-bottom:1rem;color:var(--text-secondary)">
          <strong style="color:var(--text-primary)">${escapeHtml(proposal?.title||'')}</strong><br>
          Data proposta: ${formatDate(proposal?.proposed_date)}
          ${proposal?.proposed_time ? ' às ' + proposal.proposed_time.slice(0,5) : ''}
        </p>
        <div class="form-grid">
          <div class="form-group span-2">
            <label>Sua resposta *</label>
            <select name="response" class="input" required onchange="MeetingsModule.onResponseChange(this)">
              <option value="">Selecione...</option>
              <option value="confirmed" ${myResp?.response==='confirmed'?'selected':''}>✓ Confirmo presença</option>
              <option value="rejected"  ${myResp?.response==='rejected' ?'selected':''}>✗ Nao posso neste dia</option>
            </select>
          </div>
          <div class="form-group span-2" id="alt-date-group" style="display:${myResp?.response==='rejected'?'block':'none'}">
            <label>Sugira outra data (opcional)</label>
            <input type="date" name="alternative_date" class="input"
              value="${myResp?.alternative_date || ''}">
          </div>
          <div class="form-group span-2" id="alt-msg-group" style="display:${myResp?.response==='rejected'?'block':'none'}">
            <label>Mensagem (opcional)</label>
            <input type="text" name="message" class="input"
              value="${escapeHtml(myResp?.message||'')}"
              placeholder="Por que nao pode? Observacoes...">
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">Salvar Resposta</button>
        </div>
      </form>
    `);
  }

  function onResponseChange(select) {
    const show = select.value === 'rejected';
    const altDate = document.getElementById('alt-date-group');
    const altMsg  = document.getElementById('alt-msg-group');
    if (altDate) altDate.style.display = show ? 'block' : 'none';
    if (altMsg)  altMsg.style.display  = show ? 'block' : 'none';
  }

  async function saveResponse(event, proposalId) {
    event.preventDefault();
    const fd      = new FormData(event.target);
    const data    = Object.fromEntries(fd.entries());
    const profile = Auth.getProfile();

    const existing = myResponses[proposalId];

    const payload = {
      proposal_id:      proposalId,
      user_id:          profile?.id,
      user_name:        profile?.name,
      response:         data.response,
      alternative_date: data.response === 'rejected' && data.alternative_date ? data.alternative_date : null,
      message:          data.message || null,
    };

    let error;
    if (existing) {
      ({ error } = await db.from('meeting_responses').update(payload).eq('id', existing.id));
    } else {
      ({ error } = await db.from('meeting_responses').insert([payload]));
    }

    if (error) return toast('Erro ao salvar resposta: ' + error.message, 'error');

    // Notificar o propositor
    const proposal = proposals.find(p => p.id === proposalId);
    if (proposal?.created_by && proposal.created_by !== profile?.id) {
      await NotificationsHelper.notify(
        proposal.created_by,
        `${profile?.name} respondeu sua reuniao`,
        `${profile?.name} ${data.response === 'confirmed' ? 'confirmou presença' : 'nao pode comparecer'} em "${proposal.title}"`,
        'meeting',
        proposalId
      );
    }

    toast('Resposta salva.', 'success');
    closeModal();
    await loadProposals();
  }

  async function confirmMeeting(proposalId) {
    const confirmed = await confirmDialog('Confirmar esta data? Todos serao notificados.');
    if (!confirmed) return;

    const { error } = await db.from('meeting_proposals').update({ status: 'confirmed' }).eq('id', proposalId);
    if (error) return toast('Erro.', 'error');

    const proposal = proposals.find(p => p.id === proposalId);
    await NotificationsHelper.notifyAll(
      `Reuniao confirmada: ${proposal?.title}`,
      `A reuniao ficou confirmada para ${formatDate(proposal?.proposed_date)}${proposal?.proposed_time ? ' às ' + proposal.proposed_time.slice(0,5) : ''}.`,
      'meeting',
      proposalId
    );

    toast('Reuniao confirmada! Todos foram notificados.', 'success');
    await loadProposals();
  }

  async function cancelMeeting(proposalId) {
    const confirmed = await confirmDialog('Cancelar esta reuniao?');
    if (!confirmed) return;

    const { error } = await db.from('meeting_proposals').update({ status: 'cancelled' }).eq('id', proposalId);
    if (error) return toast('Erro.', 'error');
    toast('Reuniao cancelada.', 'success');
    await loadProposals();
  }

  return {
    render, openProposalForm, saveProposal,
    openResponse, onResponseChange, saveResponse,
    confirmMeeting, cancelMeeting,
  };
})();
