// Traffic Police Dashboard. Reads and updates the same stored requests the driver sees.
(() => {
  const { api, esc, fmtKm, fmtMin, fmtTime, fmtDateTime, timeAgo, statusBadge, congestionBadge, toast } = ERAS;
  const $ = (id) => document.getElementById(id);

  const CONGESTION_COLOR = { none: '#15803d', moderate: '#c27803', severe: '#c81e1e', blocked: '#374151' };

  const state = {
    user: null,
    filter: 'open',
    requests: [],
    selectedId: null,
    detail: null,
    unreadRequestIds: new Set(),
    busy: false,
  };
  let map;
  let mapLayers;

  // Minutes until the simulated ETA, computed in the browser so countdowns stay current.
  function minutesLeft(r) {
    if (!r.isOpen || !r.timing.etaAt) return null;
    return Math.round((Date.parse(r.timing.etaAt) - Date.now()) / 60000);
  }

  function etaText(r) {
    const left = minutesLeft(r);
    if (left === null) return r.isOpen ? '<span class="muted">No meaningful ETA</span>' : '';
    return left >= 0
      ? `<span class="r-eta">${fmtMin(left)}</span> <span class="muted">to simulated ETA</span>`
      : `<span class="r-eta overdue">ETA passed ${fmtMin(-left)} ago</span>`;
  }

  // ---- Summary ---------------------------------------------------------------------------
  async function loadSummary() {
    const { summary } = await api('GET', '/api/assistance/summary');
    for (const [key, value] of Object.entries(summary)) {
      const el = $(`s-${key}`);
      if (el) el.textContent = value;
    }
  }

  // ---- Request list ------------------------------------------------------------------------
  async function loadRequests() {
    const { requests } = await api('GET', `/api/assistance?status=${state.filter}`);
    state.requests = requests;
    renderRequests();
  }

  function renderRequests() {
    const list = state.requests;
    if (!list.length) {
      const msg = { open: 'No open assistance requests.', closed: 'No closed requests yet.', all: 'No assistance requests yet.' }[state.filter];
      $('request-list').innerHTML = `<div class="empty">${msg}<br><span class="small">New driver requests appear here automatically.</span></div>`;
      return;
    }
    $('request-list').innerHTML = list.map((r) => {
      const unread = state.unreadRequestIds.has(r.id);
      return `<button type="button" class="r-card s-${esc(r.status)}${r.id === state.selectedId ? ' active' : ''}${unread ? ' unread' : ''}" data-id="${esc(r.id)}">
        <div class="r-top">
          <span class="r-id">${unread ? '<span class="unread-dot" title="Unread"></span>' : ''}${esc(r.id)}</span>
          ${statusBadge(r.status, r.statusLabel)}
        </div>
        <div class="r-line"><strong>${esc(r.hospital.name)}</strong></div>
        <div class="r-line muted">From ${esc(r.origin.label)} · ${esc(r.city.name)}</div>
        <div class="r-line">${r.route ? esc(r.route.name) : 'No usable route'} ${congestionBadge(r.congestionSeverity)}</div>
        <div class="r-line">${fmtKm(r.route?.distanceKm)} · ${etaText(r)}</div>
        <div class="r-line small muted">Created ${fmtTime(r.createdAt)} (${timeAgo(r.createdAt)})</div>
      </button>`;
    }).join('');
  }

  // ---- Notifications -------------------------------------------------------------------------
  async function loadNotifications() {
    const { notifications, unreadCount } = await api('GET', '/api/notifications');
    state.unreadRequestIds = new Set(notifications.filter((n) => !n.readAt && n.requestId).map((n) => n.requestId));
    $('bell-count').hidden = unreadCount === 0;
    $('bell-count').textContent = unreadCount;
    $('notif-list').innerHTML = notifications.length
      ? notifications.map((n) => `<button type="button" class="notif-item${n.readAt ? '' : ' unread'}" data-request="${esc(n.requestId || '')}">
          ${esc(n.message)}<div class="small muted">${fmtDateTime(n.createdAt)}${n.readAt ? '' : ' · unread'}</div>
        </button>`).join('')
      : '<div class="empty">No notifications yet.</div>';
  }

  function toggleBell(open) {
    const menu = $('notif-menu');
    const show = open ?? menu.hidden;
    menu.hidden = !show;
    $('bell-btn').setAttribute('aria-expanded', String(show));
  }

  // Reloads everything shown on the page from the server.
  async function refreshAll() {
    try {
      await Promise.all([loadSummary(), loadNotifications()]);
      await loadRequests();
      if (state.selectedId) await loadDetail(state.selectedId, { quiet: true });
    } catch (err) {
      if (err.status !== 401) setLive('reconnecting');
    }
  }

  // ---- Request details -------------------------------------------------------------------
  async function loadDetail(id, { quiet = false } = {}) {
    try {
      const { request } = await api('GET', `/api/assistance/${encodeURIComponent(id)}`);
      const changedRequest = state.selectedId !== id;
      state.selectedId = id;
      state.detail = request;
      renderDetail({ fit: changedRequest });
      renderRequests();
      // Opening a request marks its notification as read.
      if (state.unreadRequestIds.has(id)) {
        await api('POST', '/api/notifications/read', { requestId: id });
        state.unreadRequestIds.delete(id);
        renderRequests();
        await Promise.all([loadSummary(), loadNotifications()]);
      }
    } catch (err) {
      if (!quiet) toast(err.message, 'bad');
    }
  }

  function setupMap() {
    map = L.map('detail-map');
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    map.attributionControl.addAttribution('ERAS demo: simulated routes');
    mapLayers = L.layerGroup().addTo(map);
  }

  function drawDetailMap(r, fit) {
    if (!map) setupMap();
    map.invalidateSize();
    mapLayers.clearLayers();
    const bounds = [[r.origin.lat, r.origin.lng], [r.hospital.lat, r.hospital.lng]];
    if (r.route) {
      L.polyline(r.route.geometry, { color: CONGESTION_COLOR[r.congestionSeverity] || '#c81e1e', weight: 6, opacity: 0.9 })
        .bindTooltip(`${esc(r.route.name)} (simulated)`, { sticky: true }).addTo(mapLayers);
      r.route.geometry.forEach((p) => bounds.push(p));
    }
    for (const z of r.zones) {
      L.circle([z.lat, z.lng], { radius: z.radiusM, color: CONGESTION_COLOR[z.severity], weight: 1, fillOpacity: 0.2 })
        .bindTooltip(esc(z.label)).addTo(mapLayers);
      bounds.push([z.lat, z.lng]);
    }
    L.circleMarker([r.origin.lat, r.origin.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#0f1d33', fillOpacity: 1 })
      .bindTooltip(`Ambulance origin: ${esc(r.origin.label)}`).addTo(mapLayers);
    L.circleMarker([r.hospital.lat, r.hospital.lng], { radius: 9, color: '#fff', weight: 2, fillColor: '#d62839', fillOpacity: 1 })
      .bindTooltip(`Destination: ${esc(r.hospital.name)}`).addTo(mapLayers);
    if (fit) map.fitBounds(bounds, { padding: [25, 25] });
  }

  function renderTiming(r) {
    const left = minutesLeft(r);
    let main;
    if (!r.isOpen) main = `<div class="small">Request closed: <strong>${esc(r.statusLabel)}</strong></div>`;
    else if (left === null) main = '<div class="notice notice-warn">No meaningful ETA (no usable route estimate).</div>';
    else if (left >= 0) main = `<div class="countdown">${fmtMin(left)}</div><div class="small muted">until the ambulance's simulated ETA</div>`;
    else main = `<div class="countdown overdue">ETA passed ${fmtMin(-left)} ago</div><div class="notice notice-bad">${esc(r.timing.warning || 'The estimated arrival time has passed and this request is still open.')}</div>`;

    $('d-timing').innerHTML = `
      ${main}
      <dl class="kv" style="margin-top:10px">
        <dt>Created</dt><dd>${fmtTime(r.createdAt)}</dd>
        <dt>Driver confirmed</dt><dd>${fmtTime(r.driverConfirmedAt)}</dd>
        <dt>Simulated ETA</dt><dd>${r.timing.etaAt ? `${fmtTime(r.timing.etaAt)} (${fmtMin(r.timing.etaMin)} trip)` : '—'}</dd>
        <dt>Estimate updated</dt><dd>${fmtTime(r.timing.etaUpdatedAt)}</dd>
      </dl>
      <div class="notice notice-warn small">${esc(r.timing.uncertainty)}<br>${esc(r.timing.etaBasis)}</div>`;
  }

  const ACTIONS = {
    acknowledged: { label: 'Acknowledge', cls: 'btn-ack' },
    in_progress: { label: 'Start Assistance', cls: 'btn-progress' },
    solved: { label: 'Mark Solved', cls: 'btn-solved' },
    unable_to_resolve: { label: 'Unable to Resolve', cls: 'btn-unable' },
  };

  function renderDetail({ fit = false } = {}) {
    const r = state.detail;
    $('detail-empty').hidden = Boolean(r);
    $('detail').hidden = !r;
    if (!r) return;

    // Keep anything the officer is typing when the view refreshes.
    const typedNote = $('action-note')?.value ?? '';

    $('d-title').textContent = r.id;
    $('d-sub').textContent = `${r.city.name} · created ${fmtDateTime(r.createdAt)} · ${r.dataLabel}`;
    $('d-badge').innerHTML = statusBadge(r.status, r.statusLabel);
    renderTiming(r);

    $('d-info').innerHTML = `
      <h3 style="margin-bottom:6px">Ambulance request</h3>
      <dl class="kv">
        <dt>Origin</dt><dd>${esc(r.origin.label)}</dd>
        <dt>Destination</dt><dd><strong>${esc(r.hospital.name)}</strong><br><span class="small muted">${esc(r.hospital.address)}</span>
          <br><span class="small">${r.hospital.phone ? `Tel: ${esc(r.hospital.phone)} – ` : ''}${esc(r.hospital.phoneNote)}</span></dd>
        <dt>Intended route</dt><dd>${r.route ? `${esc(r.route.name)} · ${fmtKm(r.route.distanceKm)}` : 'No usable route'} ${congestionBadge(r.congestionSeverity)}</dd>
        <dt>Affected area</dt><dd>${esc(r.affectedArea)}</dd>
        <dt>Driver</dt><dd>${esc(r.driver.displayName)} · trip #${r.trip.id} (${esc(r.trip.status)})</dd>
      </dl>
      <div class="notice notice-info" style="margin-top:10px"><strong>Why assistance was requested:</strong> ${esc(r.reason)}</div>`;

    $('d-routes').innerHTML = `
      <h3 style="margin-bottom:6px">Routes considered (simulated)</h3>
      <div class="table-scroll"><table class="routes-table">
        <thead><tr><th>Route</th><th>Distance</th><th>ETA</th><th>Congestion</th><th>Why rejected</th></tr></thead>
        <tbody>${r.routesConsidered.map((x) => `<tr>
          <td>${esc(x.name)}</td><td>${fmtKm(x.distanceKm)}</td><td>${x.etaMin == null ? 'Blocked' : fmtMin(x.etaMin)}</td>
          <td>${congestionBadge(x.congestion)}</td><td>${esc(x.rejectionReason || '—')}</td></tr>`).join('')}</tbody>
      </table></div>`;

    if (r.isOpen) {
      $('d-actions').innerHTML = `
        <h3 style="margin-bottom:6px">Police action</h3>
        <div class="field">
          <label for="action-note">Action note <span class="muted">(required for Unable to Resolve)</span></label>
          <textarea id="action-note" rows="2" maxlength="500" placeholder="e.g. Demo: traffic diverted at junction"></textarea>
        </div>
        <div id="action-error" class="notice notice-bad" role="alert" hidden></div>
        <div class="action-buttons">${r.allowedNextStatuses.map((s) => `<button class="btn ${ACTIONS[s].cls}" type="button" data-status="${esc(s)}">${esc(ACTIONS[s].label)}</button>`).join('')}</div>
        <p class="small muted" style="margin:8px 0 0">Every change is saved with your name and time and shown on the driver's dashboard immediately.
          "Mark Solved" records that this demo request was resolved; it does not confirm a real road was cleared.</p>`;
      $('action-note').value = typedNote;
    } else {
      $('d-actions').innerHTML = `<h3 style="margin-bottom:6px">Police action</h3>
        <div class="notice notice-ok">This request is closed (${esc(r.statusLabel)}). No further status changes are allowed.</div>
        ${r.latestNote ? `<div class="small"><strong>Last note:</strong> ${esc(r.latestNote)}</div>` : ''}
        <div class="small muted" style="margin-top:4px">${esc(r.etaNote)}</div>`;
    }

    $('d-history').innerHTML = `<h3 style="margin-bottom:6px">Status history</h3>
      <ul class="history">${r.history.map((h) => `<li><strong>${esc(h.toStatusLabel)}</strong> · ${fmtDateTime(h.at)} · ${esc(h.actor)} (${esc(h.actorRole)})
        ${h.note ? `<br><span class="muted">${esc(h.note)}</span>` : ''}</li>`).join('')}</ul>
      <p class="small muted" style="margin:8px 0 0">${esc(r.disclaimer)}</p>`;

    drawDetailMap(r, fit);
  }

  // ---- Actions -----------------------------------------------------------------------------
  async function changeStatus(button, status) {
    const r = state.detail;
    const note = $('action-note').value.trim();
    const errorBox = $('action-error');
    errorBox.hidden = true;
    if (status === 'unable_to_resolve' && note.length < 3) {
      errorBox.textContent = 'Enter a reason before marking Unable to Resolve.';
      errorBox.hidden = false;
      $('action-note').focus();
      return;
    }
    document.querySelectorAll('[data-status]').forEach((b) => { b.disabled = true; });
    state.busy = true;
    try {
      const res = await api('POST', `/api/assistance/${encodeURIComponent(r.id)}/status`, { status, note: note || undefined });
      $('action-note').value = '';
      const delivered = res.driverDelivery.status === 'pushed_live' ? 'driver dashboard updated live' : 'driver will see it on refresh';
      toast(`${r.id}: ${res.request.statusLabel} (${delivered}).`, 'ok');
      state.detail = res.request;
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.hidden = false;
    } finally {
      state.busy = false;
      await refreshAll();
    }
  }

  document.addEventListener('click', (e) => {
    const card = e.target.closest('.r-card');
    if (card) return loadDetail(card.dataset.id);

    const statusBtn = e.target.closest('[data-status]');
    if (statusBtn) return changeStatus(statusBtn, statusBtn.dataset.status);

    const tab = e.target.closest('.tab');
    if (tab) {
      state.filter = tab.dataset.filter;
      document.querySelectorAll('.tab').forEach((t) => {
        t.classList.toggle('active', t === tab);
        t.setAttribute('aria-selected', String(t === tab));
      });
      return loadRequests().catch((err) => toast(err.message, 'bad'));
    }

    const notif = e.target.closest('.notif-item');
    if (notif) {
      toggleBell(false);
      if (notif.dataset.request) loadDetail(notif.dataset.request);
      return undefined;
    }

    if (e.target.closest('#bell-btn')) return toggleBell();
    if (!e.target.closest('#notif-menu')) toggleBell(false);
    return undefined;
  });

  // ---- Live updates --------------------------------------------------------------------------
  function setLive(mode) {
    $('live-dot').className = `live-dot ${mode === 'live' ? 'on' : 'off'}`;
    $('live-text').textContent = mode === 'live' ? 'Live' : 'Reconnecting… (auto-refresh on)';
  }

  function startLiveUpdates() {
    ERAS.connectEvents({
      'assistance.created': (d) => {
        toast(`New assistance request ${d.requestId} (in-app demo notification).`, 'bad');
        refreshAll();
      },
      'assistance.updated': () => { if (!state.busy) refreshAll(); },
      'hospital.updated': () => { if (state.selectedId) loadDetail(state.selectedId, { quiet: true }); },
    }, setLive);
    // Polling fallback: the database is the source of truth even if the live connection drops.
    setInterval(() => { if (!state.busy) refreshAll(); }, 10000);
    // Keep countdowns current between updates.
    setInterval(() => {
      renderRequests();
      if (state.detail) renderTiming(state.detail);
    }, 15000);
  }

  // ---- Start-up ------------------------------------------------------------------------------
  async function init() {
    try {
      state.user = await ERAS.requireUser('police');
    } catch {
      return; // redirected to login or the correct dashboard
    }
    $('user-name').textContent = state.user.displayName;
    $('logout-btn').addEventListener('click', ERAS.logout);
    try {
      const { cities } = await api('GET', '/api/cities');
      $('city-name').textContent = cities.find((c) => c.id === state.user.cityId)?.name || 'All cities';
      await refreshAll();
      startLiveUpdates();
    } catch (err) {
      $('request-list').innerHTML = `<div class="notice notice-bad" style="margin:12px">Could not load requests: ${esc(err.message)}</div>`;
    }
  }

  init();
})();
