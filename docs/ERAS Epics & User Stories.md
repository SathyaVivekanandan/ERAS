ERAS Epics & User Stories

Oct 25, 2026 · @Thanu

Overview

The ERAS backlog has 7 epics and 25 user stories, plus 7 non-functional stories. They come from the ERAS MRD v1.0 and PRD v1.0 (both 24 October 2026). Every P0 story maps to a PRD functional requirement (FR) or business rule (BR).

Personas

Ambulance driver: picks a hospital, compares routes and ETAs, confirms a route, and tracks alert status.

Designated traffic-police officer: receives qualifying alerts, then acknowledges and resolves them.

Team roles (Business Analyst, Developer, QA) own the enabler stories in E0.

Story format: As a role, I want capability, so that benefit. Acceptance criteria use Given / When / Then. Priorities follow the PRD: P0 = must demo, P1 = if time remains.

E0 is a pre-build gate. Its stories must be approved by the mentor before E2 and E3 are coded.

Epic summary

Epics and user stories

E0 Build readiness (P0 gate)

These enabler stories close the open approval gates in MRD §9 and PRD §5. E2 and E3 must not start until they are done.

US-0.1 Confirm map and routing API access

As the developer, I want confirmed map, routing and traffic API access, so that we can commit to live routing or agree a fallback.

Given the Google Maps Platform project, when it is checked, then the key, billing, enabled services, quotas and cost are recorded.

Given local traffic coverage is unverified, when it is tested in the demo area, then the result is recorded.

Given live access is not available, when the mentor reviews it, then a fallback is approved and clearly labelled as simulated.

Simulated data can never trigger a real police alert.

US-0.2 Approve alert rule definitions

As the business analyst, I want measurable definitions of "severe congestion" and "suitable alternative" approved by the mentor, so that the alert rule can be built and tested.

Both definitions are written as testable conditions and signed off by the mentor.

The incident and deduplication key for BR-05 is agreed.

No unapproved threshold (such as the earlier 10-minute idea) is hard-coded.

US-0.3 Configure the designated police recipient

As the business analyst, I want the designated police recipient and the no-recipient fallback agreed, so that alerts have a known destination.

The demo recipient (team or officer account) is named and configured.

The behaviour when no recipient is available is agreed and documented.

Who designates officers, and how availability is known, is recorded or listed as an open question.

E1 Hospital destination (P0)

The driver can set an origin and choose a hospital. Source: FR-01.

US-1.1 Set the trip origin

As an ambulance driver, I want to use my current location or enter an origin, so that routes start from where I am.

Given I allow location access, when I open the map, then my current location is set as the origin.

Given I deny location access, when I open the map, then I can enter the origin manually.

Location is used only for routing and alert handling.

US-1.2 View nearby hospitals on the map

As an ambulance driver, I want to see nearby hospitals on a map, so that I can pick a destination quickly.

Given a valid origin and a valid search response, when the map loads, then nearby hospitals are shown within the agreed search bounds.

No bed or capacity information is shown.

US-1.3 Select a hospital destination

As an ambulance driver, I want to select a hospital as my destination, so that ERAS can find routes to it.

Given hospitals are shown, when I select one, then it is set as the destination and named on screen.

Given a destination is set, when I select another hospital, then the destination changes.

US-1.4 Search for a hospital manually

As an ambulance driver, I want to search for a hospital by name, so that I can still set a destination when none is listed nearby.

Given the nearby list is empty, when the map loads, then I see a message and a manual search option.

Given my search has no match, when results return, then I see "no results" and no invented hospitals.

Non-functional stories

These apply across all epics and come from PRD §6 and §10. All are P0 except where noted.

Traceability and open questions

Every PRD functional requirement and business rule is covered by at least one story.

Open questions for the mentor

☐ What measurable rule defines "severe congestion" for the demo?

☐ What makes an alternative route "suitable"?

☐ What identifies one incident for deduplication?

☐ Who designates officers, and how is their availability known?

☐ What happens when no officer can receive an alert?

☐ Can an officer resolve an alert directly from Pending, or must it be acknowledged first? (Stories assume acknowledged first, per BR-04.)

☐ Which route is highlighted when two routes have the same ETA?

☐ What are the hospital search bounds and the data retention period?

☐ Is a no-route response eligible for an alert, and under which rule?

Story points are not set; the team can add them at sprint planning.

E2 Route options and confirmation (P0)

The driver compares routes returned by the routing service and stays in control of the choice. Source: FR-02, FR-03.

US-2.1 Compare route options and ETAs

