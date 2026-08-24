# ExamWale — Architecture & Planning Document
### AI-Powered Career, Education, Jobs & Business Guidance Platform
Version 0.1 — August 2026 — India-first, global-ready

Published, navigable version (with diagrams): https://claude.ai/code/artifact/ff857c0a-ef20-4451-be20-1cf9713c0540

---

## 0. Product Principle (recap)

One question drives every screen: **"Given who I am, what I want, and what I have — what should I do next?"**

Two architectural consequences follow directly from that:

1. **Every recommendation must be explainable and honest.** The system distinguishes verified fact (official source, dated), estimate (derived from data with a stated method), and AI judgment (clearly labeled, never guaranteed). This is not a UI nicety — it has to be a field on the data model (§3) and a rule in the AI layer (§6), not just a prompt instruction.
2. **India-first must not become India-hardcoded.** Every entity that varies by country (curricula, exams, licensing, currency, salary) is modeled as a *country-scoped instance* of a *country-agnostic concept*. §1 and §3 make this the spine of the schema.

Everything below is written to support the MVP in §12 first, with the full 48-section vision reachable by extension rather than rewrite.

---

## 1. Information Architecture

### 1.1 The core insight: separate the universal taxonomy from the local instance

The spec's own hierarchy (§37) —

```
Country → State/Province → Education System → Qualification → Career → Occupation
        → Exam → Employer → Regulation → Salary/Currency → Opportunity
```

— is really two graphs glued together:

- **A. Global taxonomy (country-agnostic).** "Software Developer," "Cardiologist," "Electrician" are universal *occupations*. Their existence, skill clusters, and relationships to other occupations don't change by country.
- **B. Local instance (country-scoped).** How you *become* a Software Developer in India (BTech/BCA, JEE, private colleges, ₹2–8L salary, no licensing) versus in the USA (CS degree or bootcamp, H1B considerations, licensing not required, USD salary) versus becoming a Doctor in India (NEET → MBBS → NMC registration) versus the USA (MCAT → MD/DO → USMLE → state license) are completely different *CareerProfiles* pointing at the same *Occupation*.

This split is the single most important architecture decision in the whole platform: it's what lets "add a country" mean "add rows," not "add code." Section 8 (career database), §10 (exams), §14 (jobs), and §17 (business) are all country-scoped content that hang off this taxonomy.

### 1.2 Top-level content domains

| Domain | Examples | Scope |
|---|---|---|
| **Taxonomy** | Occupation, Skill, Industry | Global |
| **Education** | EducationSystem, Stage (Class 10/12 equiv.), Qualification, Institution | Country-scoped |
| **Career content** | CareerProfile, Roadmap template | Country-scoped, keyed to Occupation |
| **Government exams** | Exam, ExamEdition, Syllabus | Country-scoped, keyed to recruiting Organization |
| **Jobs marketplace** | Company, JobPosting, Application | Country/region-scoped, live/transactional |
| **Learning resources** | Course, Book, Provider | Region-scoped where physical, global where digital |
| **Business/entrepreneurship** | BusinessModelTemplate, License requirement | Country-scoped |
| **Organizations (two-sided)** | Employer, Coaching institute, University, Mentor | Country-scoped, verified |
| **User space** | Profile, Documents, Roadmap instance, Conversations, Saved items | Per-user |
| **Governance/meta** | Source, VerificationRecord, AuditLog | Cross-cutting |

### 1.3 Content sensitivity tiers (drives §3 schema + §9 access rules)

- **Tier 1 — Reference (public, cacheable):** career guides, exam structure, education pathways, general salary bands. No login required (spec §23).
- **Tier 2 — Personalized (login required):** AI recommendations, roadmaps, saved items, document analysis, applications.
- **Tier 3 — Transactional (login + verification):** job applications, payments, organization-to-user messaging.
- **Tier 4 — Regulated/high-stakes (extra caution flags):** medical/legal licensing info, exam eligibility, government scheme eligibility — always carries `confidence_level` + `source` + `last_verified_at` and a "verify with official source" nudge (spec §36).

