const RoomsModule = (() => {

  const ROOM_ORDER = ['Marcos Caruso','Lucia Capuani','Martins Pena','Stanislavski','Sala de Video','Saguao'];
  const ROOM_SIZE  = { large: 'Grande', medium: 'Media', small: 'Pequena' };
  const SIZE_ORDER = { large: 1, medium: 2, small: 3 };

  let allRooms    = [];
  let allClasses  = [];
  let bookings    = [];
  let changeReqs  = [];
  let activeTab   = 'map';
  let weekOffset  = 0; // semanas em relação à atual

  // ─── Render principal ──────────────────────────────────────
  async function render() {
    document.getElementById('view-content').innerHTML =
      `<div class="loading-state">Carregando salas...</div>`;
    await loadData();
  }

  async function loadData() {
    try {
      const [roomsRes, classesRes, bookingsRes, changeRes] = await Promise.all([
        db.from('rooms').select('*').order('sort_order'),
        db.from('classes').select('id, room_id, room_name, teacher_name, teacher_id, courses(name, level, type)'),
        db.from('room_bookings').select('*').order('booking_date').order('start_time'),
        db.from('room_change_requests').select('*').order('created_at', { ascending: false }),
      ]);

      allRooms   = roomsRes.data  || [];
      allClasses = classesRes.data || [];
      bookings   = bookingsRes.data || [];
      changeReqs = changeRes.data  || [];

      renderView();
    } catch (err) {
      document.getElementById('view-content').innerHTML =
        `<div class="error-state">Erro ao carregar: ${escapeHtml(err.message)}<br>
         Execute sql/fix_v6.sql no Supabase.</div>`;
    }
  }

  function renderView() {
    const isAdmin = Auth.isAdmin();
    const el = document.getElementById('view-content');

    el.innerHTML = `
      <div class="view-header">
        <h1 class="view-title">Salas</h1>
        <div class="view-actions">
          ${isAdmin ? `<button class="btn btn-secondary" onclick="RoomsModule.openChangeReqsAdmin()">
            Pedidos de Troca (${changeReqs.filter(r=>r.status==='pending').length})
          </button>` : ''}
        </div>
      </div>

      <div class="tab-bar">
        <button class="tab-btn ${activeTab==='map' ? 'active':''}" onclick="RoomsModule.switchTab('map')">
          Mapa de Salas
        </button>
        <button class="tab-btn ${activeTab==='caruso' ? 'active':''}" onclick="RoomsModule.switchTab('caruso')">
          Cronograma — Marcos Caruso
        </button>
        ${isAdmin ? `<button class="tab-btn ${activeTab==='requests' ? 'active':''}" onclick="RoomsModule.switchTab('requests')">
          Pedidos de Troca
        </button>` : ''}
      </div>

      <div id="rooms-content"></div>
    `;

    renderTab();
  }

  function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    renderTab();
  }

  function renderTab() {
    const el = document.getElementById('rooms-content');
    if (!el) return;
    if (activeTab === 'map')      renderMap(el);
    else if (activeTab === 'caruso')  renderCaruso(el);
    else if (activeTab === 'requests') renderChangeRequests(el);
  }

  // ─── Mapa de Salas ─────────────────────────────────────────
  function renderMap(container) {
    const profile   = Auth.getProfile();
    const isAdmin   = Auth.isAdmin();
    const myRoomIds = allClasses
      .filter(c => c.teacher_id === profile?.id)
      .map(c => c.room_id)
      .filter(Boolean);

    const rooms = allRooms.length
      ? [...allRooms].sort((a,b) => (SIZE_ORDER[a.size]||9) - (SIZE_ORDER[b.size]||9) || a.sort_order - b.sort_order)
      : ROOM_ORDER.map(name => ({ name, size: 'medium' }));

    container.innerHTML = `
      <div class="room-map-grid">
        ${rooms.map(room => {
          const classes = allClasses.filter(c => c.room_id === room.id);
          const isMyRoom = myRoomIds.includes(room.id);

          return `
            <div class="room-card ${isMyRoom ? 'room-card-mine' : ''} room-size-${room.size}">
              <div class="room-card-header">
                <div>
                  <div class="room-card-name">${escapeHtml(room.name)}</div>
                  <div class="room-card-size">${ROOM_SIZE[room.size] || room.size}${room.capacity ? ` · ${room.capacity} pessoas` : ''}</div>
                </div>
                ${isMyRoom ? `<span class="badge badge-success" style="font-size:10px">Minha Sala</span>` : ''}
              </div>

              <div class="room-card-classes">
                ${classes.length
                  ? classes.map(c => `
                      <div class="room-class-item">
                        <div class="room-class-name">${escapeHtml(c.courses?.name || '—')} ${c.courses?.level ? `Nível ${c.courses.level}` : ''}</div>
                        <div class="room-class-teacher text-secondary">${escapeHtml(c.teacher_name || '—')}</div>
                      </div>`).join('')
                  : `<div class="text-secondary" style="font-size:12px;padding:4px 0">Sem turmas atribuidas</div>`
                }
              </div>

              <div class="room-card-footer">
                ${isAdmin
                  ? `<button class="btn btn-secondary" style="font-size:11px;padding:4px 10px"
                       onclick="RoomsModule.openAssignRoom('${room.id}','${escapeHtml(room.name)}')">
                       Atribuir Turma
                     </button>`
                  : !isMyRoom
                    ? `<button class="btn btn-secondary" style="font-size:11px;padding:4px 10px"
                         onclick="RoomsModule.openChangeRequest('${room.id}','${escapeHtml(room.name)}')">
                         Solicitar Troca
                       </button>`
                    : ''
                }
              </div>
            </div>`;
        }).join('')}
      </div>
    `;
  }

  // ─── Cronograma Marcos Caruso ──────────────────────────────
  function renderCaruso(container) {
    const isAdmin = Auth.isAdmin();
    const profile = Auth.getProfile();

    // semana atual + offset
    const today = new Date();
    const mon   = new Date(today);
    mon.setDate(today.getDate() - ((today.getDay() + 6) % 7) + weekOffset * 7);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      days.push(d);
    }

    const weekStr = `${days[0].toLocaleDateString('pt-BR', {day:'numeric',month:'short'})} — ${days[6].toLocaleDateString('pt-BR', {day:'numeric',month:'short',year:'numeric'})}`;

    // filtrar reservas da semana para Marcos Caruso
    const carusoRoom = allRooms.find(r => r.name === 'Marcos Caruso');
    const weekBookings = bookings.filter(b => {
      if (carusoRoom && b.room_id !== carusoRoom.id) return false;
      const bd = new Date(b.booking_date + 'T00:00:00');
      return bd >= days[0] && bd <= days[6];
    });

    container.innerHTML = `
      <div class="caruso-header">
        <button class="btn btn-secondary" onclick="RoomsModule.prevWeek()">&#8249;</button>
        <span style="font-weight:600">${weekStr}</span>
        <button class="btn btn-secondary" onclick="RoomsModule.nextWeek()">&#8250;</button>
        <button class="btn btn-primary" style="margin-left:auto"
          onclick="RoomsModule.openBookingForm()">
          + Reservar
        </button>
      </div>

      <div class="caruso-week">
        ${days.map(day => {
          const iso = day.toISOString().split('T')[0];
          const isToday = iso === today.toISOString().split('T')[0];
          const dayBookings = weekBookings.filter(b => b.booking_date === iso)
            .sort((a,b) => a.start_time.localeCompare(b.start_time));

          return `
            <div class="caruso-day ${isToday ? 'caruso-day-today' : ''}">
              <div class="caruso-day-header">
                <div class="caruso-day-name">${day.toLocaleDateString('pt-BR', {weekday:'short'})}</div>
                <div class="caruso-day-date">${day.getDate()}</div>
              </div>
              <div class="caruso-day-slots">
                ${dayBookings.length
                  ? dayBookings.map(b => {
                      const isOwn = b.teacher_id === profile?.id;
                      const canCancel = isOwn || isAdmin;
                      return `
                        <div class="caruso-booking ${isOwn ? 'caruso-booking-own' : ''}">
                          <div class="caruso-booking-time">${b.start_time.slice(0,5)} — ${b.end_time.slice(0,5)}</div>
                          <div class="caruso-booking-teacher">${escapeHtml(b.teacher_name || '—')}</div>
                          ${b.class_name ? `<div class="caruso-booking-class">${escapeHtml(b.class_name)}</div>` : ''}
                          ${b.piece ? `<div class="caruso-booking-piece text-secondary">${escapeHtml(b.piece)}</div>` : ''}
                          ${canCancel
                            ? `<button class="caruso-cancel-btn"
                                 onclick="RoomsModule.cancelBooking('${b.id}')">
                                 Cancelar
                               </button>`
                            : ''}
                        </div>`;
                    }).join('')
                  : `<div class="caruso-empty">Livre</div>`
                }
              </div>
            </div>`;
        }).join('')}
      </div>
    `;
  }

  function prevWeek() { weekOffset--; renderTab(); }
  function nextWeek() { weekOffset++; renderTab(); }

  // ─── Pedidos de Troca ──────────────────────────────────────
  function renderChangeRequests(container) {
    const isAdmin = Auth.isAdmin();
    const profile = Auth.getProfile();

    const visible = isAdmin
      ? changeReqs
      : changeReqs.filter(r => r.teacher_id === profile?.id);

    container.innerHTML = visible.length
      ? `<div class="table-wrapper"><table class="data-table">
          <thead><tr>
            <th>Professor</th><th>Turma</th><th>Sala Atual</th>
            <th>Sala Solicitada</th><th>Motivo</th><th>Status</th>
            ${isAdmin ? '<th>Acoes</th>' : ''}
          </tr></thead>
          <tbody>
            ${visible.map(r => `<tr>
              <td>${escapeHtml(r.teacher_name||'—')}</td>
              <td>${escapeHtml(r.class_name||'—')}</td>
              <td>${escapeHtml(r.current_room||'—')}</td>
              <td class="text-accent">${escapeHtml(r.requested_room||'—')}</td>
              <td class="text-secondary">${escapeHtml(r.reason||'—')}</td>
              <td><span class="badge badge-${r.status==='approved'?'success':r.status==='rejected'?'danger':'warning'}">
                ${r.status==='approved'?'Aprovado':r.status==='rejected'?'Recusado':'Pendente'}
              </span></td>
              ${isAdmin ? `<td class="actions-cell">
                ${r.status==='pending' ? `
                  <button class="btn-icon" onclick="RoomsModule.resolveChangeReq('${r.id}','approved')">Aprovar</button>
                  <button class="btn-icon btn-icon-danger" onclick="RoomsModule.resolveChangeReq('${r.id}','rejected')">Recusar</button>
                ` : '—'}
              </td>` : ''}
            </tr>`).join('')}
          </tbody>
        </table></div>`
      : `<div class="empty-state">Nenhuma solicitacao de troca.</div>`;
  }

  // ─── Formulário de Reserva ────────────────────────────────
  async function openBookingForm() {
    const profile  = Auth.getProfile();
    const myClass  = allClasses.find(c => c.teacher_id === profile?.id);

    openModal('Reservar Marcos Caruso', `
      <form id="booking-form" onsubmit="RoomsModule.saveBooking(event)">
        <div class="form-grid">
          <div class="form-group span-2">
            <label>Responsavel *</label>
            <input type="text" name="teacher_name" class="input" required
              value="${escapeHtml(profile?.name || '')}">
          </div>
          <div class="form-group span-2">
            <label>Turma</label>
            <input type="text" name="class_name" class="input"
              value="${escapeHtml(myClass?.courses?.name || '')}"
              placeholder="Nome da turma ou atividade">
          </div>
          <div class="form-group span-2">
            <label>Peca / Producao</label>
            <input type="text" name="piece" class="input"
              placeholder="Nome da peca (se aplicavel)">
          </div>
          <div class="form-group span-2">
            <label>Motivo *</label>
            <input type="text" name="reason" class="input" required
              placeholder="Ex: Ensaio geral, Apresentacao, Aula especial">
          </div>
          <div class="form-group">
            <label>Data *</label>
            <input type="date" name="booking_date" class="input" required
              value="${new Date().toISOString().split('T')[0]}">
          </div>
          <div class="form-group">
            <label>Responsavel Tecnico</label>
            <input type="text" name="technical_responsible" class="input"
              placeholder="Nome do responsavel tecnico">
          </div>
          <div class="form-group">
            <label>Entrada *</label>
            <input type="time" name="start_time" class="input" required>
          </div>
          <div class="form-group">
            <label>Saida *</label>
            <input type="time" name="end_time" class="input" required>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">Confirmar Reserva</button>
        </div>
      </form>
    `);
  }

  async function saveBooking(event) {
    event.preventDefault();
    const fd      = new FormData(event.target);
    const data    = Object.fromEntries(fd.entries());
    const profile = Auth.getProfile();

    const carusoRoom = allRooms.find(r => r.name === 'Marcos Caruso');

    // Verificar conflito de horário
    const dayBookings = bookings.filter(b =>
      b.booking_date === data.booking_date &&
      (!carusoRoom || b.room_id === carusoRoom.id) &&
      b.status !== 'cancelled'
    );
    const conflict = dayBookings.find(b =>
      data.start_time < b.end_time && data.end_time > b.start_time
    );
    if (conflict) {
      toast(`Conflito de horario com ${conflict.teacher_name} (${conflict.start_time.slice(0,5)}—${conflict.end_time.slice(0,5)}).`, 'error');
      return;
    }

    const { error } = await db.from('room_bookings').insert([{
      room_id:               carusoRoom?.id || null,
      room_name:             'Marcos Caruso',
      teacher_id:            profile?.id,
      teacher_name:          data.teacher_name,
      class_name:            data.class_name   || null,
      piece:                 data.piece         || null,
      reason:                data.reason,
      booking_date:          data.booking_date,
      start_time:            data.start_time,
      end_time:              data.end_time,
      technical_responsible: data.technical_responsible || null,
      status:                'approved',
    }]);

    if (error) return toast('Erro ao reservar: ' + error.message, 'error');

    // Notificar admins
    await NotificationsHelper.notifyAdmins(
      'Nova reserva — Marcos Caruso',
      `${data.teacher_name} reservou das ${data.start_time.slice(0,5)} às ${data.end_time.slice(0,5)} em ${formatDate(data.booking_date)}`,
      'room'
    );

    AuditLog.log('room_booked', 'room', carusoRoom?.id, 'Marcos Caruso',
      `${data.teacher_name} reservou Marcos Caruso em ${formatDate(data.booking_date)} das ${data.start_time.slice(0,5)} às ${data.end_time.slice(0,5)}`);

    toast('Reserva confirmada!', 'success');
    closeModal();
    await loadData();
  }

  async function cancelBooking(id) {
    const confirmed = await confirmDialog('Cancelar esta reserva?');
    if (!confirmed) return;
    const { error } = await db.from('room_bookings').update({ status: 'cancelled' }).eq('id', id);
    if (error) return toast('Erro ao cancelar.', 'error');
    toast('Reserva cancelada.', 'success');
    await loadData();
  }

  // ─── Solicitação de Troca ────────────────────────────────
  async function openChangeRequest(fromRoomId, fromRoomName) {
    const profile = Auth.getProfile();
    const myClass = allClasses.find(c => c.teacher_id === profile?.id);
    const otherRooms = allRooms.filter(r => r.id !== fromRoomId);

    openModal('Solicitar Troca de Sala', `
      <form id="change-req-form" onsubmit="RoomsModule.saveChangeRequest(event)">
        <input type="hidden" name="current_room" value="${escapeHtml(fromRoomName)}">
        <div class="form-grid">
          <div class="form-group span-2">
            <label>Sala Atual</label>
            <input type="text" class="input" value="${escapeHtml(fromRoomName)}" readonly>
          </div>
          <div class="form-group span-2">
            <label>Turma</label>
            <input type="text" class="input" value="${escapeHtml(myClass?.courses?.name || '')}" readonly>
          </div>
          <div class="form-group span-2">
            <label>Sala Desejada *</label>
            <select name="requested_room" class="input" required>
              <option value="">Selecione...</option>
              ${otherRooms.map(r => `<option value="${escapeHtml(r.name)}">${escapeHtml(r.name)} (${ROOM_SIZE[r.size]||r.size})</option>`).join('')}
            </select>
          </div>
          <div class="form-group span-2">
            <label>Motivo *</label>
            <textarea name="reason" class="input textarea" rows="3" required
              placeholder="Por que voce precisa trocar de sala?"></textarea>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">Enviar Solicitacao</button>
        </div>
      </form>
    `);
  }

  async function saveChangeRequest(event) {
    event.preventDefault();
    const fd      = new FormData(event.target);
    const data    = Object.fromEntries(fd.entries());
    const profile = Auth.getProfile();
    const myClass = allClasses.find(c => c.teacher_id === profile?.id);

    const { error } = await db.from('room_change_requests').insert([{
      teacher_id:     profile?.id,
      teacher_name:   profile?.name,
      class_id:       myClass?.id || null,
      class_name:     myClass?.courses?.name || null,
      current_room:   data.current_room,
      requested_room: data.requested_room,
      reason:         data.reason,
      status:         'pending',
    }]);

    if (error) return toast('Erro ao enviar: ' + error.message, 'error');

    await NotificationsHelper.notifyAdmins(
      'Pedido de troca de sala',
      `${profile?.name} quer trocar de ${data.current_room} para ${data.requested_room}`,
      'room_change'
    );

    toast('Solicitacao enviada! O admin sera notificado.', 'success');
    closeModal();
    await loadData();
  }

  async function resolveChangeReq(id, status) {
    const req = changeReqs.find(r => r.id === id);
    const { error } = await db.from('room_change_requests').update({ status }).eq('id', id);
    if (error) return toast('Erro.', 'error');

    if (req?.teacher_id) {
      await NotificationsHelper.notify(
        req.teacher_id,
        status === 'approved' ? 'Troca de sala aprovada!' : 'Troca de sala recusada',
        status === 'approved'
          ? `Sua solicitacao para ${req.requested_room} foi aprovada.`
          : `Sua solicitacao para ${req.requested_room} foi recusada.`,
        'room_change'
      );
    }

    toast(status === 'approved' ? 'Aprovado.' : 'Recusado.', 'success');
    await loadData();
  }

  // ─── Atribuir turma a sala (admin) ────────────────────────
  async function openAssignRoom(roomId, roomName) {
    const unassigned = allClasses.filter(c => !c.room_id || c.room_id !== roomId);
    const assigned   = allClasses.filter(c => c.room_id === roomId);

    openModal(`Atribuir Turmas — ${roomName}`, `
      <div style="margin-bottom:1rem">
        <p class="text-secondary" style="font-size:13px;margin-bottom:0.75rem">
          Turmas ja nesta sala:
        </p>
        ${assigned.length
          ? assigned.map(c => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
                <span>${escapeHtml(c.courses?.name||'—')} — ${escapeHtml(c.teacher_name||'—')}</span>
                <button class="btn-icon btn-icon-danger"
                  onclick="RoomsModule.unassignRoom('${c.id}')">Remover</button>
              </div>`).join('')
          : `<p class="text-secondary" style="font-size:12px">Nenhuma turma.</p>`
        }
      </div>
      <div>
        <p class="text-secondary" style="font-size:13px;margin-bottom:0.75rem">Adicionar turma:</p>
        <select id="assign-class-select" class="input">
          <option value="">Selecione uma turma...</option>
          ${unassigned.map(c => `
            <option value="${c.id}">
              ${escapeHtml(c.courses?.name||'Sem nome')} — ${escapeHtml(c.teacher_name||'—')}
            </option>`).join('')}
        </select>
        <button class="btn btn-primary" style="margin-top:0.75rem;width:100%"
          onclick="RoomsModule.assignRoom('${roomId}','${escapeHtml(roomName)}')">
          Atribuir
        </button>
      </div>
    `);
  }

  async function assignRoom(roomId, roomName) {
    const classId = document.getElementById('assign-class-select')?.value;
    if (!classId) return toast('Selecione uma turma.', 'warning');

    const { error } = await db.from('classes').update({ room_id: roomId, room_name: roomName }).eq('id', classId);
    if (error) return toast('Erro: ' + error.message, 'error');

    const cls = allClasses.find(c => c.id === classId);
    if (cls?.teacher_id) {
      await NotificationsHelper.notify(
        cls.teacher_id,
        `Sala atribuida: ${roomName}`,
        `Sua turma ${cls.courses?.name||''} foi alocada na sala ${roomName}.`,
        'room'
      );
    }

    toast('Sala atribuida com sucesso.', 'success');
    closeModal();
    await loadData();
  }

  async function unassignRoom(classId) {
    const { error } = await db.from('classes').update({ room_id: null, room_name: null }).eq('id', classId);
    if (error) return toast('Erro.', 'error');
    toast('Turma removida da sala.', 'success');
    closeModal();
    await loadData();
  }

  async function openChangeReqsAdmin() {
    activeTab = 'requests';
    renderView();
  }

  return {
    render, switchTab, prevWeek, nextWeek,
    openBookingForm, saveBooking, cancelBooking,
    openChangeRequest, saveChangeRequest, resolveChangeReq,
    openAssignRoom, assignRoom, unassignRoom,
    openChangeReqsAdmin,
  };
})();