As an ambulance driver, I want to see each returned route with its estimated travel time, so that I can compare my options.

Given a valid origin, destination and route response, when routes load, then every returned route and its ETA is shown.

Only alternatives returned by the service are shown; missing values are never invented.

ETAs are labelled "estimated" and never described as guaranteed.

US-2.2 Highlight the lowest-ETA route

As an ambulance driver, I want the fastest estimated route highlighted and preselected, so that I can spot it at a glance.

Given two or more routes, when they load, then the lowest-ETA route is preselected.

The highlight uses a text label (such as "Fastest ETA") as well as colour.

US-2.3 Choose a different route

As an ambulance driver, I want to pick any other returned route, so that I can use my own judgement on the road.

Given the lowest-ETA route is preselected, when I select another route, then it becomes the selected route.

Only one route is selected at a time.

US-2.4 Confirm the route before navigation

As an ambulance driver, I want navigation to start only after I confirm, so that ERAS never commits me to a route I did not choose.

Given a route is selected, when I have not confirmed, then navigation does not start.

Given a route is selected, when I tap Confirm, then navigation starts on that route.

Given I confirm a route, then ERAS runs the alert evaluation in E3.

E3 Conditional police alert (P0)

ERAS alerts police only when valid data shows both approved conditions. Source: FR-04, BR-01, BR-02, BR-03, BR-05. Blocked by US-0.2 and US-0.3.

US-3.1 Create an alert when both conditions are true

As an ambulance driver, I want police alerted when my route is severely congested and has no suitable alternative, so that I get help without making a call.

Both conditions use the mentor-approved definitions from US-0.2.

Given an alert is created, then it goes to the designated recipient from US-0.3.

US-3.2 Never alert on a technical error

As a traffic-police officer, I want no alerts caused by system errors, so that I can trust every alert I receive.

Given a network or API error, missing traffic result, or stale route response, when the route is evaluated, then no alert is created.

An unknown condition is treated as not proven, never as severe congestion.

Given simulated demo data, then no real police alert is created.

US-3.3 Prevent duplicate alerts

As a traffic-police officer, I want only one active alert per incident, so that I am not flooded with repeats.

Given an active alert exists for an incident, when the same route is evaluated again, then no second active alert is created.

The incident is identified by the deduplication key agreed in US-0.2.

US-3.4 Show alert delivery failure

As an ambulance driver, I want to know when an alert could not be delivered, so that I do not wait for help that is not coming.

Given no police recipient is configured or reachable, when an alert qualifies, then I see an explicit delivery-failure message.

The screen never shows or implies a police response in this case.

E4 Alert handling and status (P0)

The officer moves an alert through Pending, Acknowledged and Resolved, and the driver sees each change. Source: FR-05, FR-06, BR-04.

US-4.1 View alert details

As a traffic-police officer, I want to see the key facts of each alert, so that I can understand and act on it.

Each alert shows a unique reference, origin, destination, time created, route and traffic context, and current status.

No unnecessary personal data (such as patient details) is shown.

Only users with the officer role can open the alert view.

US-4.2 Acknowledge an alert

As a traffic-police officer, I want to acknowledge a new alert, so that the driver knows it has been seen.

Given an alert is Pending, when I tap Acknowledge, then its status changes to Acknowledged with a timestamp.

Users without the officer role cannot change the status.

US-4.3 Resolve an alert

As a traffic-police officer, I want to mark an alert as resolved, so that everyone knows the response is complete.

Given an alert is Acknowledged, when I tap Resolve, then its status changes to Resolved with a timestamp.

Given an alert is still Pending, then Resolve is not available.

US-4.4 Keep status after refresh

As a traffic-police officer, I want status changes saved, so that nothing is lost if the page reloads.

Given I changed a status, when I refresh or reopen the app, then the latest status is still shown.

US-4.5 Track alert status as a driver

As an ambulance driver, I want to see whether my alert is Pending, Acknowledged or Resolved, so that I know what to expect on the road.

Given an alert was created for my trip, then I see its current status with a text label and icon, not colour alone.

Given the officer has not acknowledged it, then it stays visibly Pending; "sent" is never shown as "accepted".

Given the officer changes the status, when I refresh or the view updates, then I see the new status.

E5 Failure handling (P0)

ERAS shows clear errors and never presents missing data as a clear route. Source: FR-07, PRD §7.

US-5.1 Show an error when services fail

As an ambulance driver, I want a clear error when map, routing or traffic data fails, so that I do not rely on information that is not there.

Given a map, routing or traffic service fails, when I request routes, then a clear error message is shown.

