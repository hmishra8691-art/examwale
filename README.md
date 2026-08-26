# ExamWale

An AI-assisted career, education, government exam, jobs and business guidance
platform. India-first, built so a second country is a data operation rather
than a rewrite.

This is the **MVP** described in section 46 of the product specification, built
against the architecture in `claude/architecture.md`.

---

## Running it

Requirements: Node 20+, Postgres 14+ (16 recommended).

```bash
# 1. Install
npm install

# 2. Configure — copy .env and point DATABASE_URL at your Postgres
cp .env .env.local        # or edit .env directly for local work

# 3. Create the schema (extensions, tables, search indexes)
npm run db:push

# 4. Seed the India starting corpus
npm run db:seed

# 5. Run
npm run dev               # http://localhost:3000
```

To wipe and start over: `npm run db:reset`.

**Upgrading an existing database** rather than seeding fresh? After `db:push`,
run `npm run db:backfill` once. It populates `provider_profiles` from mentors
created before Stage 3; without it those mentors disappear from listings, because
the listing query now joins their profile. It is idempotent, so running it twice
is harmless.

### Demo accounts

| Account | Password | Role |
|---|---|---|
| `admin@examwale.test` | `examwale-admin-2026` | Super admin |
| `demo@examwale.test` | `examwale-demo-2026` | Seeker, profile partly filled |
| `mentor.anita@examwale.test` (and 9 more `mentor.*`) | `examwale-mentor-2026` | Mentors — 7 listed, 3 awaiting credential checks |

Change or remove these before any deployment that isn't your laptop.

### Running without an AI key

The app is **fully usable with no `ANTHROPIC_API_KEY`**. Retrieval, citations,
safety filtering, the assessment engine, the reality-check engine, the study
planner and résumé parsing all run without a model — they are rules-based by
design, not stubs. What you lose is conversational chat, which falls back to a
deterministic responder that answers from the retrieved database records and
says plainly, in every reply, that it is doing so.

Set `ANTHROPIC_API_KEY` in `.env` to enable model-backed chat and the
model-assisted layer of document extraction.

---

## What's built

| Area | State |
|---|---|
| Email + password auth, Google OAuth, sessions, password reset | Working |
| User profile — education, interests, skills, goals, constraints | Working |
| Career database — 45 India careers, full detail pages | Working |
| Career exploration — filters, search, browse by field | Working |
| AI career assistant — streaming chat, modes, memory, citations | Working |
| Career assessment — transparent scoring with per-result reasoning | Working |
| Career roadmaps — template generation, dated steps, progress tracking | Working |
| Reality Check Engine — typed verdicts with the arithmetic shown | Working |
| Government exams — 17 exams with stages, syllabus, pay, resources | Working |
| Study plan generator — month-by-month from syllabus workload | Working |
| Job search — filters, detail pages, match scoring, applications | Working (seeded listings) |
| Résumé upload and analysis — extraction with a confirmation step | Working |
| Business module — 6 costed models with break-even calculator | Working |
| Personalised dashboard | Working |
| Admin — content management, publish gate, audit log, verification queue | Working |
| Universal search with natural-language intent parsing | Working |
| Pathways — after Class 10 and 12 | Working |

### Phase 2 (built)

| Area | State |
|---|---|
| Employer self-serve job posting — org registration, team invites, moderation queue | Working |
| Courses & coaching marketplace — providers, batches, confidence-labelled outcome claims, enquiries | Working |
| Mentors — profiles, credential verification, availability, bookings, reviews | Working |
| Premium billing — plans, subscriptions, entitlements, provider-agnostic payments | Working (no gateway wired) |
| Notification delivery — in-app centre, preferences, pluggable email/push channels | Working (channels no-op until configured) |
| Hindi localisation — full UI catalogue, content translation with provenance | Working |
| B2B dashboards — institutions, cohorts, consented aggregate reporting | Working |
| Advertising — campaigns, slots, mandatory disclosure, aggregate metrics | Working |

### Phase 3 (built)

Multi-country. The design claim was that opening a second market should be a
content operation rather than an engineering one, and the way to test that was
to actually do it: **the UAE is live**, seeded from `db/seed/uae-data.ts` and
loaded by `db/seed/uae.ts`, which together add no table, column, endpoint or
component.

| Area | State |
|---|---|
| Country resolution — profile → cookie → default, deduped per request | Working |
| Country switcher, active countries only | Working |
| Every service country-scoped (14 hardcoded `"IN"` defaults removed) | Working |
| Currency, number grouping, date locale and budget bands follow the country | Working |
| Declared per-section coverage, with a launch-readiness gate | Working |
| Admin country console — coverage editing, activate/deactivate | Working |
| India + UAE live, 8 occupations shared across both | Working |

### Phase 4 (built)

AI tools and the search rebuild. The governing rule is the same one the rest of
the product follows, applied to a new surface: **the model explains, it does not
decide.** Every number a user sees comes from a rulebook that is written out on
the page next to it, and every recommendation points at a record they can open.

| Area | State |
|---|---|
| Global typeahead search — live suggestions, ⌘K / `/`, keyboard navigation, question routing | Working |
| Résumé review — six weighted components, keyword match against the target role's own skills, line rewrites | Working |
| Interview practice — questions built from the role's guide, five-component answer rubric, rewrite in the candidate's words | Working |
| Personalised recommendations — deterministic shortlist, AI reorders within it by at most three places | Working |
| Study plan guidance — model commentary layered over the computed plan, never over the feasibility verdict | Working |
| AI hub with live quota, honest degradation with no API key | Working |

