# Fuel Check — SR22T In-Flight Fuel Cross-Check Calculator

Design document. Date: 2026-10-22. Status: builder-reviewed, awaiting
owner approval.

## Intent and why

The owner-pilot of a Cirrus SR22T (Garmin Perspective+ / G7 avionics) wants a
fast, *independent* cross-check of the Garmin "Fuel On Destination" (FOD)
figure while in flight. The Garmin computes FOD, but it is unclear to the
pilot whether that figure accounts for the winds-aloft ahead on the route
(which the pilot can see as wind-barb arrows on the MFD — e.g. 4 barbs + a
half barb ≈ 45 kt headwind). When strong headwinds lie ahead, the pilot wants
to enter a handful of numbers read off the panel, plus the winds he sees
ahead, and get his own fuel-at-landing figure in well under a minute — then
compare it with the Garmin's.

This is a **cross-check tool, not a primary fuel computer and not a flight
planner.** The pilot flies with the Garmin; this app answers "can I trust the
Garmin's FOD right now?"

## Goals

- Works fully offline on iPhone 17 and iPad (used in the cockpit). No
  internet is available in flight; everything is baked into the app.
- Installable without the App Store.
- Entry fast enough to complete in ~30 seconds in turbulence: few fields,
  large touch targets, live recalculation (no "Calculate" button).
- Models winds *ahead* on the route as numbered wind points at pilot-entered
  distances from the current position.
- Clear go/no-go signal: fuel at destination vs. a 45-minute reserve.
- Shows the delta against the Garmin FOD figure when the pilot enters it.

## Non-goals

- No navigation database, no route/waypoint planning, no moving map.
- No weather or winds-aloft data fetching (pilot reads winds off the MFD and
  types them in).
- No climb/descent fuel profiles — the model assumes cruise for the whole
  remaining distance. (Decision, mine: descent typically reduces burn, so
  the cruise-only estimate errs on the conservative/safe side.)
- No multi-aircraft profiles, no accounts, no sync.

## Anti-goals (failure even if it technically works)

- Anything that needs connectivity in flight.
- An interface cluttered enough that the pilot fumbles with it while flying.
- Being mistaken for a primary/authoritative fuel source. It is a
  cross-check; the UI must not pretend otherwise (a small permanent
  disclaimer line is acceptable, decision left to builder).

## Platform and distribution (decided)

- **PWA**: a web app the pilot opens once in Safari and adds to the home
  screen on both iPhone and iPad. Offline via service worker; prefer keeping
  the whole app a single self-contained HTML file (plus the service worker
  and manifest) so updates are "open the new version once".
