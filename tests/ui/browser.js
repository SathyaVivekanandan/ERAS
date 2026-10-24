// Minimal headless Edge/Chrome controller over the Chrome DevTools Protocol (uses Node's global WebSocket).
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CANDIDATES = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

function findBrowser() {
  const found = CANDIDATES.find((p) => fs.existsSync(p));
  if (!found) throw new Error('No Edge or Chrome found. Set BROWSER_PATH to your browser executable.');
  return found;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openBrowser({ port, outDir, width = 1500, height = 950 }) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), `eras-ui-${port}-`));
  const proc = spawn(findBrowser(), ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });

  let target;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* starting */ }
  }
  if (!target) { proc.kill(); throw new Error(`Browser on port ${port} did not start`); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let nextId = 0;
  const pending = new Map();
  const consoleErrors = [];
  ws.addEventListener('message', (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') consoleErrors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') consoleErrors.push(`${msg.params.entry.text} ${msg.params.entry.url || ''}`);
  });
  const send = (method, params = {}) => new Promise((resolve) => { const id = ++nextId; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(`eval failed: ${r.result.exceptionDetails.exception?.description}`);
    return r.result.result.value;
  };
  const waitFor = async (expression, timeoutMs = 8000) => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) { if (await evaluate(expression).catch(() => false)) return true; await sleep(150); }
    return false;
  };

  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

  return {
    send,
    evaluate,
    waitFor,
    consoleErrors,
    goto: (url) => send('Page.navigate', { url }),
    click: (selector) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`),
    text: (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)})?.innerText ?? ''`),
    shot: async (name) => {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(r.result.data, 'base64'));
    },
    // Ignores map-tile network noise and the login page's expected "not signed in yet" probe.
    relevantErrors: () => consoleErrors.filter((e) => !/tile\.openstreetmap\.org/.test(e) && !/401 .*\/api\/auth\/me/.test(e)),
    close: async () => {
      try { ws.close(); } catch { /* closed */ }
      proc.kill();
      await sleep(500); // let the browser release its profile files
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* still locked: temp folder, harmless */ }
    },
  };
}

module.exports = { openBrowser, sleep };
