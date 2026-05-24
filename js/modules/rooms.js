const RoomsModule = (() => {

  const ROOM_ORDER = ['Marcos Caruso','Lucia Capuani','Martins Pena','Stanislavski','Sala de Video','Saguao'];
  const ROOM_SIZE  = { large: 'Grande', medium: 'Media', small: 'Pequena' };
  const SIZE_ORDER = { large: 1, medium: 2, small: 3 };

  let allRooms      = [];
  let allClasses    = [];   // turmas ativas
  let roomSchedules = [];   // agendamentos semanais de sala
  let bookings      = [];
  let changeReqs    = [];
  let activeTab     = 'map';
  let weekOffset    = 0;    // semanas (cronograma Caruso)
  let mapWeekOffset = 0;    // semanas (mapa de salas)

  // ── Helpers de semana ─────────────────────────────────────────
  function getWeekMonday(offset = 0) {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
    d.setHours(0, 0, 0, 0);
    return d.toISOString().split('T')[0]; // YYYY-MM-DD (segunda-feira)
  }

  function formatWeekRange(offset = 0) {
    const mon = new Date();
    mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7) + offset * 7);
    const fri = new Date(mon); fri.setDate(mon.getDate() + 4);
    const opts = { day: 'numeric', month: 'short' };
    return `${mon.toLocaleDateString('pt-BR', opts)} — ${fri.toLocaleDateString('pt-BR', { ...opts, year: 'numeric' })}`;
  }

  // ─── Render principal ──────────────────────────────────────────
  async function render() {
    document.getElementById('view-content').innerHTML =
      `<div class="loading-state">Carregando salas...</div>`;
    await loadData();
  }

  async function loadData() {
    try {
      const [roomsRes, classesRes, schedulesRes, bookingsRes, changeRes] = await Promise.all([
        db.from('rooms').select('*').order('sort_order'),

        // FIX: usar profiles(name) em vez de teacher_name (coluna inexistente em classes)
        db.from('classes')
          .select('id, room_id, room_name, teacher_id, status, is_sandbox, courses(name, level, type), profiles(name)')
          .eq('status', 'active'),

        // Agendamentos semanais de sala
        db.from('room_schedules')
          .select('id, room_id, class_id, week_start, classes(id, teacher_id, day_of_week, schedule, is_sandbox, courses(name, level, type), profiles(name))'),

        db.from('room_bookings').select('*').order('booking_date').order('start_time'),
        db.from('room_change_requests').select('*').order('created_at', { ascending: false }),
      ]);

      allRooms      = roomsRes.data      || [];
      allClasses    = classesRes.data    || [];
      roomSchedules = schedulesRes.data  || [];
      bookings      = bookingsRes.data   || [];
      changeReqs    = changeRes.data     || [];

      renderView();
    } catch (err) {
      document.getElementById('view-content').innerHTML =
        `<div class="error-state">Erro ao carregar: ${escapeHtml(err.message)}<br>
         Execute sql/fix_v6.sql e sql/fix_v10.sql no Supabase.</div>`;
    }
  }

  function renderView() {
    const isAdmin   = Auth.isAdmin();
    const isTeacher = Auth.isTeacher();
    const el        = document.getElementById('view-content');
    const pending   = changeReqs.filter(r => r.status === 'pending').length;

    el.innerHTML = `
      <div class="view-header">
        <h1 class="view-title">Salas</h1>
        <div class="view-actions"></div>
      </div>

      <div class="tab-bar">
        <button class="tab-btn ${activeTab === 'map'      ? 'active' : ''}" onclick="RoomsModule.switchTab('map')">
          Mapa de Salas
        </button>
        <button class="tab-btn ${activeTab === 'caruso'   ? 'active' : ''}" onclick="RoomsModule.switchTab('caruso')">
          Cronograma — Marcos Caruso
        </button>
        <button class="tab-btn ${activeTab === 'requests' ? 'active' : ''}" onclick="RoomsModule.switchTab('requests')">
          Pedidos de Troca${pending > 0 ? ` <span class="badge badge-warning" style="font-size:10px;padding:1px 6px;margin-left:4px">${pending}</span>` : ''}
        </button>
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
    if (activeTab === 'map')          renderMap(el);
    else if (activeTab === 'caruso')  renderCaruso(el);
    else if (activeTab === 'requests') renderChangeRequests(el);
  }

  // ─── Mapa de Salas (semanal) ───────────────────────────────────
  function renderMap(container) {
    const isAdmin    = Auth.isAdmin();
    const profile    = Auth.getProfile();
    const weekKey    = getWeekMonday(mapWeekOffset);
    const weekLabel  = formatWeekRange(mapWeekOffset);

    // Agendamentos da semana selecionada
    const weekSched  = roomSchedules.filter(s => s.week_start === weekKey);

    // Sala atual do professor logado nesta semana (para o botão Solicitar Troca)
    const myScheduleThisWeek = weekSched.find(s => s.classes?.teacher_id === profile?.id);
    const myCurrentRoomId    = myScheduleThisWeek?.room_id || null;

    const rooms = allRooms.length
      ? [...allRooms].sort((a, b) => (SIZE_ORDER[a.size] || 9) - (SIZE_ORDER[b.size] || 9) || a.sort_order - b.sort_order)
      : ROOM_ORDER.map(name => ({ name, size: 'medium' }));

    container.innerHTML = `
      <div class="caruso-header" style="margin-bottom:1rem;">
        <button class="btn btn-secondary" onclick="RoomsModule.prevMapWeek()">&#8249;</button>
        <span style="font-weight:600">${weekLabel}</span>
        <button class="btn btn-secondary" onclick="RoomsModule.nextMapWeek()">&#8250;</button>
        ${mapWeekOffset !== 0 ? `<button class="btn btn-secondary" style="margin-left:8px;font-size:11px"
          onclick="RoomsModule.resetMapWeek()">Semana atual</button>` : ''}
        <button class="btn btn-secondary" style="margin-left:auto;font-size:12px"
          onclick="RoomsModule.exportMapPDF()">&#8595; Exportar Mapa</button>
      </div>

      <div class="room-map-grid">
        ${rooms.map(room => {
          // Turmas alocadas nesta sala nesta semana
          const schedInRoom = weekSched.filter(s => s.room_id === room.id);
          const isMyRoom    = schedInRoom.some(s => s.classes?.teacher_id === profile?.id);

          return `
            <div class="room-card ${isMyRoom ? 'room-card-mine' : ''} room-size-${room.size || 'medium'}">
              <div class="room-card-header">
                <div>
                  <div class="room-card-name">${escapeHtml(room.name)}</div>
                  <div class="room-card-size">${ROOM_SIZE[room.size] || room.size || ''}${room.capacity ? ` · ${room.capacity} pessoas` : ''}</div>
                </div>
                ${isMyRoom ? `<span class="badge badge-success" style="font-size:10px">Minha Sala</span>` : ''}
              </div>

              <div class="room-card-classes">
                ${schedInRoom.length
                  ? schedInRoom.map(s => {
                      const cls = s.classes;
                      const isSandbox = cls?.is_sandbox;
                      return `
                        <div class="room-class-item">
                          <div class="room-class-name">
                            ${escapeHtml(cls?.courses?.name || '—')}
                            ${cls?.courses?.level ? ` Nível ${cls.courses.level}` : ''}
                            ${isSandbox ? '<span class="class-card-sandbox">TESTE</span>' : ''}
                          </div>
                          <div class="room-class-teacher text-secondary">
                            ${escapeHtml(cls?.profiles?.name || '—')}
                            · ${DAYS_PT[cls?.day_of_week] || ''} ${cls?.schedule?.substring(0,5) || ''}
                          </div>
                          ${isAdmin ? `<button class="btn-icon btn-icon-danger" style="margin-top:4px;font-size:11px"
                            onclick="RoomsModule.unassignSchedule('${s.id}')">Remover</button>` : ''}
                        </div>`;
                    }).join('')
                  : `<div class="text-secondary" style="font-size:12px;padding:4px 0">Livre esta semana</div>`
                }
              </div>

              <div class="room-card-footer">
                ${isAdmin
                  ? `<button class="btn btn-secondary" style="font-size:11px;padding:4px 10px"
                       onclick="RoomsModule.openAssignRoom('${room.id}','${escapeHtml(room.name)}')">
                       + Atribuir Turma
                     </button>`
                  : // Professor: mostra "Solicitar Troca" apenas se ele TEM sala esta semana
                    // e esta sala é diferente da dele (= sala desejada)
                    (myCurrentRoomId && !isMyRoom)
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

  function prevMapWeek() { mapWeekOffset--; renderTab(); }
  function nextMapWeek() { mapWeekOffset++; renderTab(); }
  function resetMapWeek() { mapWeekOffset = 0; renderTab(); }

  // ─── Cronograma Marcos Caruso ──────────────────────────────────
  function renderCaruso(container) {
    const profile = Auth.getProfile();
    const isAdmin = Auth.isAdmin();

    const today = new Date();
    const mon   = new Date(today);
    mon.setDate(today.getDate() - ((today.getDay() + 6) % 7) + weekOffset * 7);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      days.push(d);
    }

    const weekStr = `${days[0].toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} — ${days[6].toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}`;

    const carusoRoom  = allRooms.find(r => r.name === 'Marcos Caruso');
    const weekBookings = bookings.filter(b => {
      // Filtra pela room_name (sempre gravada) OU pelo room_id — evita perder
      // reservas salvas quando allRooms ainda não estava carregado (room_id null)
      const isCaruso = b.room_name === 'Marcos Caruso'
        || (carusoRoom && b.room_id === carusoRoom.id);
      if (!isCaruso) return false;
      if (b.status === 'cancelled') return false;
      const bd = new Date(b.booking_date + 'T00:00:00');
      return bd >= days[0] && bd <= days[6];
    });

    container.innerHTML = `
      <div class="caruso-header">
        <button class="btn btn-secondary" onclick="RoomsModule.prevWeek()">&#8249;</button>
        <span style="font-weight:600">${weekStr}</span>
        <button class="btn btn-secondary" onclick="RoomsModule.nextWeek()">&#8250;</button>
        <button class="btn btn-secondary" style="margin-left:auto;font-size:12px"
          onclick="RoomsModule.exportCarusoPDF()">&#8595; PDF</button>
        <button class="btn btn-primary" style="margin-left:8px" onclick="RoomsModule.openBookingForm()">
          + Reservar
        </button>
      </div>

      <div class="caruso-week">
        ${days.map(day => {
          const iso       = day.toISOString().split('T')[0];
          const isToday   = iso === today.toISOString().split('T')[0];
          const dayBooks  = weekBookings.filter(b => b.booking_date === iso)
            .sort((a, b) => a.start_time.localeCompare(b.start_time));

          return `
            <div class="caruso-day ${isToday ? 'caruso-day-today' : ''}">
              <div class="caruso-day-header">
                <div class="caruso-day-name">${day.toLocaleDateString('pt-BR', { weekday: 'short' })}</div>
                <div class="caruso-day-date">${day.getDate()}</div>
              </div>
              <div class="caruso-day-slots">
                ${dayBooks.length
                  ? dayBooks.map(b => {
                      const isOwn     = b.teacher_id === profile?.id;
                      const canCancel = isOwn || isAdmin;
                      return `
                        <div class="caruso-booking ${isOwn ? 'caruso-booking-own' : ''}">
                          <div class="caruso-booking-time">${b.start_time.slice(0,5)} — ${b.end_time.slice(0,5)}</div>
                          <div class="caruso-booking-teacher">${escapeHtml(b.teacher_name || '—')}</div>
                          ${b.class_name ? `<div class="caruso-booking-class">${escapeHtml(b.class_name)}</div>` : ''}
                          ${b.piece ? `<div class="caruso-booking-piece text-secondary">${escapeHtml(b.piece)}</div>` : ''}
                          ${canCancel
                            ? `<button class="caruso-cancel-btn" onclick="RoomsModule.cancelBooking('${b.id}')">Cancelar</button>`
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

  // ─── Pedidos de Troca ─────────────────────────────────────────
  function renderChangeRequests(container) {
    const isAdmin = Auth.isAdmin();
    const profile = Auth.getProfile();

    // Professores veem todos os pedidos para coordenar entre si
    // Admin vê todos e pode aprovar/recusar
    const visible = changeReqs;

    if (!visible.length) {
      container.innerHTML = `<div class="empty-state">Nenhuma solicitacao de troca.</div>`;
      return;
    }

    container.innerHTML = `
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>Professor</th><th>Turma</th><th>Sala Atual</th>
            <th>Sala Solicitada</th><th>Motivo</th><th>Status</th>
            ${isAdmin ? '<th>Acoes</th>' : ''}
          </tr></thead>
          <tbody>
            ${visible.map(r => {
              const isOwn = r.teacher_id === profile?.id;
              return `<tr ${isOwn ? 'style="background:rgba(212,175,55,.06)"' : ''}>
                <td>
                  ${escapeHtml(r.teacher_name || '—')}
                  ${isOwn ? `<span class="badge badge-info" style="font-size:9px;margin-left:4px">meu</span>` : ''}
                </td>
                <td>${escapeHtml(r.class_name || '—')}</td>
                <td>${escapeHtml(r.current_room || '—')}</td>
                <td class="text-accent">${escapeHtml(r.requested_room || '—')}</td>
                <td class="text-secondary">${escapeHtml(r.reason || '—')}</td>
                <td>
                  <span class="badge badge-${r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'warning'}">
                    ${r.status === 'approved' ? 'Aprovado' : r.status === 'rejected' ? 'Recusado' : 'Pendente'}
                  </span>
                </td>
                ${isAdmin ? `<td class="actions-cell">
                  ${r.status === 'pending' ? `
                    <button class="btn-icon" onclick="RoomsModule.resolveChangeReq('${r.id}','approved')">Aprovar</button>
                    <button class="btn-icon btn-icon-danger" onclick="RoomsModule.resolveChangeReq('${r.id}','rejected')">Recusar</button>
                  ` : '—'}
                </td>` : ''}
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // ─── Formulário de Reserva (Marcos Caruso) ────────────────────
  async function openBookingForm() {
    const profile = Auth.getProfile();
    const myClass = allClasses.find(c => c.teacher_id === profile?.id);

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
            <label>Tipo de Reserva *</label>
            <select name="reason" class="input" required>
              <option value="">— Selecione —</option>
              <option value="Ensaio">Ensaio</option>
              <option value="Reposição de Aulas">Reposição de Aulas</option>
              <option value="Reapresentação">Reapresentação</option>
              <option value="Evento">Evento</option>
              <option value="Outro">Outro</option>
            </select>
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

    const dayBookings = bookings.filter(b =>
      b.booking_date === data.booking_date &&
      (!carusoRoom || b.room_id === carusoRoom.id) &&
      b.status !== 'cancelled'
    );
    const conflict = dayBookings.find(b =>
      data.start_time < b.end_time && data.end_time > b.start_time
    );
    if (conflict) {
      toast(`Conflito com ${conflict.teacher_name} (${conflict.start_time.slice(0,5)}—${conflict.end_time.slice(0,5)}).`, 'error');
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
    const { data, error } = await db.from('room_bookings')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select('id');
    if (error) return toast('Erro ao cancelar: ' + error.message, 'error');
    if (!data?.length) {
      toast('Sem permissao para cancelar. Execute fix_v12.sql no Supabase.', 'error');
      return;
    }
    toast('Reserva cancelada.', 'success');
    await loadData();
  }

  // ─── Solicitação de Troca ──────────────────────────────────────
  // toRoomId/toRoomName = sala que o professor CLICOU (= sala desejada)
  async function openChangeRequest(toRoomId, toRoomName) {
    const profile  = Auth.getProfile();
    const weekKey  = getWeekMonday(mapWeekOffset);

    // Sala atual do professor nesta semana
    const mySchedule    = roomSchedules.find(s =>
      s.classes?.teacher_id === profile?.id && s.week_start === weekKey
    );
    const myCurrentRoom = allRooms.find(r => r.id === mySchedule?.room_id);
    const myClass       = allClasses.find(c => c.teacher_id === profile?.id);

    if (!myCurrentRoom) {
      toast('Voce nao tem sala atribuida nesta semana para solicitar troca.', 'warning');
      return;
    }

    openModal('Solicitar Troca de Sala', `
      <form id="change-req-form" onsubmit="RoomsModule.saveChangeRequest(event)">
        <input type="hidden" name="current_room"   value="${escapeHtml(myCurrentRoom.name)}">
        <input type="hidden" name="requested_room" value="${escapeHtml(toRoomName)}">
        <div class="form-grid">
          <div class="form-group span-2">
            <label>Sala Atual (sua sala)</label>
            <input type="text" class="input" value="${escapeHtml(myCurrentRoom.name)}" readonly>
          </div>
          <div class="form-group span-2">
            <label>Sala Desejada</label>
            <input type="text" class="input" value="${escapeHtml(toRoomName)}" readonly>
          </div>
          <div class="form-group span-2">
            <label>Turma</label>
            <input type="text" class="input" value="${escapeHtml(myClass?.courses?.name || '—')}" readonly>
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

  // ─── Atribuir turma a sala para a semana (admin) ───────────────
  async function openAssignRoom(roomId, roomName) {
    const weekKey    = getWeekMonday(mapWeekOffset);
    const weekLabel  = formatWeekRange(mapWeekOffset);

    // Turmas já nesta sala nesta semana
    const alreadyHere = roomSchedules.filter(s => s.room_id === roomId && s.week_start === weekKey);

    // Turmas disponíveis (ativas, não sandbox, não já nesta sala nesta semana)
    const alreadyHereIds = new Set(alreadyHere.map(s => s.class_id));
    const available = allClasses.filter(c => !c.is_sandbox && !alreadyHereIds.has(c.id));

    openModal(`Atribuir Turmas — ${roomName}`, `
      <p class="text-secondary" style="font-size:13px;margin-bottom:1rem;">
        Semana: <strong>${weekLabel}</strong>
      </p>

      <div style="margin-bottom:1.25rem">
        <p class="text-secondary" style="font-size:13px;margin-bottom:0.5rem">
          Turmas ja atribuidas nesta semana:
        </p>
        ${alreadyHere.length
          ? alreadyHere.map(s => {
              const cls = s.classes;
              return `
                <div style="display:flex;justify-content:space-between;align-items:center;
                            padding:7px 0;border-bottom:1px solid var(--border)">
                  <span>
                    ${escapeHtml(cls?.courses?.name || '—')} —
                    ${escapeHtml(cls?.profiles?.name || '—')}
                    <span class="text-secondary" style="font-size:11px">
                      · ${DAYS_PT[cls?.day_of_week] || ''} ${cls?.schedule?.substring(0,5) || ''}
                    </span>
                  </span>
                  <button class="btn-icon btn-icon-danger"
                    onclick="RoomsModule.unassignSchedule('${s.id}')">Remover</button>
                </div>`;
            }).join('')
          : `<p class="text-secondary" style="font-size:12px">Nenhuma turma esta semana.</p>`
        }
      </div>

      <div>
        <p class="text-secondary" style="font-size:13px;margin-bottom:0.5rem">Adicionar turma:</p>
        ${available.length
          ? `<select id="assign-class-select" class="input">
               <option value="">— Selecione uma turma —</option>
               ${available.map(c => `
                 <option value="${c.id}">
                   ${escapeHtml(c.courses?.name || 'Sem nome')} — ${escapeHtml(c.profiles?.name || '—')}
                 </option>`).join('')}
             </select>
             <button class="btn btn-primary" style="margin-top:0.75rem;width:100%"
               onclick="RoomsModule.assignRoom('${roomId}','${escapeHtml(roomName)}')">
               Atribuir para esta semana
             </button>`
          : `<p class="text-secondary" style="font-size:12px">Todas as turmas ativas ja foram atribuidas.</p>`
        }
      </div>
    `);
  }

  async function assignRoom(roomId, roomName) {
    const classId = document.getElementById('assign-class-select')?.value;
    if (!classId) return toast('Selecione uma turma.', 'warning');

    const weekKey    = getWeekMonday(mapWeekOffset);
    const cls        = allClasses.find(c => c.id === classId);
    const teacherId  = cls?.teacher_id;

    // Verificar se o professor desta turma já está em outra sala nesta semana
    if (teacherId) {
      const conflict = roomSchedules.find(s =>
        s.week_start === weekKey &&
        s.room_id !== roomId &&
        s.classes?.teacher_id === teacherId
      );
      if (conflict) {
        const conflictRoomName = allRooms.find(r => r.id === conflict.room_id)?.name || 'outra sala';
        const ok = await confirmDialog(
          `Atencao: ${cls?.profiles?.name || 'Este professor'} ja esta alocado em "${conflictRoomName}" nesta semana.\n\nDeseja atribuir mesmo assim?`
        );
        if (!ok) return;
      }
    }

    const { error } = await db.from('room_schedules').insert([{
      room_id:    roomId,
      class_id:   classId,
      week_start: weekKey,
    }]);

    if (error) {
      if (error.code === '23505') return toast('Esta turma ja esta alocada para outra sala nesta semana.', 'warning');
      return toast('Erro: ' + error.message, 'error');
    }

    if (cls?.teacher_id) {
      await NotificationsHelper.notify(
        cls.teacher_id,
        `Sala atribuida: ${roomName}`,
        `Sua turma ${cls.courses?.name || ''} foi alocada na sala ${roomName} para a semana de ${formatWeekRange(mapWeekOffset)}.`,
        'room'
      );
    }

    toast('Sala atribuida com sucesso.', 'success');
    closeModal();
    await loadData();
  }

  async function unassignSchedule(scheduleId) {
    const confirmed = await confirmDialog('Remover esta turma da sala nesta semana?');
    if (!confirmed) return;
    const { error } = await db.from('room_schedules').delete().eq('id', scheduleId);
    if (error) return toast('Erro ao remover.', 'error');
    toast('Turma removida da sala.', 'success');
    closeModal();
    await loadData();
  }

  // Mantido para compatibilidade (redirect para novo sistema)
  async function unassignRoom(classId) {
    return unassignSchedule(classId);
  }

  async function openChangeReqsAdmin() {
    activeTab = 'requests';
    renderView();
  }

  // ─── Export: Cronograma Marcos Caruso (PDF) ───────────────────────
  function exportCarusoPDF() {
    const carusoRoom = allRooms.find(r => r.name === 'Marcos Caruso');
    const todayStr   = new Date().toISOString().split('T')[0];

    // Reservas futuras (ou de hoje) da Caruso, não canceladas
    const upcoming = bookings
      .filter(b => {
        const isCaruso = b.room_name === 'Marcos Caruso'
          || (carusoRoom && b.room_id === carusoRoom.id);
        if (!isCaruso) return false;
        if (b.status === 'cancelled') return false;
        return b.booking_date >= todayStr;
      })
      .sort((a, b) => a.booking_date.localeCompare(b.booking_date) || a.start_time.localeCompare(b.start_time));

    const TYPE_ORDER  = ['Ensaio','Reposição de Aulas','Reapresentação','Evento','Outro'];
    const TYPE_LABELS = {
      'Ensaio':             'ENSAIOS',
      'Reposição de Aulas': 'REPOSIÇÃO DE AULAS',
      'Reapresentação':     'REAPRESENTAÇÕES',
      'Evento':             'EVENTOS',
      'Outro':              'OUTROS',
    };
    const DIAS_SEMANA = ['DOMINGO','SEGUNDA-FEIRA','TERÇA-FEIRA','QUARTA-FEIRA','QUINTA-FEIRA','SEXTA-FEIRA','SÁBADO'];

    // Agrupar por tipo
    const groups = {};
    for (const b of upcoming) {
      const key = TYPE_ORDER.includes(b.reason) ? b.reason : 'Outro';
      if (!groups[key]) groups[key] = [];
      groups[key].push(b);
    }

    let sectionsHtml = '';
    for (const type of TYPE_ORDER) {
      if (!groups[type]?.length) continue;

      // Sub-agrupamento por data
      const byDate = {};
      for (const b of groups[type]) {
        if (!byDate[b.booking_date]) byDate[b.booking_date] = [];
        byDate[b.booking_date].push(b);
      }

      let datesHtml = '';
      for (const [date, items] of Object.entries(byDate)) {
        const d      = new Date(date + 'T12:00:00');
        const dd     = String(d.getDate()).padStart(2, '0');
        const mm     = String(d.getMonth() + 1).padStart(2, '0');
        const diaNm  = DIAS_SEMANA[d.getDay()];
        datesHtml += `<div class="date-bar">${dd}/${mm} — ${diaNm}</div>`;
        for (const b of items) {
          const sh    = b.start_time.slice(0, 5).replace(':', 'h');
          const eh    = b.end_time.slice(0, 5).replace(':', 'h');
          const piece = b.piece ? ` — ${b.piece}` : '';
          datesHtml += `<div class="booking-row">&#9658; <strong>${b.teacher_name || '—'}</strong>${piece} (Horário: ${sh} às ${eh})</div>`;
        }
      }

      sectionsHtml += `
        <div class="section-block">
          <div class="section-title">${TYPE_LABELS[type]}</div>
          ${datesHtml}
        </div>`;
    }

    if (!sectionsHtml) {
      sectionsHtml = '<p style="text-align:center;padding:2.5rem;color:#777">Nenhuma reserva futura cadastrada.</p>';
    }

    const updatedDate = new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Cronograma — Sala Marcos Caruso</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700;900&display=swap" rel="stylesheet">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Roboto', Arial, sans-serif;
  color: #111;
  padding: 32px 40px;
  font-size: 13px;
  line-height: 1.5;
}

/* ── Cabeçalho ── */
.pdf-header { text-align: center; margin-bottom: 32px; }
.main-title {
  font-family: 'Roboto', sans-serif;
  font-size: 24px;
  font-weight: 900;
  letter-spacing: 4px;
  text-transform: uppercase;
  margin-bottom: 10px;
}
.room-badge {
  display: inline-block;
  background: #111;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 4px;
  padding: 7px 30px;
  margin-bottom: 10px;
  text-transform: uppercase;
}
.updated-label { font-size: 11px; color: #777; margin-top: 6px; }

/* ── Seções por tipo (negrito, bem definido) ── */
.section-block { margin-bottom: 24px; }
.section-title {
  font-family: 'Roboto', sans-serif;
  font-size: 13px;
  font-weight: 700;          /* negrito */
  letter-spacing: 2.5px;
  text-transform: uppercase;
  border-bottom: 2px solid #111;
  padding-bottom: 6px;
  margin-top: 28px;
  margin-bottom: 10px;
}

/* ── Barra de data ── */
.date-bar {
  background: #333;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  padding: 5px 12px;
  margin: 10px 0 4px;
  letter-spacing: 0.8px;
}

/* ── Linha de reserva ── */
.booking-row {
  padding: 4px 14px;
  font-size: 12.5px;
  line-height: 1.8;
  border-bottom: 1px solid #eee;
}
.booking-row:last-child { border-bottom: none; }

/* ── Rodapé ── */
.pdf-footer {
  margin-top: 40px;
  border-top: 1px solid #ccc;
  padding-top: 10px;
  text-align: center;
  font-size: 11px;
  color: #666;
  font-style: italic;
}

/* ── Impressão ── */
@media print {
  body { padding: 16px 22px; }
  .section-block { page-break-inside: avoid; }
  .section-title { margin-top: 20px; }
}
</style>
</head>
<body>
<div class="pdf-header">
  <div class="main-title">Cronograma de Reservas</div>
  <div><span class="room-badge">Sala Marcos Caruso</span></div>
  <div class="updated-label">Atualizado em ${updatedDate}</div>
</div>
${sectionsHtml}
<div class="pdf-footer">Falar com o Raul para reservas na Sala Marcos Caruso</div>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=820,height=950');
    if (!w) { toast('Permita popups no navegador para exportar o PDF.', 'warning'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    // Aguarda Roboto carregar do Google Fonts antes de abrir o dialogo de impressao
    w.document.fonts.ready.then(() => setTimeout(() => w.print(), 200)).catch(() => setTimeout(() => w.print(), 1400));
  }

  // ─── Export: Mapa de Salas (PDF) ─────────────────────────────────
  function exportMapPDF() {
    const weekKey    = getWeekMonday(mapWeekOffset);
    const weekLabel  = formatWeekRange(mapWeekOffset);
    const weekSched  = roomSchedules.filter(s => s.week_start === weekKey);

    // Ordem fixa de salas (colunas)
    const FIXED_ROOMS = ['Stanislavski','Lucia Capuani','Martins Pena','Sala de Video','Marcos Caruso','Saguao'];
    const orderedRooms = FIXED_ROOMS.map(name => allRooms.find(r => r.name === name) || { name, id: null });

    const DAY_ORDER    = ['monday','tuesday','wednesday','thursday','friday','saturday'];
    const DAY_LABEL_PT = {
      monday:    'Segunda-Feira', tuesday:  'Terça-Feira',
      wednesday: 'Quarta-Feira',  thursday: 'Quinta-Feira',
      friday:    'Sexta-Feira',   saturday: 'Sábado',
    };
    const DAY_OFFSET = { monday:0, tuesday:1, wednesday:2, thursday:3, friday:4, saturday:5 };
    const MONTH_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

    const monDate = new Date(weekKey + 'T12:00:00');

    // Construir linhas por dia
    const rows = [];
    for (const day of DAY_ORDER) {
      const daySched = weekSched.filter(s => s.classes?.day_of_week === day);
      if (!daySched.length) continue;

      const dayDate = new Date(monDate);
      dayDate.setDate(monDate.getDate() + (DAY_OFFSET[day] || 0));
      const dateLabel = `${String(dayDate.getDate()).padStart(2,'0')}/${MONTH_SHORT[dayDate.getMonth()]}`;

      const cells = orderedRooms.map(room => {
        const s = daySched.find(sc => sc.room_id === room.id);
        if (!s) return null;
        const cls     = s.classes;
        const course  = cls?.courses?.name  || '—';
        const teacher = (cls?.profiles?.name || '—').split(' ')[0];
        return { course, teacher };
      });

      rows.push({ dayLabel: DAY_LABEL_PT[day], dateLabel, cells });
    }

    const theadCols = orderedRooms.map(r => `<th>${r.name}</th>`).join('');
    const tbodyRows = rows.length
      ? rows.map(r => {
          const cells = r.cells.map(c =>
            c === null
              ? `<td class="empty">—</td>`
              : `<td>${escapeHtml(c.course)}<br><span class="tname">${escapeHtml(c.teacher)}</span></td>`
          ).join('');
          return `<tr>
            <td class="day-col"><strong>${r.dayLabel}</strong><br><span class="ddate">${r.dateLabel}</span></td>
            ${cells}
          </tr>`;
        }).join('')
      : `<tr><td colspan="${orderedRooms.length + 1}" class="empty" style="padding:2rem;text-align:center">
           Nenhuma turma atribuida nesta semana.
         </td></tr>`;

    const updatedDate = new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Mapa de Salas — ${weekLabel}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, Helvetica, sans-serif; color: #111; padding: 20px 24px; font-size: 12px; }
.pdf-header { text-align: center; margin-bottom: 18px; }
.main-title { font-size: 20px; font-weight: 900; letter-spacing: 3px; margin-bottom: 4px; }
.week-label { font-size: 12px; color: #555; margin-bottom: 2px; }
.updated-label { font-size: 10px; color: #888; }
table { width: 100%; border-collapse: collapse; margin-top: 10px; }
th { background: #111; color: #fff; padding: 7px 8px; font-size: 10px; font-weight: bold;
     letter-spacing: 0.5px; text-align: center; border: 1px solid #111; }
td { border: 1px solid #bbb; padding: 6px 8px; font-size: 11px; text-align: center; vertical-align: middle; }
td.day-col { background: #eee; text-align: left; font-size: 11px; min-width: 100px; }
td.empty { color: #bbb; }
.tname { font-size: 10px; color: #555; display: block; margin-top: 2px; }
.ddate { font-size: 10px; color: #777; font-weight: normal; }
.pdf-footer { margin-top: 14px; text-align: right; font-size: 10px; color: #888; }
@media print { body { padding: 8px 12px; } }
</style>
</head>
<body>
<div class="pdf-header">
  <div class="main-title">MAPA DE SALAS</div>
  <div class="week-label">Semana de ${weekLabel}</div>
  <div class="updated-label">Gerado em ${updatedDate}</div>
</div>
<table>
  <thead>
    <tr>
      <th>Dia / Data</th>
      ${theadCols}
    </tr>
  </thead>
  <tbody>
    ${tbodyRows}
  </tbody>
</table>
<div class="pdf-footer">TPC — Teatro Popular de Comédia</div>
</body>
</html>`;

    const w = window.open('', '_blank', 'width=1050,height=720');
    if (!w) { toast('Permita popups no navegador para exportar o PDF.', 'warning'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 700);
  }

  return {
    render, switchTab, prevWeek, nextWeek,
    prevMapWeek, nextMapWeek, resetMapWeek,
    openBookingForm, saveBooking, cancelBooking,
    openChangeRequest, saveChangeRequest, resolveChangeReq,
    openAssignRoom, assignRoom, unassignRoom, unassignSchedule,
    openChangeReqsAdmin,
    exportCarusoPDF, exportMapPDF,
  };
})();