### Stage 1 — repairs (built)

Four defects found by auditing the deployed build against a marketplace brief.
Each was live, and each was the kind that reports success while doing nothing.

| Defect | Was | Now |
|---|---|---|
| Uploads on a serverless host | `getStore()` always returned the local-disk driver; Vercel's filesystem is discarded between requests, so files vanished with nothing in the logs | `STORAGE_DRIVER` is real. Default `postgres` keeps bytes beside their metadata row and works anywhere; `local` is refused on a serverless host rather than losing data quietly |
| Booking availability | `scheduledAt.getDay()`/`.getHours()` read the *server's* clock and compared it to minutes stored in the *mentor's* zone — 5h30 out under UTC, so 10:00 IST was refused and 15:30 IST accepted | One generator produces the offered slots and the same function validates the request, so what is offered is what is accepted. Mentors choose their zone; every rendered time names its zone |
| Rate limiting | An in-process `Map` behind 33 routes, on a platform that scales to zero — the limits had quietly become per-instance-per-lifetime | A Postgres counter is authoritative and resettable; the in-process map is now only the fallback for when the database is unreachable |
| Job expiry | `expires_at` was written and read by nothing, and `getJobBySlug` applied no status filter at all, so drafts and closed postings were readable by slug | One `liveJobCondition()` composed into every query, plus the row-level equivalent for the application endpoint |

Two further bugs surfaced while writing the regression checks, both invisible
until something was asserted about them:

- **A slot race returned 500.** The unique index on `(mentor_id, scheduled_at)`
  was doing its job — only one row was ever created — but the catch that turns
  the violation into "that slot has just been taken" tested `error.code`, and
  Drizzle hangs the driver error off `cause`. So the branch never ran and the
  loser of a race got a stack trace with a constraint name in it. Fixed with
  `isUniqueViolation`, which walks the cause chain.
- **The mentor's timezone was unreachable.** The column existed and defaulted to
  `Asia/Kolkata`; the editor had no field for it. Any mentor outside India was
  publishing hours that meant something other than what they typed.

### Stage 2 — the scheduler (built)

Nothing in this codebase could previously happen without a user present. There
was no cron entry, no queue, no scheduled route — everything ran inside a
request. The visible consequence: **six declared notification types could never
fire.** `mentor.session_reminder`, `exam.deadline_soon`, `roadmap.step_due`,
`billing.expiring`, `admin.verification_due` and the job expiry warning are all
time-based, and there was nothing to notice that time had passed. Each appeared
on every user's notification preferences screen with a toggle beside it. Turning
one off changed nothing, because it was already off.

The notification machinery, preference resolution, delivery channels and dedupe
index were all built and working. What was missing was anything to notice that
Tuesday had arrived.

| Piece | What it is |
|---|---|
| `/api/cron/tick` | The one entry point. Shared-secret auth compared in constant time; refuses everything when `CRON_SECRET` is unset, because the endpoint sends email |
| `modules/scheduler/tasks.ts` | Eight tasks, each declaring its own interval, row limit and description |
| `modules/scheduler/runner.ts` | Claiming, due-checking, overlap prevention, stale-run release |
| `scheduled_task_runs` | Append-only history. The clock the due check reads, and the answer to "did it run last night?" |
| `/admin/scheduler` | Every task with its interval, last run, rows touched and outcome — plus **Run now** |

**Cadence lives in the code, not in `vercel.json`.** Vercel's Hobby plan allows
two cron entries, each firing at most daily; a design with one entry per task
would not fit on it and would need rewriting to move hosts. So a task is due
when its last successful run is older than its declared interval, and the tick
just asks. Any authenticated caller on a timer works — Vercel Cron, GitHub
Actions, a home server. See `SCHEDULING.md`, which is honest about the one real
consequence: a daily tick makes session reminders useless, and says what to do
about it.

Three attempts at the claiming logic, and the two rejected ones are recorded in
the source because both looked correct:

1. Check `isDue()`, then insert. Two ticks both read "not run yet" and both
   proceeded. Eight concurrent ticks reproduced it immediately.
2. A single `INSERT … WHERE NOT EXISTS`, relying on a partial unique index on
   `RUNNING` to catch overlaps. Raced more subtly: under READ COMMITTED the
   subquery reads the snapshot from the *start* of the statement while the index
   is checked when the row is written. A first run finishing in between — these
   sweeps take about five milliseconds — flips `RUNNING` to `SUCCEEDED`, so the
   second tick sees no completed run *and* nothing to collide with.
3. A transaction-scoped advisory lock per task name. Zero duplicates across
   repeated rounds of eight concurrent ticks.

The practical impact of that race was nil — the purges are idempotent and every
notification carries a dedupe key — but "runs every N minutes" is the contract
this file offers to whoever adds the ninth task, and they will not have read the
comment.

### Stage 3 — provider identity (built)

A mentor and an employer were unrelated records with no way to be the same
person. Mentoring identity lived in `mentors`, coaching-centre identity in
`providers`, and an employer had no personal identity at all — only an
organisation. Somebody who mentors on Saturdays and posts jobs for their
employer on Tuesdays needed two accounts.

