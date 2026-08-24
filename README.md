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
`modules/employers/service.ts` → `assertPublishable`. Nothing else in that
module sets `status: "ACTIVE"`. An unverified employer publishing a job advert
is how a jobs board becomes a recruitment-fee fraud channel.

**A coaching centre's outcome figures are claims, not facts.**
`courseOutcomeClaims` is a separate confidence-labelled table, never columns on
the course, and `components/course-claims.tsx` is the only thing that renders
one — it prints the label and the attribution alongside the number. Fees live on
batches, because a fee shown without the batch it belongs to is stale the moment
the next batch opens.

**A mentor is not listed until a credential is verified.**
`modules/mentors/service.ts` → `listableCondition()`, composed into every
listing query. Ratings are suppressed below three reviews, because a 5.0 from
one session is not information.

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
npm run build            # production build
bash scripts/smoke.sh    # 212 end-to-end checks against a running server
```

212 checks covering every route signed-out and signed-in, authorisation
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
answer outscores a vague one by a wide margin, and that requesting AI guidance
on a study plan never prevents the computed plan from being returned.

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
