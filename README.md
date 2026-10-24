# ERAS – Emergency Route Advisory System

A connected web prototype for the **JJCET AI-PDLC Hackathon**. An ambulance driver finds a nearby hospital,
compares routes and, when severe congestion leaves no suitable alternative, sends an in-app assistance
request to a traffic police dashboard. Police acknowledge and update the request, and the driver's dashboard
shows each change immediately.

> **Demonstration prototype.** All hospitals are **fictional**. All routes, travel times and traffic are
> **SIMULATED DEMO DATA**. Notifications are **in-app only**: no SMS, call, WhatsApp or real police message is
> ever sent. "Solved" means the demo request was marked resolved by the police demo user; it does not mean
> a real road was cleared.

---

## Contents

1. [What it does](#what-it-does)
2. [Technology stack](#technology-stack)
3. [Install and run (Windows)](#install-and-run-windows)
4. [Demo accounts](#demo-accounts)
5. [Configuration (.env)](#configuration-env)
6. [Running the tests](#running-the-tests)
7. [Demo traffic scenarios](#demo-traffic-scenarios)
8. [Project structure](#project-structure)
9. [Database](#database)
10. [API overview](#api-overview)
11. [Known limitations](#known-limitations)
12. [Troubleshooting](#troubleshooting)

Other documents: [Judge demo script](docs/DEMO_SCRIPT.md) · [Test checklist and results](docs/TEST_RESULTS.md)

---

## What it does

**Ambulance Driver Dashboard** (`/driver.html`)
- Choose Chennai or Tiruchirappalli (Trichy) and a demo origin (a list of DEMO LOCATIONs, or a point picked on the map). No GPS is used.
- See nearby hospitals on a Leaflet/OpenStreetMap map and as cards with distance, simulated travel time, address, emergency-capability status and contact number status.
- Open hospital details by clicking a name or marker. "Call Hospital" appears only for a verified, dialable number (none of the fictional seed numbers qualify).
- Select a destination, compare three simulated routes (distance, ETA, congestion, why each is or isn't suitable) and choose one.
- Start the trip after confirmation.
- When eligibility checks pass, request traffic assistance (with confirmation) and follow its status live.

**Traffic Police Dashboard** (`/police.html`)
- Summary counts calculated from stored records.
- Request list sorted by urgency, with an in-app notification bell.
- Request details: route map, congestion zones, ETA countdown with uncertainty, reasons each alternative was rejected, status history.
- Actions: **Acknowledge → Start Assistance → Mark Solved**, or **Unable to Resolve** (a reason is required). The server rejects invalid transitions.

**Hospital Directory Admin** (`/admin.html`)
- Table of each city's hospitals with contact-number status, emergency capability and availability.
- Edit a hospital in a form. A number can be marked **Verified** only if it is really dialable, and confirming availability requires naming who confirmed it (the time is recorded).
- Change history for each hospital shows who changed which field, and when.

**Shared hospital directory.** All three pages read the same `hospitals` table. Admin edits are audited and pushed live to open dashboards, so a driver looking at the list sees the change without reloading.

**How the two dashboards are connected:** one Express server and one SQLite database. The driver's request is saved once. Police read and update that same record. Changes are pushed with Server-Sent Events, and both pages also re-check the server every 10 seconds in case the live connection drops.

---

## Technology stack

| Part | Choice | Why |
|---|---|---|
| Runtime | Node.js **22.13 or newer** (developed on 24.14.1) | Includes a built-in SQLite module, so nothing needs compiling on Windows |
| Server | Express 4.21 | The only npm dependency |
| Database | SQLite via built-in `node:sqlite`, file `data/eras.db` | Persistent, zero setup |
| Live updates | Server-Sent Events plus 10-second polling | Simple and reliable for a demo |
| Front end | Plain HTML, CSS and JavaScript, Leaflet 1.9.4 (CDN, pinned with integrity hashes) | No build step |
| Map tiles | OpenStreetMap standard tiles, with attribution | No API key needed. Light demo use only, per the OSM tile usage policy |
| Tests | `node:test` for the API, headless Edge/Chrome for the browser | No extra test libraries |

There are **no API keys or secrets** in the project. The only secret-like values are the demo password and the session cookies, which stay on the server and in HttpOnly cookies.

---

## Install and run (Windows)

You need **Node.js 22.13+** (check with `node --version`) and an internet connection for map tiles.

```powershell
cd D:\ERAS
npm install
copy .env.example .env      # then edit .env and set DEMO_PASSWORD
npm start
```

Open **http://localhost:3000** and log in.

- On the first start, the database `data\eras.db` is created and filled with demo data.
- Stop the server with **Ctrl + C**.
- To wipe all trips and requests and start fresh (with the server stopped):

```powershell
npm run reset-db
```

> **Important for the demo:** the driver and the police must be logged in in **separate browser sessions**,
> because one browser shares one login cookie. Use one normal window and one **InPrivate/Incognito**
> window, or two different browsers.

If you change `DEMO_PASSWORD` after the database already exists, run `npm run reset-db` so the new password
is applied (passwords are only set when the database is first created).

---

## Demo accounts

| Username | Role | Notes |
|---|---|---|
| `driver1` | Ambulance driver | Can work in either city |
| `driver2` | Ambulance driver | Second driver, cannot see `driver1`'s trips |
| `police_chennai` | Traffic police | Receives only Chennai requests |
| `police_trichy` | Traffic police | Receives only Trichy requests |
| `admin` | Hospital directory admin | Opens the admin page for editing hospitals |

Every account uses the password in `DEMO_PASSWORD`. If no `.env` file exists, the password falls back to `demo123`.

---

## Configuration (.env)

Copy `.env.example` to `.env`. Never commit `.env`.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Web server port |
| `DB_PATH` | `data/eras.db` | SQLite database file |
| `DEMO_PASSWORD` | `demo123` | Password given to every demo account when the database is first created |
| `SESSION_TTL_HOURS` | `12` | Login session length |
| `REQUIRE_SOLVED_NOTE` | `false` | If `true`, police must write a note before marking Solved |
| `STALE_AFTER_MINUTES` | `15` | Route data older than this cannot be used to request assistance (press **Refresh** on the trip) |

---

## Running the tests

```powershell
npm test           # 50 API tests, using a temporary in-memory database
npm run test:ui    # 49 browser checks: driver, police and admin in separate headless browser sessions
```

- `test:ui` needs Microsoft Edge or Google Chrome installed (set `BROWSER_PATH` if it isn't found).
- It starts its own server on a free port with an in-memory database, so your `data\eras.db` is never touched.
- Screenshots are saved to `tests\ui\screenshots\`.

Latest recorded results: [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md).

---

## Demo traffic scenarios

All scenarios are **SIMULATED DEMO DATA** and work in both cities. Each trip offers three routes:
**A** main corridor, **B** inner bypass and **C** outer detour.

| Scenario | A | B | C | Assistance recommended? |
|---|---|---|---|---|
| Normal traffic | clear | clear | clear | No |
| Moderate congestion – alternative available | moderate | clear | clear | No (B is suitable) |
| Severe congestion – no suitable alternative | severe | severe | blocked | **Yes** |
| Road blockage – alternative available | blocked | clear | moderate | No (B is suitable) |
| Road blockage – no suitable alternative | blocked | blocked | severe | **Yes** |
| Routing / traffic data unavailable | – | – | – | No. No routes are shown and nothing is invented |
| Stale traffic data | severe | severe | blocked | No. The data is too old to rely on |

**How routes are simulated.** Each route is a smooth curve between the origin and the hospital. It is *not* snapped to real roads. Distance is the curve length × 1.25. ETAs use assumed speeds: 28 km/h when clear, 16 km/h when moderate, 5 km/h when severe. A blocked route has no ETA.

**Suitable route.** A route is suitable if it is not blocked, not severely congested, and its ETA is within 2× the fastest free-flow ETA.

**Assistance eligibility** (re-checked by the server when the request is made). All of these must be true:
- the data is fresh
- routes exist
- severe congestion or a blockage is present
- no suitable route remains
- the trip is active and belongs to this driver
- the hospital is in the trip's city

---

## Project structure

```
server.js                  Entry point (npm start)
src/
  app.js                   Builds the Express app: shared DB, API routes, static files
  config.js                Reads .env
  http.js                  Errors, cookies, login and role checks
  views.js                 Hospital JSON shape (honest availability/phone labels)
  db/schema.sql            Tables
  db/seed-data.js          Fictional hospitals, demo origins, scenarios, demo users
  db/index.js              Opens DB, creates tables, seeds on first run
  db/reset.js              npm run reset-db
  routes/auth.js           Login / logout / me
  routes/directory.js      Cities, origins, scenarios, hospitals (+ admin edit and change history)
  routes/trips.js          Destination, route comparison, scenario switch, start/complete/cancel
  routes/assistance.js     Create request, list, summary, details, police status changes
  routes/notifications.js  In-app notifications and the live event stream (/api/events)
  services/routing.js      Simulated routes and assistance eligibility checks
  services/status.js       Status labels and allowed transitions
  services/requests.js     Shared request JSON shape for both dashboards
  services/events.js       Server-Sent Events hub
public/
  index.html               Login
  driver.html, js/driver.js   Ambulance Driver Dashboard
  police.html, js/police.js   Traffic Police Dashboard
  admin.html, js/admin.js     Hospital Directory Admin
  css/app.css, js/common.js   Shared styles and helpers
tests/                     API tests (npm test)
tests/ui/                  Browser end-to-end check (npm run test:ui)
docs/                      Demo script, test results
```

---

## Database

There is one SQLite file (`data/eras.db`), shared by every dashboard.

| Table | Purpose |
|---|---|
| `users`, `sessions` | Demo accounts (scrypt-hashed passwords) and login sessions |
| `cities`, `demo_origins` | Chennai/Trichy map settings and DEMO LOCATION points |
| `hospitals` | Shared directory with phone status, emergency-capability verification, availability status and source |
| `demo_scenarios` | The 7 simulated traffic scenarios |
| `trips`, `trip_routes` | A driver's trip and its candidate route summaries |
| `assistance_requests` | One record per request, referencing the trip and hospital, with a unique `client_request_id` to stop duplicates |
| `assistance_status_history` | Every status change: from, to, who, note, when |
| `notifications` | In-app notifications and whether each was delivered live |
| `audit_log` | Admin changes to hospital records |

---

## API overview

All endpoints return JSON. Except for login and the health check, they require a logged-in session.

| Method and path | Who | Purpose |
|---|---|---|
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | anyone | Session handling |
| `GET /api/cities`, `GET /api/scenarios` | logged in | Reference data |
| `GET /api/hospitals?city=&originId=` (or `&lat=&lng=`) `&scenario=&q=` | logged in | Nearby hospitals with simulated estimates |
| `GET /api/hospitals/:id` | logged in | Hospital details |
| `PATCH /api/hospitals/:id` | admin | Edit a hospital (audited) |
| `GET /api/hospitals/:id/audit` | admin | Change history for a hospital |
| `POST /api/trips`, `GET /api/trips/current`, `GET /api/trips/:id` | driver | Plan a trip and compare routes |
| `PATCH /api/trips/:id/scenario` | driver | Switch or refresh the simulated scenario |
| `POST /api/trips/:id/select-route`, `/start`, `/complete`, `/cancel` | driver | Trip actions |
| `POST /api/assistance` | driver | Create a request (`tripId`, `clientRequestId`, `confirm: true`) |
| `GET /api/assistance`, `GET /api/assistance/:id` | driver (own), police (city), admin | Read requests |
| `GET /api/assistance/summary` | police, admin | Dashboard counts |
| `POST /api/assistance/:id/status` | police (own city) | `{ status, note }` |
| `GET /api/notifications`, `POST /api/notifications/read` | logged in | In-app notifications |
| `GET /api/events` | logged in | Server-Sent Events stream |

---

## Known limitations

- **No real data or integrations.** Hospitals are fictional, phone numbers are `DEMO-…` placeholders, and routes and traffic are simulated. There is no live traffic, routing provider, GPS, hospital-capacity feed, SMS or police dispatch.
- **Route geometry is approximate.** Lines are curves between two points, not real roads, and ETAs come from assumed speeds (about ±40% uncertainty is stated in the UI).
- **"Solved" changes only the record, not the route.** Marking a request Solved does not change the routes or ETA. The driver can switch scenario to recompute (the UI says "ETA not recalculated").
- **Hospital availability is never confirmed in the seed data.** Every hospital shows "Availability Not Connected". An admin can mark availability as confirmed, but only by naming a source, and a timestamp is recorded.
- **Simple admin page.** It edits existing hospitals only. It cannot add or delete hospitals, manage users, or edit cities and demo origins (change `src/db/seed-data.js` and run `npm run reset-db` for those).
- **One open trip per driver.** A driver who already has a trip planned or started can't plan another until it is completed or cancelled.
- **Simplified police city routing.** A police account sees one city's requests. There are no officer assignments or areas within a city.
- **Separate browser sessions needed.** Driver and police must use different browser sessions (for example an InPrivate window).
- **Map tiles need internet.** Without it the map background is blank, but markers, routes and every workflow still work.
- **Not production-grade security.** The prototype has login, role checks, server-side validation and HttpOnly cookies, but no HTTPS, CSRF tokens, rate limiting or password policy.
- **SQLite and a single server process.** Fine for a demo, but not designed for many concurrent users.
- **Experimental SQLite module.** `node:sqlite` is marked experimental in Node 24. The npm scripts hide the warning.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Port 3000 is already in use` | Stop the other program, or set `PORT=3001` in `.env` |
| Login says "Incorrect username or password" | Use the password in `.env` (`DEMO_PASSWORD`). If you changed it after the first run, stop the server and run `npm run reset-db` |
| Logging in as police logs the driver out | Use an InPrivate/Incognito window or a second browser for the second user |
| Map background is grey | No internet or tiles blocked. Markers and routes still work |
| "Assistance not requested: … stale" | Route data is older than `STALE_AFTER_MINUTES`. Press **Refresh** on the trip panel |
| `npm run test:ui` can't find a browser | Set `BROWSER_PATH` to your Edge or Chrome executable |
| `node:sqlite` not found | Upgrade Node.js to 22.13 or newer |
#   E R A S  
 