| Piece | What it is |
|---|---|
| `provider_profiles` | One professional identity per person: name, headline, bio, languages, timezone, links, self-declared certifications, visibility |
| `provider_capabilities` | One row per thing they offer, each with its own status — approved on its own terms |
| `/provider` | The hub. Shows what you offer, what is under review, and what else you could add against the same profile |
| `/provider/profile` | The editor. Change it once and it changes everywhere |
| `/admin/providers` | The moderation queue. A refusal without a reason is rejected by the server |
| `user_profiles.timezone` | Per-user timezone, closing the gap Stage 1 left open |

**Provider-ness is not a role.** The brief asked for `MENTOR`, `EMPLOYER` and
`COURSE_PROVIDER` as values on `users.role`, and that would have been the wrong
shape. A mentor is also a seeker; somebody who mentors and hires holds two
capabilities at once. A single-valued enum can express neither, so it would have
forced exactly the false choice — one account per thing you do — that the brief
exists to remove. `users.role` stays single-valued and answers "what may this
account do to the platform"; capabilities are multi-valued and answer "what does
this person offer".

`MODERATOR` **was** added to the role enum, because that one is genuinely a
platform-authority question and the gap was real: until now the only way to let
somebody review a job posting was to make them a full admin, with country
coverage and the audit log thrown in.

**The column move used expand–migrate–contract**, because this runs against a
live database. Seven professional-identity columns moved out of `mentors`; they
are still there, nullable and unread, marked `SUPERSEDED` in the schema, and
`npm run db:backfill` populated their new home. Nothing writes to them any more
so they cannot drift, and dropping them is a one-line change once the backfill
has been correct in production for a while. Dropping in the same deploy as the
code change would have made any failure unrecoverable.

Two things the compiler and the tests caught:

- **Every read site, found by the type checker.** Removing the columns from the
  schema type broke five files immediately, which is the argument for moving
  them properly rather than leaving two copies and a convention. The service
  composes the offer row with the profile back into one flat object, so
  `mentor.headline` reads exactly as it did — the abstraction sits at the
  service boundary, and no page changed.
- **The nav link keyed on the wrong thing.** First version showed "Provider" only
  to accounts holding an *approved* capability, which meant somebody with an
  application under review had no route back to the page telling them it was
  under review. It keys on having a profile now.

### Stage 4 — the job lifecycle (built)

The lifecycle used to live in two columns: `status` (DRAFT / ACTIVE / CLOSED) and
`moderation_status` (UNVERIFIED / PENDING / VERIFIED / REJECTED). Between them
they encoded a state machine nobody had written down — submitting for review
meant `status=DRAFT, moderation_status=PENDING` — so the states the brief asks
for existed as *combinations* with no names, and nothing prevented the impossible
ones. ACTIVE and REJECTED at the same time was two updates away.

One column now, ten named states, and every transition through one module that
says which moves are legal.

| State | What it means |
|---|---|
| `DRAFT` | Being written. Visible only to its own organisation |
| `SUBMITTED` | Sent for moderation, not yet picked up |
| `UNDER_REVIEW` | A moderator has it open — so a queue shows real progress |
| `APPROVED` | Passed moderation, not yet public. Normally waiting on organisation verification |
| `ACTIVE` | Live. The only status `liveJobCondition()` accepts |
| `REJECTED` | Refused, with the reason in `job_moderation_reviews` |
| `EXPIRED` | Past its deadline. Applications kept |
| `CLOSED` | The employer filled or withdrew the role |
| `SUSPENDED` | Taken down by a moderator. Only a moderator can lift it |
| `ARCHIVED` | Put away, recoverable, history intact |

`ACTIVE` keeps its name rather than becoming `PUBLISHED`: it already means
"published and visible" in every query that reads it, and renaming would churn
the module for no gain a user could see.

**`job_publication_periods` is the brief's history requirement.** One row per run
on the board, with a partial unique index enforcing at most one open period per
posting. Reviving does not reopen the old period — it opens a new one, so "this
role has been posted four times in eight months" stays a fact anybody can read.
Applications reference the posting rather than the period, so a candidate's
application is theirs regardless of how often the employer has relisted.

**`APPROVED` is the state that had nowhere to live.** Approving a posting whose
organisation was unverified used to throw, leaving it in `DRAFT` with no record
that it had passed review — so the work was repeated next time somebody opened
the queue. Now it lands on `APPROVED`, and verifying the organisation publishes
it immediately, with a scheduled sweep as the backstop.

**Expiry does not depend on the scheduler.** `liveJobCondition()` still filters
on `expires_at` at read time, so a posting stops being public the moment its
deadline passes. The `expire-job-postings` task moves the status so the
dashboards, the queue and the history agree with reality, and tells the owner —
neither of which a read-time filter can do. Correctness and bookkeeping are
separate on purpose.

Also here: the employer's posting page shows its state in words, the actions
legal from that state and nothing else, and its full run history. Two moderation
endpoints briefly existed; the duplicate was removed before it could drift.

### Stages 5 & 6 — availability and booking (built)

**Availability** gained the things a real calendar needs: dated exceptions,
buffers, and caps.

| Piece | Behaviour |
|---|---|
| Blocked time | A whole day or part of one. Always beats the weekly pattern *and* any extra window on the same date, in either write order |
| One-off hours | A window outside the usual pattern — a Sunday morning before results |
| Buffer | A gap after each session, separate from session length. A mentor wanting ten minutes to write notes should not have to advertise forty-minute sessions |
| Caps | Most per day, most per week. They count what is **booked**, not what is offered — with three a day and two booked, every remaining slot is still offered, or the third would be unreachable unless a seeker guessed the right time |