---

## 2. Key User Journeys

Five journeys cover the seeker side end-to-end; a sixth covers the provider side. Every journey is written as *screen → decision → next screen* so it maps directly onto routes in §4.

**J1 — School student, undecided ("I'm in class 10, I like computers, what next?")**
Landing AI input → lightweight interest/aptitude micro-quiz (no login) → ranked pathway suggestions (Science/Commerce/Arts/Vocational) shown as Tier-1 content → "see full picture" prompts signup → full profile (education, interests, constraints) → AI Career Assessment (§6 of spec) → ranked career directions with explainability → pick one → Career Detail Page → Roadmap generated (Class 10 → Class 12 stream → entrance exam → degree → job) → save roadmap (login-gated) → dashboard.

**J2 — Career changer ("25, want to change careers")**
Landing AI input → parses intent → asks for current profile (skip if resumed from earlier) → Document upload (resume) triggers Job Matching AI (§15) → skill-gap output → Reality Check Engine (§26) validates the target career against current skills/timeline/budget → realistic roadmap with alternates → resume assistant + course/certification recommendations → job search filtered to matched roles.

**J3 — Government exam aspirant ("prepare for UPSC while working")**
Search/AI query → Exam Detail Page (Tier 1, no login) → login to generate personalized plan → input: hours/day, target date, current knowledge → Study Roadmap Generator (§11) produces month-by-month + weekly plan with confidence language, not guarantees → books/resources by budget tier (§12) → progress tracking on dashboard → notifications for syllabus milestones and official notification updates.

**J4 — Entrepreneur ("₹50,000, want to start a business")**
Landing AI input → Entrepreneurship module (§17) asks clarifying questions (location, time, risk tolerance, skills) → 3–5 business model candidates with full cost/license/break-even breakdown → pick one → 30/60/90-day launch plan saved to dashboard → optional: upload existing business plan for AI Business Advisor (§18) analysis.

**J5 — Recruiter/employer/coaching institute (Opportunity Provider)**
Separate "For Organizations" entry point → org signup → verification flow (business registration / institute accreditation document upload → admin review queue, §8/§21) → org dashboard → post job/course/opportunity → set targeting (location, education, skills) → view applicants/leads → (Premium/B2B) analytics + featured placement.

**J6 — Anonymous browsing (SEO / Tier 1 access)**
Any career/exam/job-category page is crawlable and usable without an account; every such page ends in a "What should I do next?" CTA that routes into J1–J4 once the user engages.

---

## 3. Database Schema

Postgres, with a vector extension (pgvector) for embeddings and full-text/search index (Postgres FTS to start, Elasticsearch/Meilisearch later — §11 of this doc). Schema shown as entity groups with key fields and relationships; not full DDL.

### 3.1 Geography & taxonomy (global, rarely written, heavily read/cached)

```
countries(id, iso_code, name, currency_code, default_locale)
regions(id, country_id FK, name, type[state|province|territory])
education_systems(id, country_id FK, name)                        -- e.g. "India CBSE/State Boards"
education_stages(id, education_system_id FK, name, sequence)      -- "Class 10", "Class 12", "Undergraduate"
qualifications(id, education_system_id FK, name, level, stage_id FK)

occupations(id, global_code, name, description, occupation_group_id FK)   -- country-agnostic
occupation_groups(id, name, parent_id FK)                                  -- Technology > Software > ...
skills(id, name, category)
occupation_skills(occupation_id FK, skill_id FK, importance)
```

### 3.2 Career content (country-scoped instance of an Occupation)

