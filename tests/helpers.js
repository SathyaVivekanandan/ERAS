// Starts ERAS on a random port with a fresh in-memory database for one test file.
const { createApp } = require('../src/app');

const PASSWORD = 'test-password';

async function startTestApp() {
  const built = createApp({ dbPath: ':memory:', demoPassword: PASSWORD });
  const server = await new Promise((resolve) => {
    const s = built.app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  // api('GET', '/api/x', { cookie, body }) -> { status, body, headers }
  async function api(method, path, { cookie, body } = {}) {
    const headers = {};
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
  }

  async function login(username, password = PASSWORD) {
    const res = await api('POST', '/api/auth/login', { body: { username, password } });
    if (res.status !== 200) throw new Error(`login ${username} failed: ${res.status}`);
    return res.headers.get('set-cookie').split(';')[0];
  }

  // Opens the live event stream as a logged-in user. waitFor(name) resolves when that event arrives.
  async function openEvents(cookie) {
    const controller = new AbortController();
    const res = await fetch(`${base}/api/events`, { headers: { Cookie: cookie }, signal: controller.signal });
    const events = [];
    const listeners = new Set();
    (async () => {
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        for await (const chunk of res.body) {
          buffer += decoder.decode(chunk, { stream: true });
          let end;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const name = /^event: (.*)$/m.exec(block);
            const data = /^data: (.*)$/m.exec(block);
            if (name) {
              events.push({ event: name[1], data: JSON.parse(data[1]) });
              listeners.forEach((fn) => fn());
            }
          }
        }
      } catch { /* stream closed */ }
    })();

    const waitFor = (name, timeoutMs = 2000) => new Promise((resolve, reject) => {
      const check = () => {
        const found = events.find((e) => e.event === name);
        if (found) { listeners.delete(check); clearTimeout(timer); resolve(found); }
      };
      const timer = setTimeout(() => { listeners.delete(check); reject(new Error(`No "${name}" event within ${timeoutMs} ms`)); }, timeoutMs);
      listeners.add(check);
      check();
    });

    return { status: res.status, events, waitFor, close: () => controller.abort() };
  }

  async function stop() {
    built.close();
    await new Promise((resolve) => server.close(resolve));
  }

  return { base, api, login, openEvents, stop, db: built.db, hub: built.hub };
}

module.exports = { startTestApp, PASSWORD };