Exceptions store a plain date in the mentor's own zone rather than an instant:
"I am away on the 14th" is a claim about a calendar day where the mentor is, and
converting it to a UTC range makes it start and end at odd times for them.

**Booking** gained holds, and the shape of them is the interesting part. A hold
is a `mentorship_sessions` row with status `HELD` and an expiry, not a row in a
separate holds table — because the unique index on `(mentor_id, scheduled_at)`
is what actually settles two people wanting the same Tuesday. A second table
would mean two places competing for one instant and application code deciding
who won, which is the race the index exists to remove. Confirming a hold
*converts* that row; inserting beside it would collide with the seeker's own
reservation.

A lapsed hold frees its slot at read time, not when the sweep next runs — the
same separation of correctness from bookkeeping as job expiry. A held slot is
shown in the picker, marked "being booked", rather than silently vanishing:
disappearing options look like the mentor's hours changed while you were reading
them.

**Rescheduling** keeps the old row as `RESCHEDULED` and creates a new one
pointing back at it, rather than editing `scheduled_at` in place. The new one
goes back to `REQUESTED`, because a time the mentor accepted is not the same as a
time they have agreed to — silently keeping `ACCEPTED` across a change of day
puts a session in somebody's calendar they never agreed to.

**A bug that predated all of this**, surfaced by a test written for the new
reschedule flow: the slot uniqueness index was unconditional, so *any* row at an
instant reserved it forever. Cancel a session and the mentor could never offer
that time again; decline a request and the slot died with it. Nothing had
surfaced it because the failure presented as a double-booking conflict — exactly
what the index is supposed to produce. It is a partial index now, covering only
`HELD`, `REQUESTED` and `ACCEPTED`. `db:push` does not diff index predicates, so
`db/push.ts` drops and recreates this one explicitly.

### Stage 7 — profile pictures (built)

The governing rule is that **the bytes somebody uploads are never served back**.
Every image is decoded and re-encoded through sharp into two square WebP
variants — 128px for lists, 512px for profile headers — and the original is
discarded. One decision, three problems solved:

- **EXIF is dropped.** This is the one that matters. A photo taken on a phone
  carries the GPS coordinates it was taken at. A mentor uploading a selfie from
  home would otherwise publish their address to anyone who ran `exiftool` on
  their profile picture, and nothing in the interface would show it happening.
  It has a unit test for exactly that reason.
- **Polyglots stop working.** A file that is a valid JPEG *and* a valid HTML
  document is stored XSS the moment a browser guesses the wrong type. Re-encoding
  produces a file that is only an image.
- **The content type becomes true**, because we serve what we wrote.

SVG is refused rather than sanitised — it is a scripting format that happens to
draw pictures, and every sanitiser for it has a history of bypasses. Decoded
pixels are capped at 50 megapixels, separately from file size, because a few
kilobytes of PNG can decode to gigabytes.

**Who can see a picture:** anyone, for a publicly-listed provider — their profile
page already is public. A signed-in account otherwise. That second rule is looser
than a per-relationship check, and it is acceptable because user ids are random
21-character identifiers: there is no enumeration to do, so fetching somebody's
picture means already knowing their id. Tightening it to "people you share a
session, application or conversation with" belongs with messaging, where those
relationships will exist.

URLs carry the picture's content hash, so responses are cached for a year and
marked immutable — a new picture is a new URL, making a stale cache impossible
rather than merely unlikely. Removing a picture deletes the stored bytes, not
only the row: "delete my photo" that leaves the photo on the server is not a
deletion. Two people uploading the same photo share a content hash but not a
storage key, so one removing theirs does not touch the other's.

Where nobody has uploaded anything, initials sit on a colour derived from the
name — the same person is the same colour everywhere, which keeps a directory
scannable. That is the state most accounts are in, so it is designed for rather
than treated as a missing image.

### Stage 8 — messaging (built)

**You cannot message a stranger.** A conversation exists only where a real
relationship already does — a mentorship session, a job application, a course
enquiry — and that anchor is re-checked on every send, not only when the thread
was opened.

That is a constraint, and it is the point. This platform's users include school
students choosing what to do after Class 10, and its providers are adults they
have never met. An open inbox on such a platform is a grooming and spam channel
with a chat interface attached; every product that has shipped one has then spent
years building the controls back. The relationship requirement is not a feature
to be relaxed later — it is what makes shipping this responsible at all.

| Piece | Behaviour |
|---|---|
| Conversations | Anchored to a session, application or enquiry. The same two people can hold separate threads about two different applications |
| Unread | A per-participant high-water mark, counted in SQL rather than per row |
| Notifications | One per unread *run*, not per message — a four-message burst is one thing that happened. The message text is never in the notification, because notifications reach email and push |
| Blocking | Symmetric. A one-way block would let the blocker keep messaging somebody who cannot reply, which is a harassment tool wearing a safety feature's name |
| Reporting | Blocks by default, because reporting harassment and wanting it to stop are the same intention. Nothing is auto-actioned |
| Deletion | A tombstone within 15 minutes. The text is retained for moderation and shown to nobody else |
| Search | Joined through your own participation rows, so a matching term in a stranger's thread cannot surface |