```
career_profiles(id, occupation_id FK, country_id FK, region_id FK NULL,
                 summary, day_to_day, work_environment,
                 education_required_json, eligibility_json,
                 time_required_months_min, time_required_months_max,
                 cost_min, cost_max, currency_code,
                 salary_entry_min, salary_entry_max,
                 salary_mid_min, salary_mid_max,
                 salary_senior_min, salary_senior_max,
                 self_employment_possible bool, remote_possible bool,
                 international_demand_note,
                 automation_risk_level, future_demand_level,
                 competition_level, difficulty_level,
                 advantages_json, disadvantages_json,
                 status[draft|published|needs_review],
                 source_id FK, last_verified_at)

career_pathways(id, from_stage_id FK, to_options_json)     -- "after Class 10 -> [Science, Commerce, Arts, ITI, Vocational]"
career_related(career_profile_id FK, related_career_profile_id FK, relation_type)
career_certifications(career_profile_id FK, name, provider, cost_estimate)
career_entrance_exams(career_profile_id FK, exam_id FK)
career_scholarships(career_profile_id FK, scholarship_id FK)
```

`education_required_json` / `eligibility_json` etc. are JSONB, not because the schema is lazy, but because eligibility structures genuinely differ by country and profession (a medical license clause is not shaped like an ITI diploma clause). Anything reused across pages (salary, cost, time, source/verification) stays as first-class typed columns so filtering, sorting, and the "Can I afford this?" calculator (§27) don't have to parse JSON.

### 3.3 Government exams

```
organizations_gov(id, name, country_id FK, type[central|state|psu|regulatory])
exams(id, name, organization_id FK, country_id FK, category, description,
      eligibility_json, age_limit_json, nationality_requirement,
      official_website, status, source_id FK, last_verified_at)
exam_editions(id, exam_id FK, year, notification_date, application_start, application_end,
              exam_dates_json, official_notification_url, source_id FK, last_verified_at)
exam_stages(id, exam_id FK, name, sequence, pattern_json, duration_minutes,
            marks_total, negative_marking bool, negative_marking_ratio)
exam_syllabus_topics(id, exam_id FK, stage_id FK, subject, topic, weight_estimate)
exam_selection_steps(exam_id FK, sequence, name, description)
exam_pay_structure(exam_id FK, post_name, pay_level, gross_range_min, gross_range_max, currency_code)
```

Exam data is explicitly versioned by `exam_editions` (year-specific) separate from the stable `exams` record, because dates/pattern changes every cycle but eligibility/structure is mostly stable — this is what lets §10's "don't hardcode outdated information" become a data-modeling fact rather than a hope.

### 3.4 Jobs marketplace

```
companies(id, name, country_id FK, industry, size_band, verification_status, logo_url)
job_postings(id, company_id FK, title, occupation_id FK NULL, description,
             employment_type[full_time|part_time|contract|internship|apprenticeship],
             location_region_id FK, remote_type[onsite|hybrid|remote],
             experience_min_years, experience_max_years,
             education_required, skills_required_json,
             salary_min, salary_max, currency_code, is_salary_disclosed,
             status[draft|active|closed], posted_at, expires_at, source[direct|aggregated], source_id FK)
job_applications(id, user_id FK, job_posting_id FK, resume_document_id FK,
                 cover_letter_document_id FK, status, applied_at, match_score, match_explanation_json)
```

### 3.5 Learning resources & courses

```
providers(id, name, type[university|coaching|online_platform|publisher], country_id FK, verification_status)
courses(id, provider_id FK, title, format[online|offline|hybrid], cost, currency_code,
        duration, related_career_profile_ids[], related_exam_ids[], is_free, source_id FK, last_verified_at)
books(id, title, author, related_exam_ids[], related_career_profile_ids[], isbn, note)
```

Real-time price/availability (spec §12: "do not fabricate prices") is *not* stored as ground truth in this table for volatile fields — see §7 (data ingestion) for the pull-and-timestamp pattern.

### 3.6 Business/entrepreneurship

```
business_categories(id, name, parent_id FK)
business_model_templates(id, category_id FK, country_id FK, name, target_customer,
                          startup_cost_min, startup_cost_max, currency_code,
                          fixed_costs_json, variable_costs_json, required_licenses_json,
                          required_skills_json, break_even_model_json, risks_json,
                          growth_opportunities_json, source_id FK, last_verified_at)
```

### 3.7 Organizations (two-sided marketplace, spec §21/§22)

