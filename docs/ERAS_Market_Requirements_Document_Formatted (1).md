ERAS

Emergency Route Advisory System | Market Requirements Document

1. Problem Overview

Ambulances may be delayed by congestion, and the quickest suitable route can change with traffic. ERAS addresses three connected problems:

Traffic congestion: drivers need current route and travel-time information when conditions vary. The extent of this problem in the target locality has not been measured.

Route selection: choosing by distance alone may not identify the lowest estimated travel-time option. Drivers need comparable estimates and available alternatives, while retaining the final decision.

Traffic-police coordination: when severe congestion exists and no suitable alternative is available, designated officers need a timely alert and a way to acknowledge and track response status.

These needs matter because ambulance drivers make time-sensitive route decisions, while police officers need actionable, understandable information. ERAS supports coordination; it does not guarantee faster arrival or replace official dispatch or police systems.

2. Target Users and Preliminary Personas

The personas below are preliminary assumptions for the prototype, not findings from completed user interviews.

Primary persona: Ambulance driver

Goals: reach the selected hospital using an appropriate route. Needs: view hospitals on a map, compare traffic-aware ETAs and alternatives, and confirm a suggested route. Pain points (assumptions): congestion changes route usefulness; switching between navigation and coordination may add effort. Expected outcome: clear route options and an alert status when police coordination is initiated?not a guaranteed arrival-time improvement.

Primary persona: Designated traffic-police officer

Goals: receive relevant congestion alerts and report response progress. Needs: alert context, acknowledgement, and a persistent resolved status. Pain points (assumptions): unclear alert criteria or stale availability could reduce usefulness. Expected outcome: a traceable alert and status history; receipt does not guarantee action or clearance.

3. User Needs and Market Requirements

4. Existing Alternatives

General navigation applications ? Potential alternative for maps, route options and travel-time estimates. Capabilities vary by product, region, account configuration and API access; ERAS has not verified a specific service or local coverage. A combined police-alert workflow is not assumed to be absent; that requires product and local-workflow research.

Manual phone-based coordination ? Potential alternative for a driver/dispatcher to contact police through existing channels. It may require users to switch between navigation and communication, but whether that is a local pain point has not been validated.

Official emergency workflows ? Existing ambulance dispatch and police procedures may already coordinate incidents. No specific JJCET/local process has been reviewed. ERAS is a supporting prototype and must not bypass or replace official channels.

5. Proposed Product Opportunity

ERAS is a proposed web application combining map-based hospital selection, traffic-aware route/ETA information, conditional traffic-police alerts, acknowledgement and response-status tracking in one proposed workflow. The driver receives route information and alert status; the officer receives qualifying alerts and records status changes. This is a product hypothesis for a hackathon prototype, not evidence of uniqueness, adoption or reduced travel times.

6. Assumptions, Dependencies and Risks

7. Success Measures (Prototype-Level)

Evaluate with controlled test cases and record pass/fail evidence. These measures test the prototype only; they are not claims of real-world impact.

8. Scope Boundaries

9. Mentor Review: Pre-Build Validation Gates

Confirm Google Maps/API access, billing, enabled services, cost and a live-demo plan before coding; otherwise agree a mentor-approved prototype fallback.

Agree testable definitions for severe congestion and ?suitable alternative?; the earlier 10-minute suggestion is not the authoritative MRD rule.

Confirm who designates officers, how availability/location is known, and what happens if no officer can receive the alert. No dispatcher persona is currently in scope.

Define hospital search bounds, alert fields, location-consent handling, data access/retention and the official workflow boundary.

Prepared for planning and mentor approval before implementation.

Document information | Details

Version / date | Version 1.0 | 24 October 2026

Purpose | Define the hackathon product opportunity, target-user needs, boundaries, assumptions and measurable prototype outcomes for mentor/backlog review.

Event | JJCET AI-PDLC Hackathon | 24&25 October 2026

Status | Hackathon MRD; four-role team (BA, UI/UX Designer, Developer and QA); approximately 1.5 days. Planning and mentor backlog approval precede coding.

User need | Market requirement / desired outcome

Driver: identify a destination | Display nearby hospitals on a map and allow the driver to select a destination. Hospital capacity/bed availability is not represented.

Driver: compare route choices | Display route options and estimated travel times returned by the configured routing service; show available alternatives and make the lowest-ETA route identifiable. Driver confirms before navigation.

Police: act on qualifying conditions | Create an alert only when valid route/traffic information meets both configured conditions: severe congestion and no suitable alternative.

Police: track response | Allow the designated officer to acknowledge an alert and update its status; persist the alert and status changes for review.

Item | Status / implication

Google Maps access | Unverified: API project, key, billing, enabled services, quotas and cost must be checked before committing to live routing.

Route/traffic data | Assumption: data is available and sufficiently current in the demo area. Estimates may be unavailable or inaccurate; the app must surface technical errors.

Alert rule | Unvalidated: ?severe congestion? and suitable alternative need operational definitions. Trigger requires both conditions; a service error is not a traffic trigger.

Police availability | Assumption: designated officers can receive alerts and update statuses. Location/availability source and assignment process require validation.

Connectivity/privacy | Dependency/risk: live route and alert workflows require connectivity. Officer location is sensitive; consent, on-duty limits, access and retention need safeguards.

Measure | Pass condition

Route and ETA display | Given valid routing data, ERAS displays the returned route and ETA information and available alternatives; it does not invent missing values.

Alert creation | With valid data, an alert is created when severe congestion AND no suitable alternative are both true.

No false alert | No alert is created if either trigger condition is false, or if routing/traffic service data fails.

Police response tracking | The designated officer can acknowledge and resolve an alert; status changes persist and are visible to the intended users.

End-to-end demonstration | The planned driver-to-police scenario and its associated test cases complete during the live prototype demo.

In scope for the prototype | Out of scope

Hospital selection from a map; route and ETA display; available alternatives; condition-based police alert; officer acknowledgement and status tracking. | Production deployment; integration with official police systems; real emergency dispatch; guaranteed hospital-bed availability; AI traffic prediction; guaranteed improvement in arrival time.