**No end-to-end encryption is claimed.** The brief warned against asserting it,
correctly. What is true: TLS in transit, encryption at rest by the database
provider, an authorisation check on every read, and moderator access when a
message is reported. Real E2E is a different product with key management as its
hard part, and it would make the moderation this design depends on impossible.
The messages page says so in those words rather than showing a padlock that means
something else.

**Reports are never auto-actioned.** An automatic suspension on report is a
weapon for whoever reports the most, and on a platform where a mentor's
livelihood may depend on their listing, both a wrongly-suspended mentor and an
un-actioned harasser are real harms. A person decides, sees the surrounding
conversation, must record a reason for *either* outcome, and the reporter is told
what happened — a report that vanishes into silence teaches people not to file
the next one.

One bug the tests caught, invisible on screen: `getConversation` spread the
message row and overwrote `body`, which shipped `originalBody` — the retained
text of a *deleted* message — to the participant in the API response. The UI
never rendered it, so it took a check asserting the text was absent from the
response rather than from the page. Fields are listed explicitly now; nothing
that exists only for moderation leaves that function.

### Stage 9 — the services marketplace (built)

The generic surface for what jobs, courses and mentoring are not: résumé
reviews, interview coaching, consulting, training. Those three keep their own
tables because they have real structure — a salary band, a batch, a bookable
slot — and flattening them into one generic "listing" would have lost the parts
that make each useful. This is for everything without that structure, and it
stays deliberately thin.

**A request, not a purchase.** No money moves through this platform. A "Buy"
button that takes no payment and creates no obligation would misrepresent what
happens next, which is that two people start talking. Requesting a service opens
a conversation — using the messaging permission model from Stage 8, with a new
`SERVICE_REQUEST` context — and the arrangement gets made there, on the platform,
where it can be moderated. The directory says so at the top of the page.

**A price, or an explicit "depends on the work".** Leaving it blank is refused.
A directory of listings whose cost you can only learn by asking wastes the
buyer's time and the provider's; "priced per engagement" is a legitimate answer
for consulting and is offered as one, but it has to be chosen.

**Automated screening, human decision.** Four flags, none of which blocks
submission: guaranteeing an outcome, pushing contact to a personal number,
asking for payment before any conversation, and no concrete deliverable. A
service marketplace attracts exactly those, and they are what a moderator should
see first. Refusing still requires a written reason, and the provider receives
it.

The lifecycle deliberately mirrors `job_status` rather than inventing a second
vocabulary — a listing somebody writes, submits, and can have taken down is the
same problem twice. Editing a listed service returns it to draft, because what a
moderator approved is not what would then be public; *relisting a paused one does
not*, because it is the same listing they already read.

This also closes the honest gap Stage 3 left: the `SERVICE_PROVIDER` capability
said "nothing is published from this yet". It now points at a real screen.

### Stage 10 — the provider workspace (built)

By Stage 9 one person could be a mentor, an employer and a service provider at
once, and had three unrelated dashboards to check. Nothing told them which one
needed attention today. This stage adds `/provider`: a shell over the screens
that already exist, not a replacement for them.

**The nav is built from held capabilities, not from a fixed list.** A provider
approved only for mentoring sees mentoring links. Offering a link to something
somebody cannot use is how a dashboard becomes a list of disappointments. When
no provider profile exists at all the layout returns its children bare — no
empty chrome around a page that has nothing to frame.

**Several links leave `/provider` on purpose.** `/dashboard/mentor` and
`/employers/dashboard` work, are covered by tests, and reimplementing them
inside this shell to make the URLs tidy would be a rewrite with a nav bar as its
only visible result. The shell's job is making one person's several roles
reachable from one place.

Three views sit behind it, all in `src/modules/providers/workload.ts`:

- **`waitingForProvider()`** — the only genuinely new thing here. One
  oldest-first list across three kinds of pending work: session requests,
  unanswered messages, and listings sent back for revision. Sorting by age
  across all three is the point; a per-dashboard view can only ever tell you the
  oldest thing *of its own kind*, which is how a nine-day-old session request
  loses to a morning's unread message.
- **`providerWorkload()`** — counts, computed in one pass rather than three
  round trips.
- **`providerCalendar()`** — booked sessions and job-posting deadlines on one
  timeline, in the provider's own zone via the Stage 1 timezone module.

### Stage 11 — the adversarial pass (built)

Two independent reviews with narrow briefs — one on authorisation and IDOR, one
on data leaks, injection and XSS — against the whole surface built in Stages
1–10. Nine issues, all reproduced before being fixed. The four that mattered:

**A privacy control that did nothing.** Stage 3 built provider visibility with
three states and shipped the setting screen. No query ever read it. A mentor who
chose HIDDEN stayed in the public directory with their full biography, and their
own settings page told them otherwise — the worst version of this bug, because
the person had no way to notice. `listableCondition()` now requires
`visibility = 'PUBLIC'` for mentors *and* services, and a HIDDEN profile 404s on
its direct URL for everyone but its owner and an admin. LIMITED keeps its
intended meaning: reachable by link, absent from the directory.

**Moderation was bypassable in three permitted steps.** Close an approved
posting, edit its description into a recruitment-fee scam, revive it. Every step
was allowed on its own, and the result was unreviewed text on the public board
carrying an approval it had earned for different content. Editing now revokes
approval unconditionally — it previously fired only for `ACTIVE` postings, which
left the whole route open — and `publish()` refuses any employer posting with no
approval on record. Two independent gates, because either alone would have been
enough to miss this.