```
organizations(id, name, type[employer|coaching|university|mentor|training_provider],
              country_id FK, verification_status[unverified|pending|verified|rejected],
              verification_documents_json, contact_email, website, created_at)
organization_members(organization_id FK, user_id FK, role[owner|admin|recruiter|editor])
opportunities(id, organization_id FK, type[job|internship|apprenticeship|course|mentorship],
              ref_id, title, status, published_at)   -- unifying feed row, points at job_postings/courses/etc.
```

### 3.8 Users & personalization

```
users(id, email, phone, auth_provider, password_hash NULL, email_verified, created_at, last_login_at)
user_profiles(user_id FK, age, country_id FK, region_id FK, city, preferred_language,
              current_stage_id FK, degree, major, institution, academic_performance,
              employment_status, available_budget, available_hours_per_day,
              preferred_location_region_id FK, willingness_to_relocate bool,
              online_offline_preference, risk_tolerance, desired_income_min)
user_interests(user_id FK, interest_tag)
user_skills(user_id FK, skill_id FK, proficiency, source[self_reported|ai_extracted])
user_goals(user_id FK, goal_type, target_career_profile_id FK NULL, target_exam_id FK NULL, priority)
user_documents(id, user_id FK, type[resume|marksheet|certificate|business_plan|other],
               file_url, uploaded_at, extraction_status)
document_extractions(document_id FK, extracted_json, confidence_scores_json,
                      model_version, extracted_at, reviewed_by_user bool)
saved_items(id, user_id FK, item_type[career|job|exam|course|business|organization],
            item_id, saved_at, notes)
roadmaps(id, user_id FK, title, goal_description, generated_by[ai|template], created_at)
roadmap_steps(id, roadmap_id FK, sequence, title, description, ref_type, ref_id,
              status[not_started|in_progress|done], target_date, actual_completion_date)
ai_conversations(id, user_id FK NULL, mode[career|exam|job|business|education|resume|interview],
                  created_at)
ai_messages(id, conversation_id FK, role[user|assistant], content, citations_json,
            confidence_label, created_at)
notifications(id, user_id FK, type, payload_json, read_at, created_at)
subscriptions(id, user_id_or_org_id, plan, status, current_period_end, payment_provider_ref)
```

### 3.9 Governance & data quality (cross-cutting — spec §34, §36)

```
sources(id, name, url, type[official_government|official_institution|aggregator|ai_generated],
        country_id FK, region_id FK, reliability_tier)
verification_records(entity_type, entity_id, source_id FK, verified_by[admin_id|automated_job],
                      verified_at, expires_at, status[verified|stale|disputed])
audit_logs(id, actor_type[admin|system|user], actor_id, action, entity_type, entity_id,
           before_json, after_json, created_at)
```

Every Tier-4 record (§1.3) must resolve to a non-null `source_id` and `last_verified_at`/`verified_at` before it's allowed to leave `draft`/`needs_review` status — enforced at the admin-workflow level (§8), not just by convention.

---

## 4. API & Service Architecture

### 4.1 Shape: modular monolith first, service seams from day one

