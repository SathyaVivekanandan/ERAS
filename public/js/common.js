// Shared browser helpers for every ERAS page.
(function () {
  const ROLE_HOME = { driver: '/driver.html', police: '/police.html', admin: '/admin.html' };

  class ApiError extends Error {
    constructor(status, body) {
      super(body?.error?.message || `Request failed (${status})`);
      this.status = status;
      this.code = body?.error?.code;
      this.body = body;
    }
  }

  async function api(method, path, body) {
    let res;
    try {
      res = await fetch(path, {
        method,
        credentials: 'same-origin',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, { error: { code: 'network', message: 'Cannot reach the ERAS server. Check that it is running.' } });
    }
    const data = await res.json().catch(() => null);
    if (res.status === 401 && !path.startsWith('/api/auth/login')) {
      location.href = '/';
      throw new ApiError(401, data);
    }
    if (!res.ok) throw new ApiError(res.status, data);
    return data;
  }

  // Escape text before putting it into HTML.
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const fmtKm = (km) => (km == null ? '—' : `${Number(km).toFixed(km < 10 ? 1 : 0)} km`);
  const fmtMin = (min) => {
    if (min == null) return '—';
    const m = Math.round(min);
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
  };
  const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');
  const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
  function timeAgo(iso) {
    if (!iso) return '—';
    const s = Math.round((Date.now() - new Date(iso)) / 1000);
    if (s < 60) return `${Math.max(s, 0)} s ago`;
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    return `${Math.round(s / 3600)} h ago`;
  }

  const statusBadge = (status, label) => `<span class="badge badge-status st-${esc(status)}">${esc(label)}</span>`;
  const CONGESTION_LABEL = { none: 'Clear', moderate: 'Moderate', severe: 'Severe', blocked: 'Blocked' };
  const congestionBadge = (c) => `<span class="badge cg cg-${esc(c)}">${esc(CONGESTION_LABEL[c] || c)}</span>`;

  function toast(message, kind = '') {
    let box = document.getElementById('toasts');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toasts';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
    }
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = message;
    box.appendChild(el);
    // Keep at most 3 on screen so they never bury the dashboard.
    while (box.children.length > 3) box.firstElementChild.remove();
    setTimeout(() => el.remove(), kind === 'bad' ? 7000 : 4500);
  }

  // Ensures someone is logged in with the right role; otherwise redirects.
  async function requireUser(role) {
    const { user } = await api('GET', '/api/auth/me');
    if (role && user.role !== role) {
      location.href = ROLE_HOME[user.role] || '/';
      throw new Error('wrong role');
    }
    return user;
  }

  async function logout() {
    try { await api('POST', '/api/auth/logout'); } finally { location.href = '/'; }
  }

  // Live updates via Server-Sent Events. onState('live' | 'reconnecting').
  function connectEvents(handlers, onState) {
    const source = new EventSource('/api/events');
    source.onopen = () => onState?.('live');
    source.onerror = () => onState?.('reconnecting'); // the browser retries automatically
    for (const [name, fn] of Object.entries(handlers)) {
      source.addEventListener(name, (e) => fn(JSON.parse(e.data)));
    }
    return source;
  }

  window.ERAS = { ROLE_HOME, api, esc, fmtKm, fmtMin, fmtTime, fmtDateTime, timeAgo, statusBadge, congestionBadge, toast, requireUser, logout, connectEvents };
})();