**Public endpoints returned whole rows.** The mentor API spread its database row
into the response, including `review_note` — the admin's private decision note,
readable by anyone, no session required. Credentials leaked the reviewing
admin's id and a link to the uploaded employment letter. Both now enumerate an
explicit column list; the *fact* of verification stays public because that is
the part a visitor needs.

**The chat renderer escaped the wrong characters.** It handled `<`, `>` and `&`
but not quotes, and dropped a captured URL into a double-quoted `href` — so a
quote closed the attribute and everything after it parsed as more attributes,
including `onmouseover`. It goes through `dangerouslySetInnerHTML`, which is
outside React's own escaping. Quotes are now encoded and link targets are
scheme-checked; `z.string().url()` validates shape, not scheme, and accepts
`javascript:`.

Also fixed: a search filter where a bare `%` matched every row (now escaped via
`likePattern()`, which also removes a cheap way to make Postgres backtrack across
every biography on an unauthenticated endpoint), and a payment idempotency
lookup with no user predicate, where a colliding key returned somebody else's
payment.

Every one of these has a regression check in `scripts/smoke.sh` under *Stage 11
· adversarial regressions*, written against the attack rather than the fix — the
moderation check performs the full close-edit-revive sequence and asserts the
scam text never reaches the board.

One fix broke twelve existing checks, which was the right outcome: a Stage 4
fixture created an `ACTIVE` employer posting with no approval row, a state that
cannot occur in reality. The fixture was wrong, not the gate.

### Security headers

Set in `next.config.ts` on every response: HSTS (two years, subdomains — not
`preload`, which should be a deliberate decision once the domain is settled),
`nosniff`, `X-Frame-Options: DENY`, a referrer policy that stops paths like
`/messages/<id>` reaching external sites, and a permissions policy denying
camera, microphone and location.

HSTS is the one that matters. Vercel serves only HTTPS and redirects plain HTTP,
but the redirect for a bare typed hostname travels over HTTP once, and that
request is interceptable. After the first visit the browser refuses HTTP for this
host entirely.

Three design decisions are worth stating, because they are what the code is
actually enforcing:

- **Scores are computed, never asserted.** The résumé score and the interview
  rubric are functions of the text — quantified-bullet share, STAR markers,
  ownership ratio, word count, overlap with the role's skill rows. A model
  writes the prose around them and can be swapped or absent without the number
  changing. Two drafts of the same résumé are therefore comparable, which is the
  only thing that makes a score worth showing.
- **Recommendations cannot leave the catalogue.** `scoreCareers` produces the
  shortlist from published guides; the model receives that list and may reorder
  it within three places and explain it. It cannot add a career. Asked openly, a
  model names occupations the platform has no guide, no verified pay range and
  no eligibility route for — and the user hits a dead end on the recommendation
  it was most enthusiastic about.
- **Every tool works with no API key.** The scoring, ranking, question
  generation and planning are all rule-based. What the key adds is prose. Where
  a rule wrote something a model would normally write, the output says so rather
  than passing it off as generated.

---

## Architecture

```
src/
  app/                    Next.js App Router — pages and /api/v1 route handlers
  components/             Shared UI (server and client components)
  db/
    schema.ts             The full data model, one file
    client.ts             Pooled Drizzle client
    push.ts               Schema push + extensions + FTS indexes
    seed/                 India starting corpus
  modules/                Business logic, partitioned by domain
    shared/               env, errors, http, rate limiting, audit, formatting
    auth/                 tokens, cookies, sessions, sign-in/up, redirect safety
    users/                profile, saved items, goals, completeness
    careers/              career listing, detail, affordability
    exams/                exam listing, detail, study plan generation
    jobs/                 job listing, detail, match scoring, applications
    documents/            upload validation, storage, extraction pipeline
    ai/                   provider abstraction, retrieval, prompts, safety, usage
                          resume-review, interview, guidance, study-narrative
    recommendations/      career suitability scoring
    roadmaps/             roadmap generation, reality check
    search/               universal search with intent parsing
    admin/                overview, publish gate, verification
    employers/            org registration, posting moderation, applicants
    courses/              marketplace, batches, outcome claims, enquiries
    mentors/              listability gate, availability, sessions, reviews
    billing/              plans, entitlements, subscriptions, payment provider
    notifications/        notify(), preferences, delivery channels
    i18n/                 locale resolution, message catalogues, translations
    b2b/                  cohorts, consent, suppressed aggregate reporting
    ads/                  slot selection, disclosure, aggregate counting
    geo/                  country resolution, coverage, launch gate
```

**Modular monolith.** One deployable, but modules don't reach into each other's
tables — cross-module access goes through the exporting module's service. The
two seams designed to be cut first are `ai` (token-bound scaling) and
`documents` (CPU-bound OCR); both are already isolated behind their own service
interfaces.

### Two decisions worth knowing about

**Drizzle, not Prisma.** Prisma's engine binaries could not be fetched in the
build environment. Drizzle is pure TypeScript with no download step, targets the
same Postgres, and gives more direct control over the raw SQL used in search and
retrieval. Migration path is unaffected.

