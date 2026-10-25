ERAS

Emergency Route Advisory System | Product Requirements Document

1. Product overview

ERAS is a proposed web application for ambulance route advice and traffic-police coordination. A driver selects a hospital destination, reviews available route and estimated travel-time information, and confirms a route. If valid route/traffic data indicates both severe congestion and no suitable alternative, ERAS alerts the designated traffic-police team. Officers can acknowledge and update the response status.

ERAS supports decisions; it does not dispatch ambulances, control traffic signals, replace official emergency workflows, guarantee faster arrival, or guarantee hospital-bed availability.

2. Goals and success outcomes

? Help a driver view a selected destination and compare available route options and estimated travel times.

? Make the lowest estimated travel-time option easy to identify while leaving route confirmation to the driver.

? Create a police alert only when both approved traffic conditions are true; show response status and persist status changes.

? Complete and demonstrate the agreed end-to-end prototype and test cases within the hackathon window.

3. Primary users and product flow

Proposed flow: driver opens the map ? selects/enters an origin and hospital destination ? reviews available routes and ETAs ? confirms a route ? ERAS evaluates the approved alert conditions ? designated police users receive qualifying alerts ? officer acknowledges and resolves the alert. If no nearby hospital is listed, the driver can search manually.

4. Functional requirements

5. Business rules and alert lifecycle

Open rule gate: the MRD does not set a numeric congestion threshold or define what makes an alternative ?suitable.? The earlier 10-minute suggestion was not approved as the final MRD rule. The BA/mentor must approve measurable demo definitions before alert implementation; never hard-code an unapproved threshold.

6. Non-functional requirements and safeguards

7. Edge cases and expected behaviour

8. MVP prioritisation and scope

9. Dependencies, assumptions and risks

? Google Maps Platform/API project, key, billing, enabled services, quotas, and local traffic coverage are unverified. Confirm access and cost before committing to live routing; API capability and regional availability must be checked.

? Valid route/traffic data is a dependency. Any demonstration fallback using simulated data must be mentor-approved and clearly labelled; simulated data must never trigger a real police alert.

? Severe congestion, suitable alternative, duplicate incident, police recipients, and alert fallback behaviour require product/mentor decisions before coding.

? Connectivity, officer availability, privacy, consent, data retention, and local emergency-policy compliance remain assumptions/risks; this prototype is not for operational emergency use.

10. QA acceptance checklist

? Valid origin/destination and valid service data display returned routes and ETAs; lowest-ETA route is highlighted; navigation waits for driver confirmation.

? Alert is created only when both approved traffic conditions are true; it is not created when either is false.

? Routing/API/network failure produces a visible error and no police alert.

? Officer can acknowledge and resolve an alert; status persists after refresh/reopen and is visible to the intended driver view.

? No nearby hospitals leads to manual search; missing recipient and unacknowledged-alert cases are not shown as successful response.

? The complete planned demo and all agreed P0 test cases run before mentor sign-off.

Document note: This PRD translates the current MRD into prototype behaviour. Unvalidated rules are explicit approval gates, not settled operational policy.

Document information | Details

Version / date | Version 1.0 | 24 October 2026

Purpose | Define user-facing behaviour, MVP requirements, testable acceptance criteria, and release boundaries for hackathon planning and mentor backlog approval.

Delivery context | JJCET AI-PDLC Hackathon | 24?25 October 2026 | Approximately 1.5 days

Team | Business Analyst, UI/UX Designer, Developer, Quality Analyst

Status | Draft PRD based on the MRD and interview decisions; open product rules require mentor approval before implementation.

User | Primary needs in the MVP

Ambulance driver | Choose a hospital; compare route/ETA information and available alternatives; confirm a suggested route; see whether a qualifying police alert is pending, acknowledged, or resolved.

Designated traffic-police officer | View relevant alert context; acknowledge the alert; update it to resolved; see that status changes are recorded.

ID / priority | Requirement | Acceptance criteria

FR-01 | P0 | Hospital selection | Given a valid map/search response, the driver can choose a hospital destination. If the nearby-hospital list is empty, manual hospital search is available. No bed/capacity claim is displayed.

