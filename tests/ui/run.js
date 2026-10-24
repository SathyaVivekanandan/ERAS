// Browser end-to-end check: ambulance driver and traffic police in two separate browser sessions.
// Starts its own ERAS server on a free port with an in-memory database (your data/eras.db is not touched).
// Usage: npm run test:ui      Screenshots are saved to tests/ui/screenshots/
const fs = require('node:fs');
const path = require('node:path');
const { createApp } = require('../../src/app');
const { openBrowser, sleep } = require('./browser');

const PASSWORD = 'ui-test-password';
const OUT = path.join(__dirname, 'screenshots');
const results = [];
const record = (name, passed, detail = '') => {
  results.push(passed);
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail && !passed ? ` – ${detail}` : ''}`);
};

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const built = createApp({ dbPath: ':memory:', demoPassword: PASSWORD });
  const server = await new Promise((resolve) => { const s = built.app.listen(0, () => resolve(s)); });
  const BASE = `http://localhost:${server.address().port}`;

  const login = async (b, username, expectedPath) => {
    await b.goto(`${BASE}/`);
    await b.waitFor("document.querySelector('#login-form') !== null");
    await b.evaluate(`document.querySelector('#username').value='${username}'; document.querySelector('#password').value='${PASSWORD}'; document.querySelector('#login-btn').click(); true`);
    return b.waitFor(`location.pathname === '${expectedPath}'`);
  };
  const setSelect = (b, sel, value) => b.evaluate(`{const s=document.querySelector('${sel}'); s.value='${value}'; s.dispatchEvent(new Event('change'));} true`);

  const police = await openBrowser({ port: 9334, outDir: OUT });
  const driver = await openBrowser({ port: 9335, outDir: OUT });
  try {
    console.log('\n-- Traffic police dashboard (empty) --');
    record('police login opens police dashboard', await login(police, 'police_chennai', '/police.html'));
    record('summary counts load as zero', await police.waitFor("document.querySelector('#s-awaitingAcknowledgement').innerText === '0'"));
    record('empty request list message', (await police.text('#request-list')).includes('No open assistance requests'));
    record('police live connection', await police.waitFor("document.querySelector('#live-text').innerText.toLowerCase() === 'live'"));

    console.log('\n-- Test 1: nearby hospital discovery --');
    record('driver login opens driver dashboard', await login(driver, 'driver1', '/driver.html'));
    record('6 Chennai hospital cards', await driver.waitFor("document.querySelectorAll('.h-card').length === 6", 10000));
    record('list sorted by SIMULATED travel time', (await driver.text('#sort-note')).includes('SIMULATED'));
    record('map shows origin + hospital markers', (await driver.evaluate("document.querySelectorAll('#map .leaflet-interactive').length")) >= 7);
    await driver.click('.h-card .h-name');
    record('hospital details open', await driver.waitFor("document.querySelector('#hospital-dialog').open"));
    const details = await driver.text('#hd-body');
    record('details: Availability Not Connected + phone status', details.includes('Availability Not Connected') && /placeholder|unverified|No contact/i.test(details));
    record('no Call button for unverified/demo numbers', !(await driver.evaluate("[...document.querySelectorAll('#hd-foot a')].some(a => a.textContent.includes('Call'))")));
    await driver.shot('1-driver-hospital-details');
    await driver.click('#hd-close');

    console.log('\n-- Test 5: city switching --');
    await setSelect(driver, '#city-select', 'trichy');
    record('Trichy hospitals load', await driver.waitFor("[...document.querySelectorAll('.h-card')].every(c => c.innerText.includes('Trichy'))"));
    await setSelect(driver, '#city-select', 'chennai');
    record('back to Chennai hospitals', await driver.waitFor("[...document.querySelectorAll('.h-card')].every(c => c.innerText.includes('Chennai'))"));

    console.log('\n-- Test 2: congestion with an alternative --');
    await setSelect(driver, '#scenario-select', 'moderate_alt');
    await driver.waitFor("document.querySelector('#scenario-desc').innerText.includes('moderate')");
    await sleep(300);
    await driver.click('.h-card .h-name');
    await driver.waitFor("document.querySelector('#hospital-dialog').open");
    await driver.click('[data-action="select-dest"]');
    record('3 routes compared', await driver.waitFor("document.querySelectorAll('.route-card').length === 3"));
    record('alternative recommended, no assistance needed', (await driver.text('#routes-body')).includes('Recommended') && (await driver.text('#assist-body')).includes('not needed'));
    record('no request button offered', !(await driver.evaluate("!!document.querySelector('[data-action=\"assist\"]')")));
    await driver.click('[data-action="cancel-trip"]');
    await driver.waitFor("document.querySelector('#trip-body').innerText.includes('No destination')");

    console.log('\n-- Test 3: severe congestion, no alternative (connected workflow) --');
    await setSelect(driver, '#scenario-select', 'severe_no_alt');
    await driver.waitFor("document.querySelector('#scenario-desc').innerText.includes('severely')");
    await sleep(300);
    await driver.click('.h-card .h-name');
    await driver.waitFor("document.querySelector('#hospital-dialog').open");
    await driver.click('[data-action="select-dest"]');
    record('every route rejected with a reason', await driver.waitFor("document.querySelectorAll('.route-card.rejected').length === 3"));
    await driver.click('[data-action="select-route"]');
    await driver.waitFor("document.querySelector('[data-action=\"start\"]') && !document.querySelector('[data-action=\"start\"]').disabled");
    await driver.click('[data-action="start"]');
    record('trip start needs confirmation', await driver.waitFor("document.querySelector('[data-action=\"confirm-start\"]') !== null"));
    await driver.click('[data-action="confirm-start"]');
    record('trip active', await driver.waitFor("document.querySelector('#trip-status-badge').innerText.includes('Trip active')"));
    await driver.click('[data-action="assist"]');
    record('request confirmation warns no real police contacted', await driver.waitFor("document.querySelector('#assist-body').innerText.includes('No real police officer is contacted')"));
    await driver.evaluate("{const b=document.querySelector('[data-action=\"confirm-assist\"]'); b.click(); b.click();} true");
    record('driver sees request as New', await driver.waitFor("document.querySelector('#assist-badge').innerText.includes('New')"));
    await driver.shot('2-driver-request-new');

    record('police list shows request without reload', await police.waitFor("document.querySelectorAll('.r-card').length === 1", 5000));
    record('double click stored only one request', (await police.evaluate("document.querySelectorAll('.r-card').length")) === 1);
    record('bell + summary show 1 unread', await police.waitFor("document.querySelector('#bell-count').innerText === '1' && document.querySelector('#s-newUnread').innerText === '1'"));
    await police.shot('3-police-new-request');
    await police.click('.r-card');
    record('details: route map drawn', await police.waitFor("!document.querySelector('#detail').hidden && document.querySelectorAll('#detail-map path.leaflet-interactive').length >= 2"));
    record('details: 3 rejected routes explained', (await police.evaluate("document.querySelectorAll('.routes-table tbody tr').length")) === 3);
    record('details: ETA countdown with uncertainty', (await police.text('#d-timing')).includes('±40%'));
    record('opening clears unread', await police.waitFor("document.querySelector('#s-newUnread').innerText === '0'"));
    await police.shot('4-police-request-details');

    await police.click('[data-status="unable_to_resolve"]');
    record('Unable to Resolve without reason blocked', await police.waitFor("!document.querySelector('#action-error').hidden"));
    await police.click('[data-status="acknowledged"]');
    record('driver sees Acknowledged live', await driver.waitFor("document.querySelector('#assist-badge').innerText.includes('Acknowledged')", 5000));
    await police.waitFor("document.querySelector('[data-status=\"in_progress\"]') !== null");
    await police.click('[data-status="in_progress"]');
    record('driver sees In Progress live', await driver.waitFor("document.querySelector('#assist-badge').innerText.includes('In Progress')", 5000));
    await police.waitFor("document.querySelector('[data-status=\"solved\"]') !== null");
    await police.evaluate("document.querySelector('#action-note').value = 'Demo: cross traffic held at junction'; true");
    await police.click('[data-status="solved"]');
    record('driver sees Solved + note + time live', await driver.waitFor("document.querySelector('#assist-badge').innerText.includes('Solved') && document.querySelector('#assist-body').innerText.includes('cross traffic held') && /Solved at/.test(document.querySelector('#assist-body').innerText)", 5000));
    record('driver told ETA was not recalculated', (await driver.text('#assist-body')).includes('ETA not recalculated'));
    record('police history: 4 entries with names', (await police.evaluate("document.querySelectorAll('#d-history .history li').length")) === 4);
    record('police summary: solved 1, nothing open', await police.waitFor("document.querySelector('#s-solved').innerText === '1' && document.querySelector('#s-awaitingAcknowledgement').innerText === '0'"));
    await police.shot('5-police-solved');
    await driver.shot('6-driver-solved');

    console.log('\n-- Shared hospital directory: admin edit reaches the driver --');
    const admin = await openBrowser({ port: 9336, outDir: OUT });
    try {
      record('admin login opens admin page', await login(admin, 'admin', '/admin.html'));
      record('admin table lists 6 Chennai hospitals', await admin.waitFor("document.querySelectorAll('#hospital-rows tr').length === 6"));
      await admin.click('[data-edit="ch-h1"]');
      await admin.waitFor("document.querySelector('#edit-dialog').open");
      await admin.evaluate("document.querySelector('#f-phone-status').value = 'verified'; true");
      await admin.click('#edit-save');
      record('demo placeholder number cannot be marked Verified', await admin.waitFor("!document.querySelector('#edit-error').hidden && document.querySelector('#edit-error').innerText.includes('dialable')"));
      await admin.click('#edit-cancel');

      await admin.click('[data-edit="ch-h6"]');
      await admin.waitFor("document.querySelector('#edit-dialog').open");
      await admin.evaluate(`{
        const set = (id, v) => { const el = document.querySelector(id); el.value = v; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); };
        set('#f-phone', '+91 00000 00000'); set('#f-phone-status', 'verified');
        set('#f-availability', 'confirmed_by_authorized_source'); set('#f-source', 'Demo duty manager by phone (fictional)');
      } true`);
      await admin.click('#edit-save');
      record('admin save succeeds and table updates', await admin.waitFor("!document.querySelector('#edit-dialog').open && document.querySelector('#hospital-rows').innerText.includes('+91 00000 00000')"));
      await admin.click('[data-edit="ch-h6"]');
      await admin.waitFor("document.querySelector('#edit-dialog').open");
      await admin.evaluate("document.querySelector('#history-box').open = true; true");
      record('change history shows the edit', await admin.waitFor("document.querySelector('#history-list').innerText.includes('Contact number')"));
      await admin.shot('7-admin-edit-history');
      await admin.click('#edit-cancel');
      record('no browser console errors (admin)', admin.relevantErrors().length === 0, admin.relevantErrors().slice(0, 3).join(' | '));
    } finally {
      await admin.close();
    }
    record('driver list shows the new number live', await driver.waitFor("[...document.querySelectorAll('.h-card')].some(c => c.innerText.includes('+91 00000 00000') && c.innerText.includes('(verified)'))", 5000));
    await driver.click('[data-action="details"][data-id="ch-h6"]');
    await driver.waitFor("document.querySelector('#hospital-dialog').open");
    record('driver details: Call Hospital now offered', await driver.evaluate("[...document.querySelectorAll('#hd-foot a')].some(a => a.textContent.includes('Call Hospital') && a.getAttribute('href') === 'tel:+910000000000')"));
    record('driver details: availability confirmed with source', (await driver.text('#hd-body')).includes('Availability Confirmed by Authorized Source') && (await driver.text('#hd-body')).includes('Demo duty manager'));
    await driver.shot('8-driver-sees-admin-edit');
    await driver.click('#hd-close');

    console.log('\n-- Test 4: refresh and role protection --');
    await police.send('Page.reload');
    record('police reload: records consistent', await police.waitFor("document.querySelector('#s-solved').innerText === '1'", 8000));
    await driver.send('Page.reload');
    record('driver reload: Solved still shown', await driver.waitFor("document.querySelector('#assist-badge')?.innerText.includes('Solved')", 8000));
    await driver.goto(`${BASE}/police.html`);
    record('driver cannot open police dashboard', await driver.waitFor("location.pathname === '/driver.html'"));
    await driver.goto(`${BASE}/admin.html`);
    record('driver cannot open admin page', await driver.waitFor("location.pathname === '/driver.html'"));

    const errs = [...police.relevantErrors(), ...driver.relevantErrors()];
    record('no browser console errors', errs.length === 0, errs.slice(0, 4).join(' | '));
  } finally {
    await Promise.all([police.close(), driver.close()]);
    built.close();
    server.close();
  }

  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} browser checks passed. Screenshots: ${OUT}`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