- **Hosting: GitHub Pages** (owner's decision). Stable HTTPS URL — required
  for service worker and geolocation. The URL is technically public but
  unlisted; no auth. Repo and Pages setup are part of the build.
- **UI language: English only.** The pilot flies, communicates and reads the
  Garmin in English; no Russian text anywhere in the UI.
- Dark, cockpit-friendly theme (approved via mockups). High-contrast
  tabular numerals, large fields.
- Persistence (owner's decision): **only Fuel flow and TAS persist** between
  launches (localStorage), plus Mag var (my call — it is region-stable).
  All flight-specific data — FOB, distance to destination, wind points,
  Garmin FOD, and Course — is **cleared on every launch**, so the pilot can
  never see a confident result computed from a previous flight's data. On
  first launch, prefill plausible SR22T cruise values for the persisted
  fields (decision, mine: e.g. FF 17.8 gph).

## Inputs

| Field | Unit | Source |
|---|---|---|
| Fuel on board (FOB) | US gal | pilot, from Garmin fuel totalizer |
| Fuel flow (FF) | gph | pilot, from Garmin; constant for whole calc |
| Distance to destination | nm | pilot, from Garmin |
| Ground speed (GS) | kt | **auto from device GPS**, manual override |
| True airspeed (TAS) | kt | pilot, from Garmin PFD |
| Garmin FOD (optional) | US gal | pilot, from Garmin — used only for the delta display |
| Wind points | see below | pilot |

Units are fixed (gal / kt / nm / degrees) — same as the aircraft's Garmin.
No unit switching.

### GPS auto-fill

- Use the browser geolocation API (`watchPosition`) to fill GS continuously;
  convert m/s → kt. Show a clear indicator that the value is live from GPS
  (green highlight as in the approved mockup).
- Tapping/editing the GS field switches it to manual and stops auto-updates;
  an obvious control re-enables GPS (exact affordance left to builder).
- If GPS is unavailable or permission denied, the field is simply manual —
  the app must remain fully usable.

### Wind points (the core interaction, approved via mockup v2)

- Numbered points 1, 2, 3, … Each point has a **distance from the current
  position** ("Dist from you", nm, typed by the pilot) — *not* from the
  previous point — because the pilot thinks in "50 miles ahead of me, then
  170 miles ahead of me".
- Each point's wind applies **from that point until the next point** (or
  until the destination, for the last point).
- From the current position to point 1, the aircraft flies at the current
  GS (that GS already embodies today's wind — no wind entry needed there).
  A "YOU · 0 NM" marker tops the list to make this visible.
- Between points, the UI shows grey derived-explainer lines:
  "↓ 50–170 nm: headwind 45 kt → GS 138 kt", so the pilot immediately sees
  how the app understood the input and can spot a typo.
- "+ Add wind point" appends a point. Points can be removed. (Edit/remove
  affordances left to builder; must be touch-friendly.)

Two wind-entry modes as tabs (both share the same point distances):

1. **QUICK WIND**: one signed number per point — the head/tailwind
   component in kt. Convention: negative = headwind (e.g. −45), positive =
   tailwind. This matches how the pilot mentally reads the MFD barbs.
2. **PRECISE WIND**: the pilot enters his course (track, degrees, one field
   for the whole route) and per point the wind direction (degrees FROM, as
   winds aloft are given) and speed (kt). The app computes and displays the
   resulting component next to each point ("Comp. −44").
   - **Magnetic variation (owner's decision):** the pilot is not sure his
     Garmin track and the MFD wind directions share a reference, so the
     Precise tab has a **Mag var field** (signed degrees or E/W toggle,
     persisted). The app assumes Course is entered as *magnetic* track (as
     the Garmin shows it) and wind direction as *true* (as winds aloft are
     given), and normalizes them to one frame via Mag var before computing
     components (True = Magnetic + easterly variation). Mag var 0 means
     "both already in the same frame". A short hint label near the field
     must state this convention.

Switching tabs must not lose entered data; each tab keeps its own wind
values, the distances are shared. Which tab is active determines which wind
values feed the calculation.

## Calculation model

Let D = distance to destination, points sorted by distance d₁ < d₂ < … < dₙ.

- Segment 0: 0 → d₁ at current GS.
- Segment i (from dᵢ to dᵢ₊₁, last one to D): ground speed derived from TAS
  and that point's wind.
  - Quick mode: GSᵢ = TAS + componentᵢ (component signed, headwind
    negative).
  - Precise mode: full wind triangle. With headwind component
    H = W·cos(windDir − course) and crosswind component
    X = W·sin(windDir − course):  GSᵢ = √(TAS² − X²) − H.
    (Decision, mine: the full triangle costs nothing and is slightly more
    accurate than ignoring crosswind.)
- ETE = Σ (segment length / segment GS). Fuel used = ETE × FF.
- **Fuel at destination = FOB − fuel used.**
- **Reserve threshold = FF × 0.75 h** (45 minutes at the entered fuel
  flow). Result panel is green at/above the threshold, red below, with an
  explicit warning line ("⚠ Below 45-min reserve (13.4 gal)").
- Result panel also shows: ETE (h:mm), reserve expressed in minutes of
  flight remaining at FF, and — when Garmin FOD was entered — the delta:
  "Garmin 18.2 gal · Δ −2.1 gal".
- Everything recalculates live on any change.

### Edge cases (must be handled, exact wording left to builder)

- A segment GS ≤ 0 (entered wind ≥ TAS): show a clear inline error for that
  segment instead of a result; never show nonsense numbers.
- A wind point at/beyond the destination distance, or distances out of
  order / duplicated: flag the offending point inline (builder may sort
  automatically, but the explainer lines must make the interpretation
  obvious).
- Missing required inputs: show a neutral "enter X" state, not NaN.
- Negative or zero FF/TAS/GS inputs: reject/flag inline.

## UI layout (approved via mockups)

Single screen, top to bottom:

1. Title ("FUEL CHECK — SR22T").
2. Row: Fuel on board · Fuel flow.
3. Row: Dist to dest · GS (GPS, green) · TAS.
4. Garmin FOD field (optional input, placed near the inputs or the result —
   builder's choice, but the delta is displayed in the result panel).
5. Tabs: QUICK WIND / PRECISE WIND. (Precise tab adds the Course field.)
6. "YOU · 0 NM" marker, then numbered wind points with grey derived
   explainer lines between them, then "+ Add wind point".
7. Result panel: big "Fuel at destination X gal", sub-line with reserve
   minutes, ETE, Garmin delta; green/red per the reserve rule.

Reference mockups (approved by the owner):
`.superpowers/brainstorm/24144-1792657707/content/main-layout.html` (overall
look, precise tab, red state) and `main-layout-v2.html` (wind-point
numbering and semantics — this version supersedes the segment design in v1).

## Left to the builder

- Exact visual styling beyond the mockups' spirit (dark theme, large
  tabular numerals, touch targets sized for turbulence).
- Numeric keypad behavior / input ergonomics on iOS.
- Service worker and manifest details; cache-busting strategy for updates.
- Wind-point add/remove/edit affordances.
- Placement of the Garmin FOD field and of a small "cross-check only"
  disclaimer.
- Whether to show intermediate per-segment fuel numbers anywhere (not
  required).

## Explicit decisions made by the assistant (not the owner)

- PWA instead of a native app (owner approved the consequence: no App
  Store, installable from Safari).
- Cruise-only model, conservative by design.
- Full wind triangle in Precise mode.
- Fixed units, first-launch prefill values.
- Mag var persists between launches (region-stable), unlike other
  Precise-tab data.
- 45-minute reserve converted via entered FF rather than a fixed gallons
  number (owner stated the reserve as "45 minutes of flight").

## Decisions made by the owner (from the builder-review round)

- Hosting: GitHub Pages, public-but-unlisted URL.
- Persistence: only FF and TAS survive relaunch; FOB, distance, wind
  points, Garmin FOD and Course are cleared every launch.
- Precise mode gets a Mag var field (owner is not sure his panel's track
  and wind references match).

## Addendum 2026-10-22: Arrival block (owner-requested, approved in chat)

Toggleable ARRIVAL section for a more precise FOD. Three-phase model:
cruise (wind segments, cruise FF) until top of descent; descent (time =
(cruise alt − field elev) / rate, at its own FF); approach/procedure
allowance (minutes at full-rich FF). Descent distance = descent time ×
last wind segment's GS; if the remaining distance is shorter, the cruise
phase is zero and descent covers what is left. Defaults (editable):
rate 500 fpm, descent FF 18 gph, approach FF 20 gph — persisted as
aircraft settings; altitudes and approach minutes are flight data (never
persisted). Approach-time quick buttons +5/+10/+15/0. Procedure library:
owner-maintained entries {airport, name, minutes} stored on the device
(fc.procs), selectable to fill approach time; seeded from the owner's
charts when provided (FALA, FACT, FAOR). Result panel adds a line:
"TOD in N nm · Cruise h:mm · Desc h:mm · Appr h:mm".