FR-02 | P0 | Route options and ETA | Given valid route-service data, show the returned route options and estimated travel times, including available alternatives. Identify the lowest-ETA option; do not describe ETA as guaranteed.

FR-03 | P0 | Driver route confirmation | Preselect/highlight the lowest-ETA route, but do not start navigation until the driver confirms. The driver can select another returned option.

FR-04 | P0 | Traffic alert rule | Create an alert only when valid data confirms BOTH approved conditions: severe congestion AND no suitable alternative route. If either is false, create no alert.

FR-05 | P0 | Police alert details | Alert shows a unique reference, origin/destination, time created, relevant route/traffic context, and current status. Avoid unnecessary personal data.

FR-06 | P0 | Acknowledgement and status | Officer can change status from Pending to Acknowledged and then Resolved. Persist the status changes and show current status to permitted users.

FR-07 | P0 | Failure handling | If map/routing/traffic data fails, display a clear error; do not present missing data as a clear route and do not create a traffic alert.

FR-08 | P1 | Audit visibility | Retain a basic timestamped record of alert creation and status changes for prototype review; access limited to intended roles.

Rule | Product behaviour

BR-01: AND trigger | Both conditions must be true: (a) severe congestion according to the mentor-approved demo definition; AND (b) no suitable alternative according to the approved route-comparison rule.

BR-02: No technical-error alert | A network/API error, missing traffic result, stale/unavailable route response, or unknown condition is not proof of severe congestion. Show an error; create no alert.

BR-03: Recipient | Send qualifying alerts to the designated traffic-police team/recipient configured for the prototype. Assignment and availability mechanism remain to be confirmed.

BR-04: Status sequence | New alert is shown as Pending ? officer may mark Acknowledged ? officer may mark Resolved. Store each transition with a timestamp. Do not imply that ?sent? means ?accepted.?

BR-05: No duplicate spam | For a single route evaluation, create at most one active alert for the same incident. Deduplication key/incident definition requires team approval before build.

Area | MVP requirement

Usability | Keep the driver flow brief and readable; use clear route, ETA, error, and alert-status labels. Avoid presenting multiple confusing choices.

Reliability | Show an explicit unavailable/error state when required service data is missing. Do not silently substitute fabricated or stale traffic results.

Privacy | Collect only information needed for route/alert handling. Protect any officer location/contact information; obtain consent and limit access/retention if location is used.

Security | Use separate driver/officer access in the demo where feasible; restrict officer status updates to the officer role. Do not expose API keys in client-side source or public documents.

Performance | Keep screens responsive for a live demonstration. No numerical latency target is claimed until tested on the selected network/API.

Accessibility | Use readable text, sufficient contrast, and status cues that do not rely on colour alone.

Scenario | Expected behaviour

No nearby hospitals | Offer manual hospital search; do not invent results.

No route returned by a valid service response | Show no-route state. Alert eligibility still requires an approved rule interpretation and the other required condition; validate before implementation.

Traffic data or API unavailable | Show an explicit error; do not make traffic-aware claims or create an alert.

No suitable route alternative | Only evaluate alert if valid data confirms severe congestion too; otherwise no alert.

No designated police recipient/configuration | Show an explicit alert-delivery failure to the driver/demo operator; do not imply a police response. Final fallback requires approval.

Officer does not acknowledge | Keep alert Pending and visibly unacknowledged. No automatic escalation is in MVP scope unless approved.

Duplicate evaluation | Avoid creating repeated active alerts for the same incident once the deduplication rule is agreed.

Priority | Includes | Definition of done

P0 ? Must demonstrate | Hospital destination selection; returned route/ETA options; fastest ETA highlighted; driver confirmation; approved AND alert rule; police alert view; acknowledge/resolve; explicit failure states. | All P0 acceptance criteria pass in the approved demo scenario; content/status is not fabricated; mentor approves backlog before coding.

P1 ? If time remains | Basic timestamped alert history; improved empty states; limited role-specific visual polish. | Added only after P0 works and QA has rerun core acceptance tests.

Out of scope | Production deployment; official police-system integration; real emergency dispatch; signal control; AI traffic prediction; guaranteed arrival-time improvement; hospital-bed availability; full analytics/admin portal. | Not built or represented as available in the hackathon prototype.