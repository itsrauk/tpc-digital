// ─── NotificationsHelper ───────────────────────────────────────
// Bell icon + painel de notificações in-app

const NotificationsHelper = (() => {

  let unreadCount = 0;
  let allNotifs   = [];

  async function load() {
    try {
      const profile = Auth.getProfile();
      if (!profile) return;

      const { data } = await db.from('notifications')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(50);

      allNotifs   = data || [];
      unreadCount = allNotifs.filter(n => !n.read).length;
      updateBadge();
    } catch { /* silencioso */ }
  }

  function updateBadge() {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
    badge.style.display = unreadCount > 0 ? 'flex' : 'none';
  }

  async function markRead(id) {
    await db.from('notifications').update({ read: true }).eq('id', id);
    allNotifs = allNotifs.map(n => n.id === id ? { ...n, read: true } : n);
    unreadCount = allNotifs.filter(n => !n.read).length;
    updateBadge();
  }

  async function markAllRead() {
    const profile = Auth.getProfile();
    if (!profile) return;
    await db.from('notifications').update({ read: true })
      .eq('user_id', profile.id).eq('read', false);
    allNotifs = allNotifs.map(n => ({ ...n, read: true }));
    unreadCount = 0;
    updateBadge();
    renderPanel();
  }

  function openPanel() {
    const typeIcon = {
      meeting:     '🗓',
      room:        '🏛',
      room_change: '🔄',
      reminder:    '⏰',
    };

    const html = allNotifs.length
      ? allNotifs.map(n => `
          <div class="notif-item ${n.read ? '' : 'notif-unread'}"
               onclick="NotificationsHelper.markRead('${n.id}')">
            <span class="notif-icon">${typeIcon[n.type] || '🔔'}</span>
            <div class="notif-body">
              <div class="notif-title">${escapeHtml(n.title)}</div>
              ${n.body ? `<div class="notif-text">${escapeHtml(n.body)}</div>` : ''}
              <div class="notif-time">${timeAgo(n.created_at)}</div>
            </div>
          </div>`).join('')
      : `<div class="notif-empty">Nenhuma notificacao.</div>`;

    openModal('Notificacoes', `
      <div style="display:flex;justify-content:flex-end;margin-bottom:0.75rem">
        <button class="btn btn-secondary" onclick="NotificationsHelper.markAllRead()" style="font-size:12px">
          Marcar todas como lidas
        </button>
      </div>
      <div class="notif-list">${html}</div>
    `);

    markAllRead();
  }

  function renderPanel() {
    // re-render se o modal ainda estiver aberto
    const body = document.getElementById('modal-body');
    if (!body || !document.getElementById('modal-overlay').classList.contains('active')) return;
  }

  // Notificar usuário específico
  async function notify(userId, title, body, type = null, referenceId = null) {
    try {
      await db.from('notifications').insert([{
        user_id: userId, title, body, type, reference_id: referenceId, read: false
      }]);
    } catch { /* silencioso */ }
  }

  // Notificar todos os usuários
  async function notifyAll(title, body, type = null, referenceId = null, excludeUserId = null) {
    try {
      const { data: profiles } = await db.from('profiles').select('id');
      if (!profiles?.length) return;
      const targets = profiles
        .map(p => p.id)
        .filter(id => id !== excludeUserId);
      if (!targets.length) return;
      await db.from('notifications').insert(
        targets.map(uid => ({ user_id: uid, title, body, type, reference_id: referenceId, read: false }))
      );
    } catch { /* silencioso */ }
  }

  // Notificar todos os admins
  async function notifyAdmins(title, body, type = null, referenceId = null) {
    try {
      const { data: admins } = await db.from('profiles').select('id').eq('role', 'admin');
      if (!admins?.length) return;
      await db.from('notifications').insert(
        admins.map(a => ({ user_id: a.id, title, body, type, reference_id: referenceId, read: false }))
      );
    } catch { /* silencioso */ }
  }

  function timeAgo(dateStr) {
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60)    return 'agora mesmo';
    if (diff < 3600)  return `${Math.floor(diff / 60)} min atras`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h atras`;
    return new Date(dateStr).toLocaleDateString('pt-BR');
  }

  return { load, markRead, markAllRead, openPanel, notify, notifyAll, notifyAdmins };
})();
