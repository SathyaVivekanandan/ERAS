// Ambulance Driver Dashboard. All data comes from the shared ERAS backend.
(() => {
  const { api, esc, fmtKm, fmtMin, fmtTime, fmtDateTime, timeAgo, statusBadge, congestionBadge, toast } = ERAS;
  const $ = (id) => document.getElementById(id);

  const CONGESTION_COLOR = { none: '#15803d', moderate: '#c27803', severe: '#c81e1e', blocked: '#374151' };
  const STATUS_LABEL = { new: 'New', acknowledged: 'Acknowledged', in_progress: 'In Progress', solved: 'Solved', unable_to_resolve: 'Unable to Resolve' };

  const state = {
    user: null,
    cities: [],
    scenarios: [],
    cityId: null,
    originId: null,
    customOrigin: null,   // {lat, lng} when the driver picks a point on the map
    scenarioCode: 'normal',
    search: '',
    hospitals: [],
    hospitalMeta: null,
    trip: null,
    picking: false,
    confirm: null,        // 'start' | 'assist' while an inline confirmation is shown
    assistKey: null,      // idempotency key for the assistance request being confirmed
  };
  let map;
  let layers;

  const city = () => state.cities.find((c) => c.id === state.cityId);

  // The origin in use: the trip's origin once a trip exists, otherwise the driver's choice.
  function currentOrigin() {
    if (state.trip) return state.trip.origin;
    if (state.customOrigin) return { id: null, label: 'DEMO LOCATION – custom point', ...state.customOrigin };
    const o = city()?.demoOrigins.find((d) => d.id === state.originId);
    return o ? { id: o.id, label: o.name, lat: o.lat, lng: o.lng } : null;
  }

  // ---- Map -------------------------------------------------------------------------
  function setupMap() {
    map = L.map('map', { zoomControl: true });
    let tileErrorShown = false;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).on('tileerror', () => {
      if (!tileErrorShown) toast('Map tiles could not load (internet needed). Markers and routes still work.', 'bad');
      tileErrorShown = true;
    }).addTo(map);
    map.attributionControl.addAttribution('ERAS demo: simulated routes, fictional hospitals');

    layers = {
      routes: L.layerGroup().addTo(map),
      zones: L.layerGroup().addTo(map),
      hospitals: L.layerGroup().addTo(map),
      origin: L.layerGroup().addTo(map),
    };
    map.on('click', (e) => { if (state.picking) setCustomOrigin(e.latlng); });
  }

  function drawOrigin() {
    layers.origin.clearLayers();
    const o = currentOrigin();
    if (!o) return;
    L.circleMarker([o.lat, o.lng], { radius: 10, color: '#fff', weight: 3, fillColor: '#0f1d33', fillOpacity: 1 })
      .bindTooltip(`Ambulance origin<br><strong>${esc(o.label)}</strong>`, { permanent: true, direction: 'top', offset: [0, -10] })
      .addTo(layers.origin);
  }

  function drawHospitals() {
    layers.hospitals.clearLayers();
    const destId = state.trip?.hospital.id;
    for (const h of state.hospitals) {
      const isDest = h.id === destId;
      L.circleMarker([h.lat, h.lng], {
        radius: isDest ? 12 : 8,
        color: '#fff',
        weight: 2,
        fillColor: isDest ? '#d62839' : h.emergencyCapability === 'verified' ? '#1d4ed8' : '#6b7280',
        fillOpacity: 1,
      })
        .bindTooltip(`${isDest ? '<strong>DESTINATION</strong><br>' : ''}${esc(h.name)}`)
        .on('click', () => openHospital(h.id))
        .addTo(layers.hospitals);
    }
  }

  function fitCity() {
    const c = city();
    if (c) map.setView([c.center.lat, c.center.lng], c.zoom);
  }

  // ---- Controls ------------------------------------------------------------------------
  function renderControls() {
    const hasTrip = Boolean(state.trip);
    $('city-select').innerHTML = state.cities.map((c) => `<option value="${esc(c.id)}"${c.id === state.cityId ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
    $('city-select').disabled = hasTrip;
    $('city-select').title = hasTrip ? 'Cancel or complete the current trip to change city.' : '';

    const origins = city()?.demoOrigins || [];
    const custom = state.customOrigin && !hasTrip;
    const tripOriginCustom = hasTrip && !state.trip.origin.id;
    $('origin-select').innerHTML = [
      ...origins.map((o) => `<option value="${esc(o.id)}"${o.id === (hasTrip ? state.trip.origin.id : state.originId) && !custom ? ' selected' : ''}>${esc(o.name)}</option>`),
      custom || tripOriginCustom ? '<option value="" selected>DEMO LOCATION – custom point (from map)</option>' : '',
    ].join('');
    $('origin-select').disabled = hasTrip;
    $('pick-origin-btn').disabled = hasTrip;

    $('scenario-select').innerHTML = state.scenarios.map((s) => `<option value="${esc(s.code)}"${s.code === state.scenarioCode ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
    const s = state.scenarios.find((x) => x.code === state.scenarioCode);
    $('scenario-desc').textContent = s ? `${s.description} (SIMULATED DEMO DATA)` : '';
    renderDataStatus();
  }

  function renderDataStatus() {
    const status = state.trip?.data.status ?? state.hospitalMeta?.scenario.dataStatus ?? null;
    const pill = $('data-status');
    const map_ = { ok: ['pill-ok', 'Data: simulated, fresh'], stale: ['pill-warn', 'Data: STALE'], unavailable: ['pill-bad', 'Data: UNAVAILABLE'] };
    const [cls, text] = map_[status] || ['pill-ok', 'Data: —'];
    pill.className = `pill ${cls}`;
    pill.textContent = text;
  }

  function setCustomOrigin(latlng) {
    state.customOrigin = { lat: Number(latlng.lat.toFixed(6)), lng: Number(latlng.lng.toFixed(6)) };
    state.originId = null;
    setPicking(false);
    renderControls();
    drawOrigin();
    loadHospitals();
  }

  function setPicking(on) {
    state.picking = on;
    $('map-mode').hidden = !on;
    map.getContainer().style.cursor = on ? 'crosshair' : '';
  }

  // ---- Hospitals -------------------------------------------------------------------------
  let hospitalRequest = 0;
  async function loadHospitals() {
    const origin = currentOrigin();
    const params = new URLSearchParams({ city: state.cityId, scenario: state.scenarioCode });
    if (origin?.id) params.set('originId', origin.id);
    else if (origin) { params.set('lat', origin.lat); params.set('lng', origin.lng); }
    if (state.search) params.set('q', state.search);

    const mine = ++hospitalRequest; // ignore late responses from older requests
    $('hospital-list').innerHTML = '<div class="loading">Loading hospitals…</div>';
    try {
      const data = await api('GET', `/api/hospitals?${params}`);
      if (mine !== hospitalRequest) return;
      state.hospitals = data.hospitals;
      state.hospitalMeta = data;
      renderHospitals();
      drawHospitals();
      renderDataStatus();
    } catch (err) {
      if (mine !== hospitalRequest) return;
      $('hospital-list').innerHTML = `<div class="notice notice-bad">${esc(err.message)}</div>`;
      if (err.code === 'invalid_origin' && state.customOrigin) {
        toast(err.message, 'bad');
        state.customOrigin = null;
        state.originId = city()?.demoOrigins[0]?.id ?? null;
        renderControls();
        drawOrigin();
        loadHospitals();
      }
    }
  }

  function hospitalMetrics(h) {
    if (h.estimate) {
      return `<div class="h-metrics">
        <span><strong>${fmtMin(h.estimate.etaMin)}</strong> <span class="muted small">est. (simulated)</span></span>
        <span>${fmtKm(h.estimate.distanceKm)} <span class="muted small">route est.</span></span>
      </div>`;
    }
    if (h.straightLineKm != null) {
      return `<div class="h-metrics"><span><strong>${fmtKm(h.straightLineKm)}</strong> <span class="muted small">straight-line (not driving distance)</span></span></div>`;
    }
    return '';
  }

  const capabilityBadge = (h) => `<span class="badge ${h.emergencyCapability === 'verified' ? 'badge-verified' : 'badge-unverified'}">${esc(h.emergencyCapabilityLabel)}</span>`;
  const phoneLine = (h) => (h.phone
    ? `<span class="small">Tel: ${esc(h.phone)} <span class="muted">(${esc({ verified: 'verified', unverified: 'unverified', demo_placeholder: 'demo placeholder' }[h.phoneStatus])})</span></span>`
    : '<span class="small muted">No contact number</span>');

  function renderHospitals() {
    const list = state.hospitals;
    $('hospital-count').textContent = `${list.length} found`;
    $('sort-note').textContent = state.hospitalMeta?.sortNote || '';
    if (!list.length) {
      $('hospital-list').innerHTML = '<div class="empty">No hospitals match.</div>';
      return;
    }
    const destId = state.trip?.hospital.id;
    $('hospital-list').innerHTML = list.map((h) => `
      <article class="h-card${h.id === destId ? ' selected' : ''}">
        <button class="h-name" type="button" data-action="details" data-id="${esc(h.id)}">${esc(h.name)}</button>
        ${h.id === destId ? ' <span class="badge badge-status st-new">Destination</span>' : ''}
        ${hospitalMetrics(h)}
        <div class="h-addr">${esc(h.address)}</div>
        <div class="h-tags">${capabilityBadge(h)} ${phoneLine(h)}</div>
      </article>`).join('');
  }

  async function openHospital(id) {
    const origin = currentOrigin();
    const params = new URLSearchParams({ scenario: state.scenarioCode });
    if (origin?.id) params.set('originId', origin.id);
    else if (origin) { params.set('lat', origin.lat); params.set('lng', origin.lng); }
    let h;
    try {
      ({ hospital: h } = await api('GET', `/api/hospitals/${encodeURIComponent(id)}?${params}`));
    } catch (err) {
      toast(err.message, 'bad');
      return;
    }

    const isDest = state.trip?.hospital.id === h.id;
    const activeElsewhere = state.trip?.status === 'active' && !isDest;
    $('hd-title').textContent = h.name;
    $('hd-body').innerHTML = `
      <dl class="kv">
        <dt>Address</dt><dd>${esc(h.address)}</dd>
        <dt>Contact</dt><dd>${h.phone ? esc(h.phone) : '—'}<div class="small muted">${esc(h.phoneNote)}</div></dd>
        <dt>Distance</dt><dd>${h.straightLineKm != null ? `${fmtKm(h.straightLineKm)} straight-line from ${esc(origin.label)}` : 'Select an origin to see distance'}</dd>
        <dt>Est. driving</dt><dd>${h.estimate ? `${fmtKm(h.estimate.distanceKm)}, ${fmtMin(h.estimate.etaMin)} via ${esc(h.estimate.routeName)}<div class="small muted">${esc(h.estimate.basis)}</div>` : 'No route estimate available'}</dd>
        <dt>Emergency</dt><dd>${capabilityBadge(h)}${h.verifiedBy ? `<div class="small muted">${esc(h.verificationNote)} By ${esc(h.verifiedBy)}, ${fmtDateTime(h.verifiedAt)}</div>` : ''}</dd>
        <dt>Availability</dt><dd><strong>${esc(h.availability.label)}</strong>${h.availability.confirmedAt ? ` – ${esc(h.availability.source)}, ${fmtDateTime(h.availability.confirmedAt)}` : ''}<div class="small muted">${esc(h.availability.note)}</div></dd>
        <dt>Data source</dt><dd class="small">${esc(h.dataSource)}<br>Last updated ${fmtDateTime(h.updatedAt)}</dd>
      </dl>`;

    const call = h.callable
      ? `<a class="btn" href="tel:${esc(h.phone.replace(/[^+\d]/g, ''))}" title="Opens your phone app. ERAS does not know whether a call was made.">Call Hospital</a>`
      : '';
    const select = isDest
      ? '<span class="badge badge-status st-new" style="align-self:center">Current destination</span>'
      : `<button class="btn btn-danger" type="button" data-action="select-dest" data-id="${esc(h.id)}"${activeElsewhere || !origin ? ' disabled' : ''}>Select as Destination</button>`;
    $('hd-foot').innerHTML = `
      ${activeElsewhere ? '<span class="small muted" style="margin-right:auto">Complete or cancel the active trip to change destination.</span>' : ''}
      ${!origin ? '<span class="small muted" style="margin-right:auto">Select an origin first.</span>' : ''}
      ${call}${select}`;
    $('hospital-dialog').showModal();
  }

  // ---- Trip ----------------------------------------------------------------------------
  function setTrip(trip, { fit = false } = {}) {
    const hospitalChanged = state.trip?.hospital.id !== trip?.hospital.id;
    state.trip = trip;
    if (trip) {
      state.cityId = trip.cityId;
      state.scenarioCode = trip.scenario.code;
    } else {
      state.confirm = null;
    }
    renderControls();
    renderTrip();
    renderRoutes();
    renderAssist();
    drawOrigin();
    drawRoutes(fit);
    if (hospitalChanged) { renderHospitals(); drawHospitals(); }
  }

  async function refreshTrip() {
    try {
      const { trip } = await api('GET', '/api/trips/current');
      // Keep showing a just-closed request's trip view only while the trip itself is open.
      setTrip(trip);
    } catch (err) {
      if (err.status !== 401) setLive('reconnecting');
    }
  }

  function renderTrip() {
    const t = state.trip;
    $('trip-status-badge').innerHTML = t
      ? `<span class="badge badge-status ${t.status === 'active' ? 'st-solved' : 'st-new'}">${t.status === 'active' ? 'Trip active' : 'Planned'}</span>`
      : '';
    if (!t) {
      $('trip-body').innerHTML = '<div class="empty">No destination selected.<br>Choose a hospital from the list or the map.</div>';
      return;
    }
    const sel = t.selectedRoute;
    const warnings = t.data.warnings.map((w) => `<div class="notice notice-warn">${esc(w)}</div>`).join('');
    let actions;
    if (t.status === 'planned' && state.confirm === 'start') {
      actions = `<div class="notice notice-info">Start the demonstration trip to <strong>${esc(t.hospital.name)}</strong> via
          <strong>${esc(sel.name)}</strong> (${fmtKm(sel.distanceKm)}, ${fmtMin(sel.etaMin)} simulated)?</div>
        <div class="btn-row"><button class="btn btn-primary" type="button" data-action="confirm-start">Confirm start</button>
        <button class="btn" type="button" data-action="cancel-confirm">Back</button></div>`;
    } else if (t.status === 'planned') {
      actions = `<div class="btn-row">
          <button class="btn btn-primary" type="button" data-action="start"${sel ? '' : ' disabled'}>Start trip</button>
          <button class="btn" type="button" data-action="cancel-trip">Cancel</button></div>
        ${sel ? '' : '<div class="small muted" style="margin-top:6px">Select a route below to start the trip.</div>'}`;
    } else {
      actions = `<div class="btn-row">
          <button class="btn btn-primary" type="button" data-action="complete-trip">Arrived – complete trip</button>
          <button class="btn" type="button" data-action="cancel-trip">Cancel trip</button></div>`;
    }

    $('trip-body').innerHTML = `
      <dl class="kv">
        <dt>From</dt><dd>${esc(t.origin.label)}</dd>
        <dt>To</dt><dd><button class="h-name" type="button" data-action="details" data-id="${esc(t.hospital.id)}">${esc(t.hospital.name)}</button></dd>
        <dt>Route</dt><dd>${sel ? `${esc(sel.name)} – ${fmtKm(sel.distanceKm)}, <strong>${fmtMin(sel.etaMin)}</strong> ${congestionBadge(sel.congestion)}` : '<span class="muted">Not selected</span>'}</dd>
        <dt>Scenario</dt><dd>${esc(t.scenario.name)} <span class="pill pill-demo">Simulated</span></dd>
        ${t.startedAt ? `<dt>Started</dt><dd>${fmtTime(t.startedAt)}</dd>` : ''}
        <dt>Routes from</dt><dd class="small">${t.data.freshnessAt ? `data ${timeAgo(t.data.freshnessAt)}` : 'no data'} · computed ${fmtTime(t.data.computedAt)}
          <button class="btn btn-sm" type="button" data-action="refresh-routes" style="margin-left:4px">Refresh</button></dd>
      </dl>
      ${warnings}
      <div style="margin-top:10px">${actions}</div>`;
  }

  // ---- Routes ----------------------------------------------------------------------------
  function renderRoutes() {
    const t = state.trip;
    $('routes-panel').hidden = !t;
    if (!t) return;
    if (!t.routes.length) {
      $('routes-body').innerHTML = `<div class="notice notice-bad">No route estimates are available (${esc(t.data.status)}).
        ERAS will not invent travel times or traffic. Use local knowledge and contact the hospital directly.</div>`;
      return;
    }
    const open = ['planned', 'active'].includes(t.status);
    $('routes-body').innerHTML = `
      <p class="small muted" style="margin:0 0 8px">Ranked by simulated travel time. ${esc(t.data.source)}</p>
      ${t.routes.map((r) => {
        const selected = r.key === t.selectedRouteKey;
        const recommended = r.key === t.recommendedKey;
        return `<article class="route-card${selected ? ' selected' : ''}${r.suitable ? '' : ' rejected'}">
          <div class="route-top">
            <h3>#${r.rank} ${esc(r.name)}</h3>
            ${congestionBadge(r.congestion)}
          </div>
          <div class="route-metrics">
            <span>${fmtKm(r.distanceKm)}</span>
            <span><strong>${r.blocked ? 'Blocked' : fmtMin(r.etaMin)}</strong></span>
            <span class="muted small">free-flow ${fmtMin(r.freeFlowEtaMin)}</span>
          </div>
          <div class="route-reason">${r.suitable ? `<span style="color:var(--c-none)">✔ Suitable</span>${recommended ? ' · <strong>Recommended</strong>' : ''}` : `✖ ${esc(r.rejectionReason)}`}</div>
          <div class="btn-row" style="margin-top:6px">
            ${selected ? '<span class="badge badge-status st-new">Selected</span>'
              : `<button class="btn btn-sm" type="button" data-action="select-route" data-key="${esc(r.key)}"${r.blocked || !open ? ' disabled' : ''}>Use this route</button>`}
          </div>
        </article>`;
      }).join('')}
      <p class="small muted" style="margin:4px 0 0">${esc(t.routes[0] ? 'ETA basis: SIMULATED estimate from demo speed assumptions (uncertainty about ±40%).' : '')}</p>`;
  }

  function drawRoutes(fit) {
    layers.routes.clearLayers();
    layers.zones.clearLayers();
    const t = state.trip;
    if (!t) return;
    const bounds = [[t.origin.lat, t.origin.lng], [t.hospital.lat, t.hospital.lng]];
    // Draw unselected routes first so the selected one sits on top.
    const ordered = [...t.routes].sort((a, b) => (a.key === t.selectedRouteKey) - (b.key === t.selectedRouteKey));
    for (const r of ordered) {
      const selected = r.key === t.selectedRouteKey;
      L.polyline(r.geometry, {
        color: CONGESTION_COLOR[r.congestion],
        weight: selected ? 7 : 4,
        opacity: selected ? 0.95 : 0.5,
        dashArray: r.blocked ? '6 8' : null,
      }).bindTooltip(`${esc(r.name)}<br>${fmtKm(r.distanceKm)} · ${r.blocked ? 'Blocked' : fmtMin(r.etaMin)} (simulated)`, { sticky: true })
        .addTo(layers.routes);
      r.geometry.forEach((p) => bounds.push(p));
      for (const z of r.zones) {
        L.circle([z.lat, z.lng], { radius: z.radiusM, color: CONGESTION_COLOR[z.severity], weight: 1, fillOpacity: 0.18 })
          .bindTooltip(esc(z.label)).addTo(layers.zones);
      }
    }
    if (fit) map.fitBounds(bounds, { padding: [40, 40] });
  }

  // ---- Assistance ------------------------------------------------------------------------
  function renderAssist() {
    const t = state.trip;
    $('assist-panel').hidden = !t;
    if (!t) return;
    const req = t.assistanceRequest;
    const check = t.assistanceCheck;
    $('assist-badge').innerHTML = req ? statusBadge(req.status, req.statusLabel) : '';

    const checks = `<ul class="checks">${check.checks.map((c) => `<li><span class="${c.passed ? 'ok' : 'no'}">${c.passed ? '✔' : '✖'}</span>
      <span>${esc(c.label)}<br><span class="muted">${esc(c.detail)}</span></span></li>`).join('')}</ul>`;

    let html = '';
    if (req) html += requestCard(req);

    const canRequest = t.status === 'active' && check.eligible && !(req && req.isOpen);
    if (!req || !req.isOpen) {
      html += `<div class="notice ${check.eligible ? 'notice-bad' : 'notice-info'}"><strong>${esc(check.summary)}</strong></div>
        <details${check.eligible ? ' open' : ''}><summary class="small">Eligibility checks</summary>${checks}</details>`;
      if (canRequest && state.confirm === 'assist') {
        html += `<div class="notice notice-warn">This creates an <strong>internal in-app request</strong> for the demo traffic police dashboard.
            No real police officer is contacted.</div>
          <div class="btn-row"><button class="btn btn-danger" type="button" data-action="confirm-assist">Confirm request</button>
          <button class="btn" type="button" data-action="cancel-confirm">Back</button></div>`;
      } else if (canRequest) {
        html += '<button class="btn btn-danger btn-block" type="button" data-action="assist">Request traffic assistance</button>';
      } else if (check.eligible && t.status === 'planned') {
        html += '<div class="small muted">Start the trip to request traffic assistance.</div>';
      }
    }
    $('assist-body').innerHTML = html;
  }

  function requestCard(r) {
    const steps = [['new', 'New'], ['acknowledged', 'Acknowledged'], ['in_progress', 'In Progress'], ['solved', 'Solved']];
    const reached = new Set(r.history.map((h) => h.toStatus));
    if (r.status === 'unable_to_resolve') steps[3] = ['unable_to_resolve', 'Unable to Resolve'];
    const stepper = steps.map(([key, label]) => {
      const cls = key === r.status ? `step current st-${key}` : reached.has(key) ? 'step done' : 'step';
      return `<div class="${cls}">${esc(label)}</div>`;
    }).join('');

    let timing = '';
    if (r.isOpen && r.timing.etaAt) {
      const mins = Math.round((Date.parse(r.timing.etaAt) - Date.now()) / 60000);
      timing = mins >= 0
        ? `<div><span class="countdown">${fmtMin(mins)}</span> <span class="muted small">until simulated ETA (${fmtTime(r.timing.etaAt)})</span></div>`
        : `<div class="countdown overdue">ETA passed ${fmtMin(-mins)} ago</div><div class="notice notice-bad">The estimated arrival time has passed and this request is still open.</div>`;
      timing += `<div class="small muted">${esc(r.timing.uncertainty)}</div>`;
    }
    const closedAt = !r.isOpen ? r.history[r.history.length - 1]?.at : null;
    const delivery = r.notification ? {
      pushed_live: 'Delivered live to the police dashboard (in-app).',
      stored: 'Saved; police will see it when their dashboard opens or refreshes.',
      push_failed: 'Saved, but the live update failed; police will see it on refresh.',
    }[r.notification.deliveryStatus] : '';

    return `
      <div class="small muted">Request <strong>${esc(r.id)}</strong> · created ${fmtTime(r.createdAt)}</div>
      <div class="stepper" aria-label="Request status">${stepper}</div>
      <div class="small">${esc(r.statusDescription)}</div>
      ${timing}
      ${r.latestNote ? `<div class="notice notice-info"><strong>Police note:</strong> ${esc(r.latestNote)}</div>` : ''}
      ${closedAt ? `<div class="small">${esc(r.statusLabel)} at ${fmtTime(closedAt)}</div><div class="small muted">${esc(r.etaNote)}</div>` : ''}
      ${r.isOpen ? `<div class="small muted">${esc(delivery)}</div>` : ''}
      <details><summary class="small">Status history (${r.history.length})</summary>
        <ul class="history">${r.history.map((h) => `<li><strong>${esc(h.toStatusLabel)}</strong> · ${fmtTime(h.at)} · ${esc(h.actor)}${h.note ? `<br><span class="muted">${esc(h.note)}</span>` : ''}</li>`).join('')}</ul>
      </details>
      <p class="small muted" style="margin:8px 0">${esc(r.disclaimer)}</p>`;
  }

  // ---- Actions -----------------------------------------------------------------------------
  async function run(button, fn) {
    if (button) button.disabled = true;
    try {
      await fn();
    } catch (err) {
      toast(err.message, 'bad');
      if (err.code === 'not_eligible' || err.status === 409) await refreshTrip();
    } finally {
      if (button && document.body.contains(button)) button.disabled = false;
    }
  }

  const tripPath = (suffix) => `/api/trips/${state.trip.id}${suffix}`;

  const actions = {
    details: (btn) => openHospital(btn.dataset.id),
    'select-dest': (btn) => run(btn, async () => {
      const origin = currentOrigin();
      const body = { cityId: state.cityId, hospitalId: btn.dataset.id, scenarioCode: state.scenarioCode };
      if (origin.id) body.originId = origin.id; else body.origin = { lat: origin.lat, lng: origin.lng };
      const { trip } = await api('POST', '/api/trips', body);
      $('hospital-dialog').close();
      setTrip(trip, { fit: true });
      toast(`Destination set: ${trip.hospital.name}`, 'ok');
    }),
    'select-route': (btn) => run(btn, async () => {
      const { trip } = await api('POST', tripPath('/select-route'), { routeKey: btn.dataset.key });
      setTrip(trip);
    }),
    'refresh-routes': (btn) => run(btn, async () => {
      const { trip } = await api('PATCH', tripPath('/scenario'), { scenarioCode: state.trip.scenario.code });
      setTrip(trip);
      toast('Route data refreshed (simulated).');
    }),
    start: () => { state.confirm = 'start'; renderTrip(); },
    'confirm-start': (btn) => run(btn, async () => {
      const { trip } = await api('POST', tripPath('/start'), { confirm: true });
      state.confirm = null;
      setTrip(trip);
      toast('Demonstration trip started.', 'ok');
    }),
    'cancel-confirm': () => { state.confirm = null; state.assistKey = null; renderTrip(); renderAssist(); },
    'cancel-trip': (btn) => run(btn, async () => {
      await api('POST', tripPath('/cancel'));
      setTrip(null);
      loadHospitals();
      toast('Trip cancelled.');
    }),
    'complete-trip': (btn) => run(btn, async () => {
      await api('POST', tripPath('/complete'));
      setTrip(null);
      loadHospitals();
      toast('Trip completed.', 'ok');
    }),
    assist: () => {
      state.confirm = 'assist';
      state.assistKey = crypto.randomUUID ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      renderAssist();
    },
    'confirm-assist': (btn) => run(btn, async () => {
      // The same key is reused if this button is pressed again, so the server never creates a duplicate.
      const res = await api('POST', '/api/assistance', { tripId: state.trip.id, clientRequestId: state.assistKey, confirm: true });
      state.confirm = null;
      state.assistKey = null;
      toast(res.duplicate ? res.message : `Request ${res.request.id} created. ${res.delivery.message}`, res.duplicate ? '' : 'ok');
      await refreshTrip();
    }),
  };

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (btn && actions[btn.dataset.action]) actions[btn.dataset.action](btn);
  });

  // ---- Live updates --------------------------------------------------------------------------
  function setLive(mode) {
    $('live-dot').className = `live-dot ${mode === 'live' ? 'on' : 'off'}`;
    $('live-text').textContent = mode === 'live' ? 'Live' : 'Reconnecting… (auto-refresh on)';
  }

  function startLiveUpdates() {
    ERAS.connectEvents({
      'assistance.created': () => refreshTrip(),
      'assistance.updated': (d) => {
        toast(`Request ${d.requestId} is now ${STATUS_LABEL[d.status] || d.status}.`, d.status === 'unable_to_resolve' ? 'bad' : 'ok');
        refreshTrip();
      },
      'hospital.updated': () => loadHospitals(),
    }, setLive);
    // Polling fallback: the database is the source of truth even if the live connection drops.
    setInterval(() => { if (state.trip) refreshTrip(); }, 10000);
    // Keep countdowns current between updates.
    setInterval(() => { if (state.trip?.assistanceRequest?.isOpen && state.confirm !== 'assist') renderAssist(); }, 15000);
  }

  // ---- Start-up ------------------------------------------------------------------------------
  function wireControls() {
    $('logout-btn').addEventListener('click', ERAS.logout);
    $('city-select').addEventListener('change', (e) => {
      state.cityId = e.target.value;
      state.originId = city()?.demoOrigins[0]?.id ?? null;
      state.customOrigin = null;
      try { localStorage.setItem('eras.city', state.cityId); } catch { /* storage unavailable */ }
      renderControls();
      fitCity();
      drawOrigin();
      loadHospitals();
    });
    $('origin-select').addEventListener('change', (e) => {
      if (!e.target.value) return;
      state.originId = e.target.value;
      state.customOrigin = null;
      renderControls();
      drawOrigin();
      loadHospitals();
    });
    $('scenario-select').addEventListener('change', async (e) => {
      const code = e.target.value;
      if (state.trip) {
        await run(e.target, async () => {
          const { trip } = await api('PATCH', tripPath('/scenario'), { scenarioCode: code });
          setTrip(trip);
        });
      } else {
        state.scenarioCode = code;
        renderControls();
      }
      state.scenarioCode = state.trip?.scenario.code ?? code;
      renderControls(); // puts the dropdown back if the change failed
      loadHospitals();
    });
    let searchTimer;
    $('hospital-search').addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { state.search = e.target.value.trim(); loadHospitals(); }, 250);
    });
    $('pick-origin-btn').addEventListener('click', () => setPicking(true));
    $('cancel-pick-btn').addEventListener('click', () => setPicking(false));
    $('hd-close').addEventListener('click', () => $('hospital-dialog').close());
  }

  async function init() {
    try {
      state.user = await ERAS.requireUser('driver');
    } catch {
      return; // redirected to login or the correct dashboard
    }
    $('user-name').textContent = state.user.displayName;
    setupMap();
    wireControls();
    try {
      const [{ cities }, { scenarios }, { trip }] = await Promise.all([
        api('GET', '/api/cities'), api('GET', '/api/scenarios'), api('GET', '/api/trips/current'),
      ]);
      state.cities = cities;
      state.scenarios = scenarios;
      let saved = null;
      try { saved = localStorage.getItem('eras.city'); } catch { /* storage unavailable */ }
      state.cityId = trip?.cityId || (cities.some((c) => c.id === saved) ? saved : cities[0].id);
      state.originId = city().demoOrigins[0]?.id ?? null;
      fitCity();
      setTrip(trip, { fit: Boolean(trip) });
      await loadHospitals();
      startLiveUpdates();
    } catch (err) {
      $('hospital-list').innerHTML = `<div class="notice notice-bad">Could not load dashboard data: ${esc(err.message)}</div>`;
    }
  }

  init();
})();
