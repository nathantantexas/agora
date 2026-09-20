# Agora

**Your turn to speak at city hall.** Find city council meetings across 39 Dallas-Fort Worth cities, learn exactly how to sign up to speak, and get matched to the issues you care about. Built by students for the Congressional App Challenge.

The agora was the open square at the center of a Greek city, the place where citizens gathered to trade news, argue, and decide things together, and nobody needed an invitation to stand in it. A council chamber is the closest thing a modern city has to that square, so the app is named after it and looks the part.

Agora is a web app, an installable phone app (PWA), and a terminal tool that all share one engine and one dataset. It works in English, Spanish, and Vietnamese, including the city guides and agenda items. It is strictly nonpartisan: Texas city councils are nonpartisan, and the app is about showing up and being heard, not about picking a side.

## Try it

**[Open the live app](https://nathantantexas.github.io/agora/)**, hosted from this repository. Every commit to `main` republishes it. The map, the city guides, the rankings, and the charts all read data bundled into the page, so they work with no server behind them.

Headlines work there too, with one difference worth knowing. A static site cannot run the
news endpoint, so the deploy gathers the newsroom feeds at build time and ships the result
as a snapshot, and a scheduled run refreshes it four times a day. The page says when the
headlines were collected rather than implying they are live. Address lookup and the AI
explanations do need the API, so on the hosted copy they fall back to their offline
behavior: pick a city from the list instead of typing a ZIP code, and agenda items get a
plain-language explanation from the topic guide instead of from the model.

To run the whole thing, including the API, without installing anything locally, open the repository on GitHub and choose **Code > Codespaces > Create codespace on main**. Dependencies install on their own, then run `npm run dev` and open the forwarded port 5173. Under **Ports** you can set that port to public and hand the URL to anyone you want to show it to.

The live app redeploys itself: `.github/workflows/pages.yml` rebuilds and publishes it on
every push to `main`, and `.github/workflows/ci.yml` runs the test suites, the dictionary
parity check, and a production build on every push and pull request.

## Quick start

Locally you need [Node.js 22 or newer](https://nodejs.org/).

```bash
npm install          # once
npm run dev          # API on http://localhost:8787, web app on http://localhost:5173
```

Open http://localhost:5173 on your laptop, or on your phone over Wi-Fi (the dev server prints a network URL). On a phone, use "Add to Home Screen" and it installs like a native app and keeps working offline.

### Terminal

Everything also runs in the terminal, no server needed:

```bash
npm run cli -- cities                                   # every city and its next meeting
npm run cli -- match --interests housing,transit --city Plano --evening --weekends
npm run cli -- speak Dallas                             # exactly how to sign up to speak
npm run cli -- city "Fort Worth"                        # schedule, agenda, youth programs
npm run cli -- map --near Richardson                    # ASCII map of the whole region
npm run cli -- agenda --topic parks-recreation          # upcoming agenda items on a topic
npm run cli -- stats                                    # when councils meet, in text charts
npm run cli -- comment --name "Ana" --city Plano --topic parks-recreation --ask "keep the pool open later"
npm run cli -- setup                                    # save your preferences (no account)
npm run cli -- demo                                     # a scripted tour of the whole loop
npm run cli -- help
```

Add `--json` to any command for raw JSON, `--today 2026-09-14` to pretend it is another day, and `--lang es` or `--lang vi` (or set `AGORA_LANG`) for Spanish or Vietnamese.

### Tests

```bash
npm test
```

Runs the schedule engine, matching, server, and CLI test suites (Node's built-in test runner, no extra tooling).

### Production build

```bash
npm run build        # merges the data and builds the web app into packages/web/dist
npm start            # one server on http://localhost:8787 serving the app and the API
```

### Optional AI features

Set `ANTHROPIC_API_KEY` before starting the server to turn on two features: "Explain this" on any agenda item, and "Polish with AI" in the comment builder. Without a key, both fall back to plain-language templates, so nothing in the app depends on it.

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run dev
```

## What it does

| Feature | Where |
|---|---|
| Interactive map of each city's published council meetings, pins darken as a meeting gets closer | Map (web), `map` (CLI) |
| Personalized ranking by topics, schedule, distance, and whether you can speak | For you (web), `match` (CLI) |
| Step-by-step "how to speak" guide per city: form, deadline, time limit, remote option | City pages (web), `speak` (CLI) |
| Youth councils and commissions, the appointed seats students can actually hold | For you and city pages, `youth` (CLI) |
| Agenda items tagged by topic with plain-language explanations | City pages and meeting drawer, `agenda` and `explain` (CLI) |
| Comment builder that drafts a public comment, times it against the city's limit (usually 3 minutes) | Learn (web), `comment` (CLI) |
| Local news filtered by topic from 30+ DFW newsroom feeds | News (web), `news` (CLI) |
| Insights: when councils meet, evening share, school-hours share, speaking limits | Insights (web), `stats` (CLI) |
| Add to calendar (.ics), directions, offline support | Meeting drawer (web) |
| Language menu: English, Spanish, Vietnamese, covering the interface, the engine's wording, and the city data | Header (web), `--lang` (CLI) |
| Profiles: separate saved setups on one device, with export and import to move one | Header and Profiles page (web) |
| A locator emblem for each of the 39 cities, placed from its real city hall coordinates | City index, city pages, meeting drawer |

## Data visualizations

Charts are not confined to a statistics page. Most of them sit inside the screen where
the question comes up, and each one is built from the same published schedule data the
rest of the app runs on.

| Chart | What it answers | Where it appears |
|---|---|---|
| Activity strip | Is anything happening soon, and when does the region get busy? One column per day with weekends tinted and month breaks ruled | Above the map list, on every city page, and on Insights |
| School-day clock | Does this meeting land while I am in class? The start time is drawn to scale from 6 AM to 11 PM with school hours shaded | Meeting drawer, and under each recurrence rule on a city page |
| Reach plot | Which meetings can I physically get to? Distance on one axis, start time on the other, with your travel limit and free hours shaded in | For you |
| Speaking ruler | Is my comment short enough? The draft is timed against that city's limit on a ruler marked every fifteen seconds | Comment builder |
| Cadence strip | Does this council meet weekly or twice a month? Six weeks of its calendar as one small strip, repeated down the index | City index |
| Density matrix | When do councils meet? Weekday against start hour over ninety days | Insights |
| Dumbbell plot | How much of a council's calendar happens before the school day ends? Daytime and evening meetings per city, joined by a bar | Insights |
| Dot plot | What subjects fill upcoming agendas? | Insights |
| Unit chart | How long do cities let you speak, and how is coverage split by county? One square per city | Insights |
| City emblem | Where in the region is this council? The whole metroplex as a field of marks, with this city's hall struck through by a crosshair and tinted by county | City index, city pages, meeting drawer |

Every chart has a keyboard-reachable table view of the same numbers, an SVG description
for screen readers, and labels drawn from the same dictionaries as the rest of the app,
so the charts translate along with everything else.

## Profiles

Agora has no accounts, no sign-in, and no server holding anyone's data. A profile is a
separate saved setup in one browser: its own topics, availability, home city, language,
and first-meeting checklist. That covers the case the app actually has, which is a shared
school laptop where several students each want their own matches, without asking a minor
to create a password or hand over an email address.

Because nothing is stored remotely, the only way to move a setup between devices, or to
get it back after clearing browser data, is the export file on the Profiles page. The page
says so directly rather than implying a recovery that cannot exist. The optional email
field is used for exactly one thing, closing your own draft comment with a contact line,
and the form says that too.

A setup saved before profiles existed is migrated into the first profile on next load, so
nobody is sent back through onboarding.

## Design

The palette is taken from the material of a Greek public square: weathered limestone for
the ground, black-figure ink for text, fired clay for quantity in every chart, and Aegean
blue for anything you can act on. Headings and large figures are set in Palatino, which
descends from Renaissance humanist letterforms cut after Roman inscriptional capitals, and
the wordmark is letterspaced capitals the way a name is cut into stone. A running meander,
the border that ran along Greek architecture and pottery, appears once as the band the
masthead sits on, and the key figures are laid out as a colonnade under a single
architrave. The logo is a stoa, the covered walkway that edged the agora.

Underneath the reference, the structure is plain: hairline rules and typography instead of
drop shadows and rounded shapes, lists sharing one border with dividers between rows
instead of stacking separate floating cards, square panels, and color reserved for meaning
so a filled mark or a colored label always encodes something rather than decorating.
Charts follow a single set of rules: one hue for magnitude, recessive grids, direct labels
in place of legends wherever a label fits, and round axis values.

## How it is built

```
data/cities/*.json       one file per city: city hall, schedule rules, exceptions (with optional movedFrom/movedTo), public comment rules,
                         youth programs, agenda items, sources, confidence, lastVerified
data/cities.json         merged and validated by scripts/build-data.mjs
data/news.json           curated newsroom RSS feeds and topic links
packages/core            zero-dependency engine: schedule expansion, matching, geography, civics helpers
packages/server          Express API (meetings, match, news, geocode, stats, explain) and static hosting
packages/cli             terminal app built on core and server modules
packages/web             React + Vite + Leaflet PWA
```

The engine turns each city's recurrence rules ("2nd and 4th Mondays at 7 PM") into dated meetings, applies published cancellations and holiday shifts, attaches agenda items, and scores each meeting against a user's preferences with plain-language reasons. Preferences live in `localStorage` (web) or `~/.agora.json` (CLI). There are no accounts.

## Data

Schedules, addresses, and public comment rules come from each city's official website and adopted meeting calendar, gathered and then independently re-checked against those pages. Special meetings that are not on a city's adopted calendar are not included, and the dataset covers 39 cities, not every municipality in the region. Each city record carries `confidence` and `lastVerified`, and every city page links to its sources. Cities change schedules for holidays and special sessions, so the app always says: confirm on the city website before you go.

To add or fix a city, edit or add a file in `data/cities/` and run `npm run build:data`. The validator reports anything malformed.

## Languages

Every string in the web app, the engine, and the CLI comes from one dictionary per language in `packages/core/src/i18n/locales/` (English is the source of truth). City data is translated with a translation memory in `data/i18n/<lang>.json` that maps each English sentence to its translation; a sentence is only swapped when the English source still matches, so a data update falls back to English instead of showing a stale translation. The web app picks the browser language on first visit and remembers the choice from the language menu.

```bash
node scripts/i18n-check.mjs      # dictionary coverage per language
node scripts/i18n-extract.mjs    # data strings still untranslated per language
```

## Accessibility

Keyboard-navigable throughout, with a skip link, visible focus rings, a list alternative to the map, screen-reader labels on icons and pins, reduced-motion support, a forced-colors fallback, and a table view for every chart. Controls are compact with a mouse and grow to 44px targets on touch screens. The app ships one light theme; every color token is defined once in `packages/web/src/styles.css`, all text pairs clear WCAG AA contrast on the light surfaces, and interactive borders clear the 3:1 requirement for non-text contrast.

## Renaming

Product naming lives in one place: `packages/core/src/brand.js`. Package names use the `@agora` scope and the terminal command is `agora`. Preferences saved under the previous name are migrated on first load, so nobody has to redo onboarding.

## Contributing

Push access is limited to the team. If you have been added as a collaborator, branch off
`main`, open a pull request, and the CI workflow will run the test suites, the dictionary
parity check, and a production build against it before anyone merges.

## License

MIT. See [LICENSE](LICENSE).