Spec §41 says "keep business logic modular" and §46 says "do not create a huge monolithic application" — the reconciliation is a **modular monolith**: one deployable Next.js/Node app, but code and database access are partitioned into modules with enforced boundaries (no module reaches into another's tables directly; cross-module calls go through a typed internal service interface). This gets 90% of the benefit of microservices (independent reasoning, testability, extractability) with none of the early-stage operational cost. Modules that get their own service first when load demands it: **AI layer** (different scaling profile — GPU/token-bound) and **document processing** (CPU/OCR-bound, spiky).

Modules: `auth`, `users`, `careers`, `exams`, `jobs`, `education`, `businesses`, `organizations`, `ai`, `documents`, `recommendations`, `search`, `payments`, `notifications`, `admin`.

### 4.2 API style

REST + JSON over HTTPS, versioned (`/api/v1/...`), because the consumer set (own web app now, mobile apps later per §41, possible third-party B2B integrations per §17 monetization) favors a stable, cacheable, widely-understood contract over GraphQL's flexibility. Two exceptions:

- **AI endpoints are streaming** (Server-Sent Events or streaming HTTP) for chat/assessment responses — the perceived latency of career guidance answers matters.
- **Search is a dedicated endpoint** (`/api/v1/search?q=...`) that fans out to structured filters + full-text + (later) semantic search, not a generic CRUD list endpoint.

### 4.3 Representative endpoint groups

```
/api/v1/auth/*                 signup, login, oauth callback, refresh, reset-password
/api/v1/users/me, /me/profile, /me/documents, /me/saved-items, /me/roadmaps
/api/v1/careers, /careers/:id, /careers/:id/roadmap-template
/api/v1/exams, /exams/:id, /exams/:id/study-plan (POST: hours/day, target_date)
/api/v1/jobs, /jobs/:id, /jobs/:id/apply
/api/v1/businesses/generate (POST: budget, location, interests -> candidate models)
/api/v1/documents (POST upload) -> /documents/:id/analysis
/api/v1/ai/assess (career assessment), /ai/chat (SSE), /ai/reality-check
/api/v1/recommendations/me
/api/v1/organizations/*, /organizations/:id/opportunities
/api/v1/admin/*                 (separate auth scope, see §5)
```

### 4.4 Mobile-readiness

Because the web app also consumes this same REST API (no server-rendered-only shortcuts for data fetching, no logic embedded only in React components), a React Native or native mobile client is additive later, not a rewrite — spec §41's explicit requirement.

---

## 5. Authentication & Authorization

- **Identity:** email+password (bcrypt/argon2 hashed), Google OAuth, extensible OAuth provider table (`auth_provider` on `users`) so LinkedIn/Apple/etc. can be added without a schema change. Sessions via short-lived JWT access token + rotating refresh token in an httpOnly cookie.
- **Password reset:** signed, time-limited token emailed; standard flow, rate-limited.
- **Roles:** `seeker` (default), `org_member` (scoped to one or more `organizations` via `organization_members.role`), `admin` (staff, §8), `super_admin`. Authorization is enforced via middleware checking role + resource ownership (e.g., a `recruiter` can edit only `job_postings` under their own `organization_id`).
- **Organization verification** (spec §21) is a distinct state machine from account auth: an org account can log in immediately but stays `unverified` (can't publish live opportunities, shown a "pending verification" banner) until an admin reviews submitted documents (business registration, accreditation certificate) — see §8.
- **Guest access:** Tier 1 content (§1.3) requires no session at all; the API layer treats an absent auth token as "public reader," not an error.

---

## 6. AI Architecture

This is the platform's core differentiator, so it gets more structure than a single "call an LLM" box.

### 6.1 Layers

```
User query / document
      │
      ▼
[1] Intent & mode router  — classify: career-explore | exam-plan | job-match | business |
                             document-analysis | reality-check | general-chat
      │
      ▼
[2] Context assembly       — pull user_profile, relevant saved_items, conversation history
      │
      ▼
[3] Retrieval (RAG)        — pgvector similarity search over career_profiles, exams, courses,
                              business_model_templates (embeddings kept in sync on write)
                              + structured filters (country, budget, stage) BEFORE the LLM call
      │
      ▼
[4] LLM provider abstraction — single internal interface; providers (Claude, others) are
                                pluggable adapters, chosen per task by cost/quality/latency
      │
      ▼
[5] Structured output layer — LLM is forced into a JSON schema per task (ranked careers with
                                scores+reasons; roadmap steps; extracted document fields) —
                                never free text where the UI needs to render structured data
      │
      ▼
[6] Grounding & safety check — verified DB facts are injected as ground truth and the model is
                                instructed (and post-hoc checked) not to contradict them;
                                confidence/label classifier tags each claim as
                                verified | estimated | ai_recommendation
      │
      ▼
[7] Response + citations   — every factual claim links back to a source_id / verification_record
                              where one exists; AI-only judgment is visually and textually labeled
```

Rule 6.1 encodes spec §42's most important sentence directly into the pipeline: **"Do not allow the AI to directly invent database information when verified data is already available. Use retrieved/verified information as the primary source."** — retrieval happens *before* generation, and the DB, not the model's memory, is the source of truth for anything that has a row.

### 6.2 The Reality Check Engine (spec §26) as a first-class AI mode

Not a generic chat prompt — a structured function: inputs `(current_skill_level, available_hours_per_day, target_skill_or_role, timeline, target_income)` are compared against `career_profiles`/`exam` workload data (time_required, syllabus size) to produce a typed verdict `{achievable | difficult | highly_unlikely | needs_adjustment}` plus a *quantified* reason ("X hours/week implied vs. Y hours/week typical for this workload") and an alternative roadmap. This keeps the tone the spec insists on ("appears achievable if... but depends on...") structurally impossible to skip, rather than dependent on prompt phrasing holding up over time.

### 6.3 Document intelligence pipeline

```
Upload → file validation (type/size/malware scan) → text extraction/OCR (pdf-parse / OCR service
for scanned docs) → document classification (resume | marksheet | exam notification | business
plan | ...) → structured extraction (schema-per-doc-type via [5] above) → confidence scoring →
user review/confirmation step → merge into user_profile / user_skills (only on confirmation, or
flagged "AI-extracted, unconfirmed") → downstream: job matching, exam action plan, business analysis
```

The **user-confirmation step** matters: AI-extracted skills/eligibility populate the profile as *proposed* facts (`source = ai_extracted`) until the user confirms or edits them, which is both a UX trust feature and the mechanism that satisfies spec §19/§43's "clearly distinguish extracted information from assumptions."

### 6.4 Conversation memory & modes

`ai_conversations` are scoped by `mode` (spec §20 lists Career Planning / Government Exams / Job Search / Business Planning / Education / Resume / Interview Prep as separate threads). Context assembly (layer 2) pulls the current thread plus a compact rolling summary of the user's profile — not the full history of every other thread — to keep prompts bounded and relevant.

### 6.5 Safety rules enforced in code, not just prompt text

- Hard-coded disclaimer injection on any response touching admission/employment/salary/business-profit/exam-success/visa/licensing guarantees (spec §36) — a post-processing filter checks for guarantee-language patterns and appends the standard caveat if the model's own instruction-following slips.
- Sponsored/advertised content (spec §33) is structurally excluded from the retrieval set used for AI ranking — ads are a separate `is_sponsored` flag never passed into the recommendation prompt's ranked-candidate list, only rendered adjacently in the UI.
- AI usage tracked per user/request (`ai_usage_logs`: tokens, cost, mode, latency) for both cost control and the freemium usage-limit enforcement in §9.

---

## 7. Data Ingestion & Verification Architecture

Government/exam/salary data goes stale fast and is the highest-liability content on the platform (spec §34, §36), so it gets its own pipeline rather than being treated like ordinary CMS content:

```
Source registration (official URL, country, region, reliability_tier)
      │
      ▼
Scheduled fetch job (per source, e.g. weekly for exam notifications, quarterly for salary data)
      │
      ▼
Diff against current DB record → if changed, create a "proposed update" (not a live write)
      │
      ▼
Admin review queue (§8) — human confirms against the source before publish
      │
      ▼
Publish → stamps source_id + last_verified_at, old version kept in history for audit
      │
      ▼
Expiration watch — records past a staleness threshold (e.g., exam edition after its cycle ends)
                    auto-flag as "needs_review" and are hidden from "current" views, not deleted
```

For content with no reliable automated feed (many scholarship/scheme pages), the same queue accepts manual admin entry — the pipeline's contract is "nothing reaches `published` without a `source_id` and a human or automated verification event," not "everything is automated." Course/book pricing (spec §12's "do not fabricate prices") is treated as **live-lookup, not stored ground truth**: where a real-time product/search API is integrated later, price is fetched at render time and timestamped; until then, the UI shows "approximate cost — verify current price" rather than a stored number presented as current.

---

## 8. Admin Architecture

Single admin app (separate route namespace + auth scope, not a separate deployable initially) covering the modules in spec §35:

- **Content management** — careers, exams (+ editions), courses, businesses: create/edit with mandatory source + verification fields before publish; diff view for proposed automated updates (§7).
- **Organization verification queue** — review submitted documents, approve/reject, message the applicant.
- **User & moderation** — search users, handle reports, suspend accounts, review flagged AI conversations (safety monitoring, not general surveillance).
- **Job/opportunity moderation** — spam/scam detection queue before a posting goes live, especially for unverified organizations.
- **AI knowledge management** — view/edit the retrieval corpus, flag bad AI responses reported by users, manage prompt/template versions.
- **Advertising** — sponsored content management, clearly separated (§6.5) from organic ranking.
- **Subscriptions & payments** — view/refund, dunning status.
- **Audit log viewer** — every admin mutation is written to `audit_logs` (§3.9) with before/after state; append-only, queryable by entity or actor.

Role-scoped: a content-moderator admin cannot touch payments; a finance admin cannot edit career content. Same `admin` role table, permission bits per module.

---

## 9. Monetization Architecture (how §32/§33 map onto the system above)

| Tier | Enforced by |
|---|---|
| Free | Default role; `ai_usage_logs` rate limit per day/month enforced at the AI-router layer (§6.1 step 1, before an LLM call is even made) |
| Premium (seeker) | `subscriptions` row with `plan=premium`; unlocks: unlimited AI usage, full roadmap generation, document analysis, resume optimization — feature flags checked per-endpoint |
| B2B (organizations) | `subscriptions` on `organizations`; unlocks: job posting quotas, applicant analytics, featured placement (`opportunities.is_featured`), lead export |
| Advertising | `advertisements` table (advertiser org, creative, targeting rules, placement, `is_sponsored=true` everywhere it's joined into a feed) — never injected into the AI recommendation input set (§6.5) |

Payment provider is abstracted behind a `payments` module interface (Razorpay for India first, Stripe as the second adapter when expanding internationally) so a country launch doesn't require a payments rewrite.

---

## 10. Security Architecture

- **PII handling:** profile, documents, and AI conversation content are the most sensitive data on the platform; encrypted at rest (DB-level + object storage server-side encryption for uploaded documents), access-logged, and documents are stored in private object storage with signed, short-lived URLs — never public buckets.
- **Document upload safety:** file-type allowlist, size caps, antivirus/malware scan before the extraction pipeline touches a file (spec §43's pipeline starts with "file validation" for exactly this reason).
- **AuthZ enforcement at the data layer**, not just route middleware — row-level checks (e.g., a query for `job_applications` always scopes by the requesting user's own `user_id` or their org's `organization_id`) to prevent IDOR-class bugs.
- **Rate limiting & abuse prevention** on auth endpoints, AI endpoints (cost-relevant), and job/opportunity posting (spam prevention for unverified orgs).
- **Secrets/config** via environment-based secret manager, never committed; LLM API keys scoped per environment.
- **Compliance posture:** design for data-subject deletion/export requests from day one (India's DPDP Act, and GDPR-readiness ahead of EU expansion) — a `user_data_export` and `user_data_deletion` job that touches every module owning user data, made possible specifically because modules don't reach into each other's tables (§4.1).

---

## 11. Scalability Strategy

- **Start:** single Postgres instance (managed, e.g. RDS/Cloud SQL) with read replica once read load (career/exam browsing, Tier 1 content) grows past write load; Redis for session/cache/rate-limiting; object storage (S3-compatible) for documents; pgvector for embeddings at MVP scale.
- **Caching:** Tier 1 content (§1.3) is aggressively cacheable (CDN + edge cache) since it's identical for every anonymous visitor by country/region — this is most of the platform's traffic and costs almost nothing to serve once cached.
- **Search:** Postgres full-text search is sufficient for MVP scale; migrate the `search` module (already isolated, §4.1) to Elasticsearch/Meilisearch/Typesense when query volume or relevance needs outgrow it — the module boundary means this is a swap, not a rewrite.
- **AI layer scaling:** separated early (§4.1) because token throughput, not request count, is the real cost/scaling driver; can move to its own worker pool/queue (job queue for document analysis and long-running roadmap generation) independent of the web app's scaling.
- **Multi-country scaling:** because country is a foreign key, not a code branch (§1.1, §3), adding a country is a data operation (new `country`, `regions`, `education_system`, populate `career_profiles`/`exams`/`business_model_templates` for that country) that doesn't require new application code paths — the biggest long-term scalability win in this architecture is organizational (content ops), not infrastructural.

---

## 12. MVP Scope & Phased Roadmap

### 12.1 Recommended stack (Next.js + Node/Postgres, as requested)

- **Frontend:** Next.js (React, App Router) — SSR/ISR for Tier 1 SEO-critical pages (career/exam detail pages need to rank in search), client-side interactivity for the assessment/chat/dashboard.
- **Backend:** Node.js (can live inside the same Next.js app as API routes/route handlers for MVP — this *is* the modular monolith from §4.1 — split out into a standalone Node service only when a module needs independent scaling, e.g. the AI worker).
- **Database:** Postgres (+ pgvector extension) as the single source of truth.
- **Cache/queue:** Redis (sessions, rate limits, job queue for document processing).
- **Object storage:** S3-compatible bucket for uploaded documents.
- **AI:** Claude via API, behind the provider-abstraction interface in §6.1 (never called directly from route handlers).
- **Auth:** NextAuth/Auth.js (email + Google provider out of the box, extensible) or a lightweight custom JWT layer if more control over the org-verification role model is needed.
- **Payments:** Razorpay (India) behind the abstraction in §9.

### 12.2 MVP (spec §46, concretely scoped against the modules above)

1. Auth (`auth` module: email + Google)
2. User profile (`users` module: personal/education/interests/goals/constraints from §5 of spec)
3. Career database (`careers` module: India-only `career_profiles` seeded for ~40–60 occupations across the categories in spec §8)
4. Career exploration (browse/search/filter, Tier 1 public pages)
5. AI career assistant (`ai` module: modes = career-explore + general-chat only at MVP; reality-check and document-analysis follow in Phase 2)
6. Personalized career recommendations (AI Career Assessment, §6.2 of spec, ranked list with explainability)
7. Career roadmaps (template-based roadmap generation + visualization, §25 of spec)
8. Government exam database (`exams` module: 15–20 major India exams — UPSC, SSC-CGL, IBPS, key state PSCs — fully structured per §3.3)
9. Basic job search (`jobs` module: manually curated/aggregated postings to start, no employer self-serve yet)
10. Resume/document upload (`documents` module: upload + storage, extraction pipeline for resumes only at MVP)
11. AI document analysis (resume → skills/experience extraction → basic job-compatibility scoring)
12. Personalized dashboard
13. Admin dashboard (content management + verification queue only — no analytics/advertising yet)

### 12.3 Phase 2

Full job marketplace with employer self-serve posting + org verification; exam study-plan generator (§11 of spec); courses/books resource layer with budget tiers; business/entrepreneurship module; resume/interview assistant expansion; premium subscription billing; notifications.

### 12.4 Phase 3

Two-sided marketplace at full scale (mentors, coaching institutes, universities as providers); B2B dashboards for recruiters/institutes; advertising system; second country launch (validates the country-scoping architecture); Hindi localization; mobile app on top of the existing REST API.

---

## 13. Open Decisions for the Team

- **Verification data sourcing for MVP:** which India exams/careers get manually curated first vs. which official-source scrapers to build first (recommend: manual curation for the 20 MVP exams — higher accuracy, lower engineering cost than scrapers at this scale).
- **LLM provider(s) and cost budget** for the freemium usage caps in §9.
- **Job data for MVP:** manually curated seed set vs. an early aggregator partnership — affects whether `job_postings.source` starts as `direct` or `aggregated`.
- **Localization order:** Hindi at MVP or Phase 2 — affects whether i18n scaffolding (content tables carrying a `locale` column) needs to be in the MVP schema from day one (recommended: yes, even if only English is populated, to avoid a migration later).
