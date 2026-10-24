# ERAS – Test Checklist and Actual Results

**Recorded:** 25 Oct 2026 · Windows 11 · Node.js v24.14.1 · Microsoft Edge (headless) · commit after `69347ad`

Only tests that were **actually executed** are marked ✅. Items that were not executed are marked ⚠️, with a
note on how to check them by hand.

| Suite | Command | Result |
|---|---|---|
| API tests (in-memory database) | `npm test` | **49 / 49 passed** |
| Browser end-to-end (driver and police in two separate headless browser sessions) | `npm run test:ui` | **39 / 39 passed** |

How to re-run: see [README → Running the tests](../README.md#running-the-tests).

---

## Checklist against the required tests

### Test 1 – Nearby hospital discovery

| Step | Result | Evidence |
|---|---|---|
| Log in as ambulance driver | ✅ | UI: *driver login opens driver dashboard*; API: *driver can log in…* |
| Select Chennai or Trichy | ✅ | UI: *Trichy hospitals load*, *back to Chennai hospitals* |
| Set a demo origin | ✅ | UI uses the default DEMO LOCATION; API: *custom demo point inside the city works; outside is rejected* |
| Nearby hospitals appear | ✅ | UI: *6 Chennai hospital cards*, *map shows origin + hospital markers* |
| Distance and estimated travel time shown | ✅ | UI: *list sorted by SIMULATED travel time*; API: *hospitals are sorted by simulated ETA…*, *distances follow the selected origin…* |
| Click hospital name: details and contact | ✅ | UI: *hospital details open*, *details: Availability Not Connected + phone status*, *no Call button for unverified/demo numbers* |
| Click hospital **map marker**: details | ⚠️ Not automated | Marker clicks use the same code as name clicks. Check by hand: click a blue or grey map marker |
| Select destination and view candidate routes | ✅ | UI: *3 routes compared*; API: *normal traffic: three ranked simulated routes…* |
| Pick an origin by clicking the map | ⚠️ Not automated in the browser | The server side is tested (custom point accepted or rejected). Check by hand: **Pick origin on map**, then click the map |

### Test 2 – Congestion with an alternative

| Step | Result | Evidence |
|---|---|---|
| Moderate congestion: alternative displayed | ✅ | UI: *alternative recommended, no assistance needed*; API: *moderate congestion: alternative shown…* |
| No unnecessary police request generated | ✅ | UI: *no request button offered*; API: *no request when a suitable alternative exists* returns 422, with zero requests stored |
| Road blockage with an alternative | ✅ | API: *road blockage with alternative: blocked route cannot be selected* |

### Test 3 – Severe congestion without an alternative

| Step | Result | Evidence |
|---|---|---|
| Eligibility rules checked | ✅ | UI: *every route rejected with a reason*; API: *severe congestion with no alternative: assistance recommended, every check explained*, *blockage with no alternative…* |
| Driver requests assistance (with confirmation) | ✅ | UI: *request confirmation warns no real police contacted*, *driver sees request as New* |
| Request stored, police notified in-app | ✅ | UI: *police list shows request without reload*, *bell + summary show 1 unread*; API: FULL WORKFLOW test, which also checks Trichy police are *not* notified |
| Police acknowledges, driver sees it | ✅ | UI: *driver sees Acknowledged live* |
| In Progress, then Solved | ✅ | UI: *driver sees In Progress live*, *driver sees Solved + note + time live* |
| Final status, timestamp and note visible to driver | ✅ | UI: *driver sees Solved + note + time live*, *driver told ETA was not recalculated* |
| History shows who changed what and when | ✅ | UI: *police history: 4 entries with names*; API: history actors and timestamps asserted |

### Test 4 – Failure handling

| Step | Result | Evidence |
|---|---|---|
| Missing origin or destination | ✅ API | *missing origin or destination is rejected* (400 `missing_origin` / `missing_destination`). In the UI, **Select as Destination** is disabled without an origin (not automated) |
| Routing provider failure | ✅ API | *routing data unavailable: no routes, warning, no recommendation, cannot start*; *without route data the list falls back to labelled straight-line distance* |
| Stale data | ✅ API | *stale data: severe congestion shown but no assistance recommendation*; *no request with stale or unavailable data* (also covers fresh data that has aged) |
| Duplicate submissions | ✅ | API: *duplicate submissions return the original request* (simultaneous calls and a second key); UI: *double click stored only one request* |
| Unauthorized status change | ✅ API | FULL WORKFLOW test: driver 403, admin 403, other-city police 403, New→Solved 409, unknown status 400; *only admin can edit hospitals* |
| Unable to Resolve requires a reason | ✅ | UI: *Unable to Resolve without reason blocked*; API: `note_required` |
| Refresh both dashboards: records consistent | ✅ | UI: *police reload: records consistent*, *driver reload: Solved still shown* |
| Request saved when no police dashboard is open | ✅ API | *request is stored even when no police dashboard is connected* |
| ETA passes before resolution: warning shown, not hidden | ✅ API | *overdue requests stay visible with a warning* (counted in the summary). The UI wording was checked by reading the code, not by an automated test |
| Role protection in the browser | ✅ | UI: *driver cannot open police dashboard* |

### Test 5 – City switching

| Step | Result | Evidence |
|---|---|---|
| Switch Chennai ↔ Trichy | ✅ | UI: *Trichy hospitals load*, *back to Chennai hospitals* |
| Correct hospitals and demo origins per city | ✅ | API: *both cities are listed with their demo origins*, *origin from another city is rejected* |
| Scenarios supported in both cities | ✅ | API: assistance tests run severe-congestion trips in **both** Chennai and Trichy |
| Map recentres on the new city | ⚠️ Not asserted | It recentres in code (`fitCity`). Check by eye when switching |

---

## Defects found during testing and fixed

| Found by | Defect | Fix |
|---|---|---|
| API test | Login check applied to every `/api/*` path, so unknown paths returned 401 instead of 404 | Login check is now applied per route |
| Browser check | Notifications piled up and covered the Traffic Assistance panel | At most 3 on screen at a time |
| Browser check (screenshot) | Current status step had white text on light grey (unreadable) | Status colours now apply to the current step |
| Browser check | Missing page icon caused a 404 browser error | Added an inline icon |
| Code review | Police page showed "Live" before the event stream connected | The indicator is set only by the real connection |

---

## Full list of executed checks

### API tests – `npm test` (49 / 49 passed)

- ✅ no request when a suitable alternative exists (moderate congestion)
- ✅ no request with stale or unavailable data
- ✅ request requires confirmation, a request key and an active trip
- ✅ FULL WORKFLOW: severe congestion -> request -> live police notification -> status updates -> driver sees Solved
- ✅ duplicate submissions return the original request
- ✅ request is stored even when no police dashboard is connected
- ✅ overdue requests stay visible with a warning
- ✅ police list puts open requests first, soonest ETA first
- ✅ records persist after restart-style re-read (same database rows)
- ✅ health endpoint reports demonstration mode
- ✅ driver can log in and is identified as a driver
- ✅ police user logs in with their city
- ✅ wrong password and unknown user are rejected
- ✅ missing fields and invalid JSON return 400
- ✅ /me without a session returns 401
- ✅ logout ends the session
- ✅ unknown API path returns JSON 404
- ✅ directory requires login
- ✅ both cities are listed with their demo origins
- ✅ scenarios are labelled as simulated
- ✅ hospitals are sorted by simulated ETA from the selected origin
- ✅ distances follow the selected origin, not a fixed city centre
- ✅ custom demo point inside the city works; outside is rejected
- ✅ origin from another city is rejected
- ✅ without route data the list falls back to labelled straight-line distance
- ✅ no origin selected: sorted by name, no distances invented
- ✅ search filters by name
- ✅ invalid city and unknown hospital are reported
- ✅ seed data never claims availability or a callable number
- ✅ only admin can edit hospitals
- ✅ a demo placeholder number cannot be marked verified
- ✅ confirming availability requires a source and records a timestamp
- ✅ admin edits are shared: the driver sees the change and it is audited
- ✅ only drivers can use trips
- ✅ missing origin or destination is rejected
- ✅ normal traffic: three ranked simulated routes, no assistance recommended
- ✅ moderate congestion: alternative shown, assistance not recommended
- ✅ road blockage with alternative: blocked route cannot be selected
- ✅ severe congestion with no alternative: assistance recommended, every check explained
- ✅ blockage with no alternative: assistance recommended
- ✅ routing data unavailable: no routes, warning, no recommendation, cannot start
- ✅ stale data: severe congestion shown but no assistance recommendation
- ✅ choosing a new destination replaces the unstarted plan
- ✅ start requires a selected route and explicit confirmation
- ✅ a new plan is refused while a trip is active
- ✅ switching scenario recomputes routes and drops a selection that became blocked
- ✅ another driver cannot see or change the trip
- ✅ trip state survives a reload (stored in the database)
- ✅ completing a trip ends it; completed trips cannot be changed

### Browser checks – `npm run test:ui` (39 / 39 passed)

**Traffic police dashboard (empty)**

- ✅ police login opens police dashboard
- ✅ summary counts load as zero
- ✅ empty request list message
- ✅ police live connection

**Test 1: nearby hospital discovery**

- ✅ driver login opens driver dashboard
- ✅ 6 Chennai hospital cards
- ✅ list sorted by SIMULATED travel time
- ✅ map shows origin + hospital markers
- ✅ hospital details open
- ✅ details: Availability Not Connected + phone status
- ✅ no Call button for unverified/demo numbers

**Test 5: city switching**

- ✅ Trichy hospitals load
- ✅ back to Chennai hospitals

**Test 2: congestion with an alternative**

- ✅ 3 routes compared
- ✅ alternative recommended, no assistance needed
- ✅ no request button offered

**Test 3: severe congestion, no alternative (connected workflow)**

- ✅ every route rejected with a reason
- ✅ trip start needs confirmation
- ✅ trip active
- ✅ request confirmation warns no real police contacted
- ✅ driver sees request as New
- ✅ police list shows request without reload
- ✅ double click stored only one request
- ✅ bell + summary show 1 unread
- ✅ details: route map drawn
- ✅ details: 3 rejected routes explained
- ✅ details: ETA countdown with uncertainty
- ✅ opening clears unread
- ✅ Unable to Resolve without reason blocked
- ✅ driver sees Acknowledged live
- ✅ driver sees In Progress live
- ✅ driver sees Solved + note + time live
- ✅ driver told ETA was not recalculated
- ✅ police history: 4 entries with names
- ✅ police summary: solved 1, nothing open

**Test 4: refresh and role protection**

- ✅ police reload: records consistent
- ✅ driver reload: Solved still shown
- ✅ driver cannot open police dashboard
- ✅ no browser console errors
