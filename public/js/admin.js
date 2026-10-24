// Hospital Directory Admin. Edits the shared hospitals table through the admin-only API.
(() => {
  const { api, esc, fmtDateTime, toast } = ERAS;
  const $ = (id) => document.getElementById(id);

  const DIALABLE_PHONE = /^\+?[0-9][0-9 -]{5,19}$/; // same rule the server enforces
  const PHONE_LABEL = { verified: 'Verified', unverified: 'Unverified', demo_placeholder: 'Demo placeholder', unavailable: 'Unavailable' };
  const FIELD_LABEL = {
    name: 'Name', address: 'Address', phone: 'Contact number', phone_status: 'Number status',
    emergency_capability: 'Emergency capability', verification_note: 'Verification note',
    availability_status: 'Availability', availability_source: 'Availability confirmed by',
    availability_confirmed_at: 'Availability confirmed at', verified_by: 'Verified by', verified_at: 'Verified at',
  };

  const VALUE_LABEL = {
    phone_status: PHONE_LABEL,
    emergency_capability: { verified: 'Verified', unverified: 'Unverified' },
    availability_status: { not_connected: 'Not connected', confirmed_by_authorized_source: 'Confirmed by authorized source' },
  };
  // Shows a stored value in readable form for the change history.
  function fmtValue(field, value) {
    if (value === null || value === undefined || value === '') return '—';
    if (field.endsWith('_at')) return fmtDateTime(value);
    return VALUE_LABEL[field]?.[value] ?? String(value);
  }

  const state = { cities: [], cityId: null, hospitals: [], editing: null };

  async function loadHospitals() {
    $('hospital-rows').innerHTML = '<tr><td colspan="6" class="loading">Loading hospitals…</td></tr>';
    try {
      const { hospitals } = await api('GET', `/api/hospitals?city=${encodeURIComponent(state.cityId)}`);
      state.hospitals = hospitals;
      renderTable();
    } catch (err) {
      $('hospital-rows').innerHTML = `<tr><td colspan="6"><div class="notice notice-bad">${esc(err.message)}</div></td></tr>`;
    }
  }

  function renderTable() {
    $('hospital-count').textContent = `(${state.hospitals.length})`;
    $('hospital-rows').innerHTML = state.hospitals.map((h) => `
      <tr>
        <td><strong>${esc(h.name)}</strong><span class="small muted">${esc(h.address)}</span></td>
        <td>${h.phone ? esc(h.phone) : '—'}<span class="small muted">${esc(PHONE_LABEL[h.phoneStatus])}</span></td>
        <td><span class="badge ${h.emergencyCapability === 'verified' ? 'badge-verified' : 'badge-unverified'}">${esc(h.emergencyCapabilityLabel)}</span>
          ${h.verifiedBy ? `<span class="small muted">by ${esc(h.verifiedBy)}, ${fmtDateTime(h.verifiedAt)}</span>` : ''}</td>
        <td>${esc(h.availability.label)}${h.availability.confirmedAt ? `<span class="small muted">${esc(h.availability.source)}, ${fmtDateTime(h.availability.confirmedAt)}</span>` : ''}</td>
        <td class="small">${fmtDateTime(h.updatedAt)}</td>
        <td><button class="btn btn-sm" type="button" data-edit="${esc(h.id)}">Edit</button></td>
      </tr>`).join('');
  }

  // ---- Edit dialog -----------------------------------------------------------------------
  function syncAvailabilityFields() {
    const confirmed = $('f-availability').value === 'confirmed_by_authorized_source';
    $('source-field').hidden = !confirmed;
    $('availability-help').textContent = confirmed
      ? 'The current time will be recorded as the confirmation time. Drivers will see who confirmed it and when.'
      : 'Drivers will see "Availability Not Connected" and be told to contact the hospital directly.';
  }

  async function openEditor(id) {
    const h = state.hospitals.find((x) => x.id === id);
    if (!h) return;
    state.editing = h;
    $('edit-title').textContent = `Edit: ${h.name}`;
    $('edit-sub').textContent = `${h.id} · last updated ${fmtDateTime(h.updatedAt)}`;
    $('f-name').value = h.name;
    $('f-address').value = h.address;
    $('f-phone').value = h.phone || '';
    $('f-phone-status').value = h.phoneStatus;
    $('f-capability').value = h.emergencyCapability;
    $('f-note').value = h.verificationNote || '';
    $('f-availability').value = h.availability.status;
    $('f-source').value = h.availability.source || '';
    $('edit-error').hidden = true;
    syncAvailabilityFields();
    $('edit-dialog').showModal();
    loadHistory(h.id);
  }

  async function loadHistory(id) {
    $('history-list').innerHTML = '<span class="muted">Loading…</span>';
    try {
      const { entries } = await api('GET', `/api/hospitals/${encodeURIComponent(id)}/audit`);
      $('history-list').innerHTML = entries.length
        ? `<ul class="history">${entries.map((e) => `<li><strong>${fmtDateTime(e.at)}</strong> · ${esc(e.by || 'unknown')}
            ${e.changes.map((c) => `<br>${esc(FIELD_LABEL[c.field] || c.field)}: <span class="muted">${esc(fmtValue(c.field, c.from))}</span> → ${esc(fmtValue(c.field, c.to))}`).join('')}</li>`).join('')}</ul>`
        : '<span class="muted">No changes since the demo data was created.</span>';
    } catch (err) {
      $('history-list').innerHTML = `<span class="muted">${esc(err.message)}</span>`;
    }
  }

  // Builds a request containing only the fields the admin actually changed.
  function changedFields(h) {
    const body = {};
    const text = (id) => $(id).value.trim();
    if (text('f-name') !== h.name) body.name = text('f-name');
    if (text('f-address') !== h.address) body.address = text('f-address');
    if (text('f-note') && text('f-note') !== (h.verificationNote || '')) body.verification_note = text('f-note');
    const phone = text('f-phone') || null;
    if (phone !== (h.phone || null)) body.phone = phone;
    if ($('f-phone-status').value !== h.phoneStatus) body.phone_status = $('f-phone-status').value;
    if ($('f-capability').value !== h.emergencyCapability) body.emergency_capability = $('f-capability').value;

    const availability = $('f-availability').value;
    if (availability === 'confirmed_by_authorized_source') {
      if (h.availability.status !== availability || text('f-source') !== (h.availability.source || '')) {
        body.availability_status = availability;
        body.availability_source = text('f-source');
      }
    } else if (h.availability.status !== availability) {
      body.availability_status = availability;
    }
    return body;
  }

  function validate(body) {
    if ($('f-name').value.trim() === '' || $('f-address').value.trim() === '') return 'Name and address are required.';
    const phone = $('f-phone').value.trim();
    if ($('f-phone-status').value === 'verified' && !DIALABLE_PHONE.test(phone)) {
      return 'Only a real dialable number (digits, spaces, dashes, optional +) can be marked Verified.';
    }
    if (body.availability_status === 'confirmed_by_authorized_source' && !body.availability_source) {
      return 'Enter who confirmed availability.';
    }
    return null;
  }

  async function save(e) {
    e.preventDefault();
    const h = state.editing;
    const body = changedFields(h);
    const errorBox = $('edit-error');
    errorBox.hidden = true;
    const problem = validate(body);
    if (problem) {
      errorBox.textContent = problem;
      errorBox.hidden = false;
      return;
    }
    if (Object.keys(body).length === 0) {
      errorBox.textContent = 'No changes to save.';
      errorBox.hidden = false;
      return;
    }
    $('edit-save').disabled = true;
    try {
      const { hospital, changed } = await api('PATCH', `/api/hospitals/${encodeURIComponent(h.id)}`, body);
      toast(`Saved ${hospital.name}: ${changed.map((f) => FIELD_LABEL[f] || f).join(', ') || 'no changes'}.`, 'ok');
      $('edit-dialog').close();
      await loadHospitals();
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.hidden = false;
    } finally {
      $('edit-save').disabled = false;
    }
  }

  // ---- Start-up --------------------------------------------------------------------------------
  async function init() {
    let user;
    try {
      user = await ERAS.requireUser('admin');
    } catch {
      return; // redirected to login or the correct dashboard
    }
    $('user-name').textContent = user.displayName;
    $('logout-btn').addEventListener('click', ERAS.logout);
    $('edit-form').addEventListener('submit', save);
    $('edit-close').addEventListener('click', () => $('edit-dialog').close());
    $('edit-cancel').addEventListener('click', () => $('edit-dialog').close());
    $('f-availability').addEventListener('change', syncAvailabilityFields);
    $('f-phone').addEventListener('input', () => {
      if (!$('f-phone').value.trim()) $('f-phone-status').value = 'unavailable';
    });
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-edit]');
      if (btn) openEditor(btn.dataset.edit);
    });
    $('city-select').addEventListener('change', (e) => { state.cityId = e.target.value; loadHospitals(); });

    try {
      const { cities } = await api('GET', '/api/cities');
      state.cities = cities;
      state.cityId = cities[0].id;
      $('city-select').innerHTML = cities.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
      await loadHospitals();
    } catch (err) {
      $('hospital-rows').innerHTML = `<tr><td colspan="6"><div class="notice notice-bad">${esc(err.message)}</div></td></tr>`;
    }
  }

  init();
})();