**Country as a foreign key, not a code branch.** `occupations` and `skills` are
global; `career_profiles`, `exams` and `business_model_templates` are scoped to a
country. Adding the USA means adding rows, not `if (country === 'US')`. Five
inactive countries are seeded to prove the dimension works.

---

## The honesty machinery

This is the part of the codebase that most distinguishes it, so it's worth
reading before changing anything in it.

**Every fact carries provenance.** `sources`, `verification_records` and
`last_verified_at` are first-class. `modules/admin/publish.ts` refuses to publish
a career, exam or scheme record without a source and a live verification —
enforced in code, not documented as a convention. Seeded records get a 180-day
verification window so they surface in the admin re-check queue rather than
sitting "verified" forever.

**Retrieval runs before generation.** `modules/ai/retrieval.ts` queries the
database first and injects the results as ground truth. The model is never the
source of a fact the database already holds.

**Safety is post-processing, not prompting.** `modules/ai/safety.ts` rewrites
guarantee-language and appends topic-specific advisories after generation,
because a prompt instruction is not an enforcement mechanism — models drift,
prompts get edited, providers get swapped.

**The Reality Check Engine is a typed function.** `modules/roadmaps/reality-check.ts`
computes a verdict from arithmetic. Because it's computed rather than generated,
the product cannot drift into telling someone their impossible plan is fine.

**Extraction requires confirmation.** Nothing parsed from an uploaded document
reaches a user's profile until they tick the specific items they accept.

**Cycle data is deliberately empty.** Seeded exam editions have no dates.
Seeding a plausible-looking exam date is exactly the failure this product exists
to prevent.

The Phase 2 features each added one gate of the same kind:

**An employer posting needs a verified organisation and a human approval.**
`modules/employers/lifecycle.ts` → `publish()`, the only path that sets
`status: "ACTIVE"`. It checks the organisation is verified *and* that a matching
`job_moderation_reviews` approval exists — Stage 11 added the second half, after
a close-edit-revive sequence turned out to carry an old approval onto new text.
An unverified employer publishing a job advert is how a jobs board becomes a
recruitment-fee fraud channel.

**A coaching centre's outcome figures are claims, not facts.**
`courseOutcomeClaims` is a separate confidence-labelled table, never columns on
the course, and `components/course-claims.tsx` is the only thing that renders
one — it prints the label and the attribution alongside the number. Fees live on
batches, because a fee shown without the batch it belongs to is stale the moment
the next batch opens.

**A mentor is not listed until a credential is verified, and not then if they
asked not to be.** `modules/mentors/service.ts` → `listableCondition()`,
composed into every listing query: `ACTIVE`, credential verified, and
`visibility = 'PUBLIC'`. That last clause was missing until Stage 11, so the
privacy setting rendered on screen and changed nothing. Ratings are suppressed
below three reviews, because a 5.0 from one session is not information.

**Entitlements come from the subscription, never the session token.**
`modules/billing/entitlements.ts` → `getEntitlements`. Access keys off the paid
period ending, so a lapsed subscription stops entitling without waiting for a
job to notice, and a cancelled one keeps working until the period the user paid
for runs out.

**An institution sees aggregates, and only for students who consented.**
`modules/b2b/service.ts`. Membership requires the student's own action;
breakdowns are suppressed below five consented students; no query in that module
returns a row about a named person, and `cohortDisclosureForUser` generates the
student-facing disclosure from the same code so it cannot drift.

**An advert cannot appear unlabelled.** `disclosureLabel` is NOT NULL and
`components/ad-slot.tsx` is the only render path. Adverts never enter a ranking
or a result set — they occupy a closed list of named slots outside them. Ad
events are counted per creative per day, so billing an advertiser never requires
storing who saw what.

**A country cannot launch empty, and a gap must say which kind of gap it is.**
`modules/geo/service.ts` → `assertLaunchable`, checked at activation rather
than trusted from an earlier review. Coverage is *declared* per section, never
inferred from a row count, because a count cannot tell "we track this and there
are none" from "this does not exist here". The UAE is the case that forces it:
there is no equivalent of UPSC, so its exams section is NOT_APPLICABLE with an
explanation, rather than an empty list that reads as a broken page. Marking a
section covered while it has no rows is refused outright.

**A machine translation says it is one.** `translations.source` distinguishes
HUMAN, MACHINE_REVIEWED and MACHINE, and content falls back to the original
rather than guessing. A machine-translated exam eligibility rule that reads as
fluent Hindi is more dangerous than the English original, because the reader
cannot tell it might be wrong.

---

## Data provenance — read this before going live

The seed is a **starting corpus, not a verified dataset**:

- Structural facts (exam stages, qualification routes, licensing bodies) are
  accurate to the author's knowledge and attributed to the recruiting or
  regulating body.
- **Every number that moves** — salary bands, course costs, vacancy counts,
  fees — is seeded as an `ESTIMATED` value against an `EDITORIAL` source tiered
  `TERTIARY`, and is labelled as an estimate in the UI.
- Job listings are **fictional demonstration data** for ten invented companies,
  marked `source: "seed"` so they can be identified and purged.

Before real users see this: work the admin verification queue, replace the
editorial source on each record with a primary one, and delete the seeded job
listings.

---

## Testing

```bash
npm run typecheck        # tsc --noEmit
npm run test:unit        # 121 pure-function checks, no server or database
npm run build            # production build
bash scripts/smoke.sh    # 533 end-to-end checks against a running server
```