Missing data is never shown as a clear route, and no alert is created.

US-5.2 Show a no-route state

As an ambulance driver, I want to be told when no route was found, so that I can change my destination or origin.

Given the service returns a valid response with no routes, then a no-route message is shown.

Alert eligibility in this case follows the rule interpretation approved in US-0.2.

US-5.3 Drop traffic claims when traffic data is unavailable

As an ambulance driver, I want ERAS to say when traffic data is missing, so that I know ETAs may not reflect congestion.

Given traffic data is unavailable, then no traffic-aware labels or claims are shown.

Stale or fabricated traffic results are never substituted silently.

E6 Audit history (P1)

A basic record of alerts supports prototype review. Build only after all P0 stories pass QA. Source: FR-08.

US-6.1 Record alert history

As the QA analyst, I want a timestamped record of each alert and its status changes, so that I can verify the demo scenarios.

Alert creation and every status change are stored with a timestamp.

The history for one alert can be viewed in time order.

US-6.2 Restrict history access

As a traffic-police officer, I want alert history limited to intended roles, so that operational data stays private.

Only intended roles (officer and demo reviewer) can view the history.

Other users see an access-denied message.

Epic | Goal | Priority | Stories | Source

E0 Build readiness | Confirm API access, alert rules and police recipient before coding | P0 (gate) | 3 | MRD §9, PRD §5, §9

E1 Hospital destination | Driver sets an origin and selects a hospital | P0 | 4 | FR-01

E2 Route options and confirmation | Driver compares returned routes and ETAs, then confirms one | P0 | 4 | FR-02, FR-03

E3 Conditional police alert | Create an alert only when both approved conditions are true | P0 | 4 | FR-04, BR-01, BR-02, BR-03, BR-05

E4 Alert handling and status | Officer views, acknowledges and resolves alerts; driver sees status | P0 | 5 | FR-05, FR-06, BR-04

E5 Failure handling | Show clear errors and never fabricate route or traffic data | P0 | 3 | FR-07, PRD §7

E6 Audit history | Keep a timestamped alert record for review | P1 | 2 | FR-08

ID | Area | User story | Acceptance criteria

NFR-01 | Usability | As a driver, I want a short, readable flow, so that I can use it under time pressure. | Origin to confirmed route in a few clear steps; route, ETA, error and status labels are plain words.

NFR-02 | Reliability | As a driver, I want an explicit unavailable state, so that I never act on fake data. | Missing service data shows an error state; no fabricated or stale results are substituted.

NFR-03 | Privacy | As an officer, I want my location and contact details protected, so that my personal data is safe. | Only data needed for routing and alerts is collected; officer location needs consent and has limited access and retention.

NFR-04 | Security | As the team, we want separate driver and officer access, so that only officers can change alert status. | Driver and officer roles are separate in the demo; status updates are officer-only; API keys are not in client-side code or public documents.

NFR-05 | Performance | As a driver, I want screens to respond quickly, so that the live demo runs smoothly. | Screens stay responsive in the demo; no numeric latency target is claimed until tested on the chosen network and API.

NFR-06 | Accessibility | As any user, I want readable screens, so that I can use ERAS in any light or ability. | Readable text size, sufficient contrast, and status cues that do not rely on colour alone.

NFR-07 | Demo readiness | As the QA analyst, I want the full driver-to-police scenario tested, so that the mentor can sign off. | All P0 acceptance criteria and the PRD §10 checklist pass in the approved demo scenario before sign-off.

PRD item | Stories

FR-01 Hospital selection | US-1.1, US-1.2, US-1.3, US-1.4

FR-02 Route options and ETA | US-2.1, US-2.2

FR-03 Driver route confirmation | US-2.2, US-2.3, US-2.4

FR-04 Traffic alert rule | US-0.2, US-3.1

FR-05 Police alert details | US-4.1

FR-06 Acknowledgement and status | US-4.2, US-4.3, US-4.4, US-4.5

FR-07 Failure handling | US-3.2, US-5.1, US-5.2, US-5.3

FR-08 Audit visibility (P1) | US-6.1, US-6.2

BR-01 AND trigger | US-3.1

BR-02 No technical-error alert | US-3.2

BR-03 Recipient | US-0.3, US-3.4

BR-04 Status sequence | US-4.2, US-4.3, US-4.5

BR-05 No duplicate alerts | US-0.2, US-3.3

Severe congestion | No suitable alternative | Expected result

True | True | One alert created, status Pending

True | False | No alert

False | True | No alert

False | False | No alert