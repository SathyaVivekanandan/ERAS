# ERAS – Judge Demonstration Script

**Length:** about 6 minutes for the core story, plus optional extras.
**Presenters:** one person can do it alone, switching between two windows.

---

## Before the judges arrive (5 minutes)

1. Stop any running server, then reset to clean demo data:
   ```powershell
   cd D:\ERAS
   npm run reset-db
   npm start
   ```
2. **Window 1 (normal browser window):** open http://localhost:3000 and log in as **`driver1`**.
3. **Window 2 (InPrivate / Incognito window, or a different browser):** open http://localhost:3000 and log in as **`police_chennai`**.
   *(It must be a separate session, because one browser shares one login.)*
4. Put the windows side by side. Check that both show a green **LIVE** pill in the top bar.
5. Driver window: City = **Chennai**, Origin = **DEMO LOCATION – Guindy area**, Scenario = **Normal traffic**.
6. Optional backup: run `npm run test:ui` beforehand. It produces screenshots in `tests\ui\screenshots\` that you can show if the live demo has problems.

---

## Opening line (20 seconds)

> "ERAS helps an ambulance driver pick a nearby hospital, compare routes, and, only when severe congestion
> leaves no suitable alternative, ask traffic police for help. Both dashboards share one backend and one
> database. Everything you'll see is clearly labelled demo data: the hospitals are fictional, the traffic
> is simulated, and no real police are contacted."

Point at the yellow **SIMULATED DEMO DATA** pill and the demo banner.

---

## Core story

### 1. Find a nearby hospital (driver window, about 1 minute)

- Show the map: the dark marker is the ambulance origin, labelled **DEMO LOCATION** ("we never fake a GPS position").
- Show the hospital list:
  - It is sorted by simulated travel time from the selected origin.
  - Each card shows ETA, route distance, emergency-capability badge and phone status.
- Click **Lakeview Emergency & Trauma Centre (Demo)**. In the details window, point out:
  - **Availability Not Connected**, with the note *"a directory entry does not confirm current capacity"*.
    > "We never invent beds or ICU capacity."
  - The phone is a **DEMO placeholder**, so there is no Call button. A Call button only appears for a verified, dialable number.
- Close the window.

### 2. Normal comparison, no police needed (optional, 30 seconds)

- Change Scenario to **Moderate congestion – alternative available**. Open Lakeview, then **Select as Destination**.
- Route comparison:
  - Route A is moderately congested.
  - Route B is marked **Recommended**.
  - The assistance panel says *"A suitable route is available. Traffic assistance is not needed."*
  > "Congestion alone never generates a police request."
- Click **Cancel** on the trip.

### 3. Severe congestion, no alternative (driver window, about 1.5 minutes)

- Set Scenario to **Severe congestion – no suitable alternative**.
- Open Lakeview, then **Select as Destination**.
- Show the map and the route comparison:
  - A and B are red (severe), C is dashed (blocked). Congestion zones are drawn as circles.
  - Every route shows *why* it was rejected.
- Open **Eligibility checks** in the assistance panel. All four are ticked:
  - the data is fresh
  - routes were found
  - severe congestion or a blockage is present
  - no suitable alternative remains
- Click **Use this route** on Route A, then **Start trip**, then **Confirm start**.
- Click **Request traffic assistance**. Read the warning aloud: *"internal in-app request … No real police officer is contacted."*
- Click **Confirm request**. You may double-click on purpose:
  > "Double-clicks can't create duplicates; the browser sends a single request key."
- The driver panel shows the request ID and status **New**, with a countdown to the simulated ETA.

### 4. Police receive and act (police window, about 2 minutes)

- Without touching the police window, show that it has already updated:
  - a red notification toast
  - the **Notifications** bell showing **1**
  - **New (unread) = 1** and **Awaiting acknowledgement = 1**
  - the request card in the list
- Click the card. The details show:
  - the map with the route and congestion zones
  - the countdown and ETA with *"±40% uncertainty"*
  - destination and affected area
  - the "Why assistance was requested" box
  - the **Routes considered** table with the reason each was rejected
- Point out that only the valid actions are offered. Click **Unable to Resolve** without a note: it is blocked and asks for a reason.
- Click **Acknowledge**. *Look at the driver window:* the stepper moves to **Acknowledged**.
- Click **Start Assistance**. *Driver window:* **In Progress**.
- Type a note: `Demo: cross traffic held at the junction`, then click **Mark Solved**.

### 5. Driver sees the result (driver window, about 30 seconds)

- The driver window now shows:
  - **Solved**, with the time it was solved
  - the **Police note**
  - *"ETA not recalculated: changing the request status does not change the simulated route data."*
  > "We don't pretend the road is now clear. Solved means the demo request was marked resolved."
- Open **Status history**. It lists four entries, each with who made the change and when.
- Press **F5** in both windows. Everything is still there, because it is stored in the database.

---

## Optional extras (if judges ask)

| Question | Show |
|---|---|
| "What if routing data is down?" | Scenario **Routing / traffic data unavailable**: no routes and no invented times. The hospital list falls back to *straight-line distance*, clearly labelled. |
| "What if the data is old?" | Scenario **Stale traffic data**: the congestion is shown, but assistance is refused because the data is stale. |
| "Does Trichy work?" | Cancel the trip and switch City to **Tiruchirappalli**. It has its own fictional hospitals, demo origins and all scenarios. Requests go to `police_trichy`, not Chennai. |
| "Can a driver change the status?" | No. The server allows only police of the request's city to change it, and only along valid transitions. This is covered by the API tests. |
| "What if police aren't online?" | The request is still saved. The driver is told *"No police dashboard is open right now; it will appear when one is opened."* |
| "Is the hospital directory really shared?" | In a third session, log in as **`admin`**, edit a Chennai hospital (for example give Riverside Nursing Home **a phone number your team owns, such as a teammate's mobile, never a random number**, mark it Verified, and confirm availability naming a source), then **Save**. The driver's hospital list updates without a reload, and its details now show **Call Hospital** and who confirmed availability. Open **Change history** in the admin form to show the audit trail. Run `npm run reset-db` afterwards to restore the demo data. |
| "How do you know it works?" | `npm test` (50 API tests) and `npm run test:ui` (49 browser checks across separate driver, police and admin sessions). See [TEST_RESULTS.md](TEST_RESULTS.md). |

---

## Closing line (15 seconds)

> "One shared backend, one stored request, two connected dashboards, and an honest label on everything
> simulated. A real deployment would plug in an authorised routing and traffic provider and a real
> hospital-capacity source in place of the simulation, with no change to the workflow."

---

## If something goes wrong

| Symptom | Recovery |
|---|---|
| Police window logged out the driver | You used the same browser session. Use an InPrivate window for police. |
| Police didn't update instantly | Wait up to 10 seconds (automatic refresh), or press F5. The request is stored either way. |
| "Assistance not requested: … stale" | The trip was planned more than 15 minutes ago. Press **Refresh** on the trip panel. |
| "You already have an active trip" | Click **Cancel trip** first, or run `npm run reset-db` (server stopped). |
| Grey map background | No internet. Markers, routes and the workflow still work. |