`test:unit` covers the timezone primitives, slot generation and avatar
processing directly —
daylight-saving gaps, seven zones, round-trips across a year of dates. Those are
pure functions, and they are the ones that decide whether a mentor's published
hours mean what the mentor typed, so they get tested at the arithmetic rather
than only through a fixture.

578 checks covering every route signed-out and signed-in, authorisation
boundaries, input validation, the publish gate, the reality-check engine, the
AI chat stream, the crisis-routing safety filter, regression tests for each
security fix listed below, and — for Phases 2 to 4 — each of the gates described
above, asserted against the database rather than against the UI. The later
checks are mostly adversarial: that no career chunk is tagged with the wrong
country, that no rupee figure appears in a UAE record, that the launch gate
refuses an empty country and leaves it inactive, that a second subscription row
is rejected by Postgres rather than by convention, that typeahead suggestions
never preview a record the results page would refuse to show, that every
recommended career slug resolves to a live page, that a structured interview
answer outscores a vague one by a wide margin, that requesting AI guidance
on a study plan never prevents the computed plan from being returned, and — after
the Stage 1 repairs below — that an expired posting leaves every surface at once,
that uploaded bytes reach the object store rather than only its metadata row,
that a rate limit is recorded where a second instance can see it, that a
mentor's 10:00 means 10:00 where the mentor is, that eight
simultaneous scheduler ticks run each task exactly once, that one person can
hold two provider capabilities against a single professional profile, that a
revived job posting keeps every application from its previous runs, that a
slot held by one seeker cannot be taken by another, that a profile picture
reaches the page with its GPS coordinates removed, that nobody can open a
conversation with somebody they have no connection to, and that a service listing
promising a guaranteed job is flagged before a moderator reads it.

The suite talks to Postgres directly for the assertions the UI cannot prove.
Override the connection when your local role is not the development default:

```bash
PSQL="psql -h localhost -U postgres -d examwala" bash scripts/smoke.sh
```

---

## Security notes

Found and fixed during an adversarial review of this codebase:

- **IDOR on AI conversations** — `conversationId` came from the request body and
  was used without an ownership check, letting one user read and write another's
  thread. Now goes through `assertConversationOwner`.
- **Login timing oracle** — the "same timing either way" dummy hash was 59
  characters, so bcrypt rejected it on a length check and returned in ~0 ms
  against ~300 ms for a real comparison, revealing whether an address was
  registered. Replaced with a valid 60-character hash.
- **Open redirect** — `?next=` was used verbatim after sign-in. Now validated by
  `modules/auth/redirect.ts` (same-origin paths only).
- **Unvalidated enum cast** — the document `type` form field was cast rather than
  parsed, producing a 500 and an orphaned file on disk for any typo.
- **Unbounded date horizon** — the study planner allocated one object per month
  with no ceiling; a year-9999 target allocated millions. Capped at ten years.
- **NaN query parameters** — `?page=x` reached SQL as `NaN` and 500'd public
  pages. All page params now go through `modules/shared/params.ts`.
- **Orphaned PII on delete** — no foreign keys means no cascade, so deleting a
  résumé left the parsed name, phone and employment history in
  `document_extractions`. Child rows are now deleted explicitly.
- **Spoofable rate-limit keys** — `X-Forwarded-For` was trusted unconditionally.
  Now opt-in via `TRUST_PROXY`, with per-account and per-email limits as the
  meaningful defence and a loose global ceiling as the fallback.

### Before deploying

1. Set a real `AUTH_SECRET` (`openssl rand -base64 48`).
2. Set `TRUST_PROXY` to your actual proxy hop count.
3. Move `STORAGE_DRIVER` to S3-compatible storage; implement the `ObjectStore`
   interface in `modules/documents/storage.ts`.
4. Put a real antivirus scanner in front of the document pipeline — the
   structural checks in `validate.ts` are a screen, not a scanner.
5. Replace the in-process rate limiter with a Redis implementation before
   running more than one instance. Call sites don't change.
6. Wire an email provider for password reset — the token is currently returned
   in the response body in development only.
7. Remove the demo accounts and the seeded job listings.

---

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (required) |
| `AUTH_SECRET` | JWT signing key (required — change it) |
| `AUTH_ACCESS_TTL_SECONDS` / `AUTH_REFRESH_TTL_SECONDS` | Session lifetimes |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Google sign-in; omit to disable |
| `ANTHROPIC_API_KEY` | Enables model-backed chat; omit to run rules-only |
| `AI_MODEL` | Model identifier |
| `AI_FREE_DAILY_MESSAGE_LIMIT` / `AI_PREMIUM_DAILY_MESSAGE_LIMIT` | Freemium caps |
| `STORAGE_DRIVER` / `STORAGE_LOCAL_DIR` / `MAX_UPLOAD_BYTES` | Document storage |
| `TRUST_PROXY` | Trusted reverse-proxy hop count; 0 ignores `X-Forwarded-For` |
| `APP_URL` | Absolute base URL for OAuth redirects |
| `DEFAULT_COUNTRY` | ISO code for the default content scope |
| `PAYMENT_PROVIDER` | Payment gateway; omit for `manual` (records intents, takes no money) |
| `EMAIL_PROVIDER` / `EMAIL_FROM` | Enables the email notification channel; omit and it suppresses cleanly |
| `PUSH_PROVIDER` | Enables the push notification channel |
