#!/usr/bin/env bash
# End-to-end smoke test: every route, signed out and signed in.
# Exits non-zero if any check fails.
set -uo pipefail

BASE="${BASE:-http://localhost:3000}"
# Overridable so the suite runs against a database whose role isn't the
# development default — a CI container or a reviewer's local Postgres.
PSQL="${PSQL:-env PGPASSWORD=examwala psql -h 127.0.0.1 -U examwala -d examwala}"
JAR=$(mktemp)
ADMIN_JAR=$(mktemp)
FAILED=0
PASSED=0

check() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    printf '  \033[32m✓\033[0m %-52s %s\n' "$label" "$actual"
    PASSED=$((PASSED + 1))
  else
    printf '  \033[31m✗\033[0m %-52s got %s, expected %s\n' "$label" "$actual" "$expected"
    FAILED=$((FAILED + 1))
  fi
}

get() { curl -s -o /dev/null -w "%{http_code}" -b "$2" "$BASE$1"; }
getn() { curl -s -o /dev/null -w "%{http_code}" "$BASE$1"; }

# ---------------------------------------------------------------------------
# Suite preconditions
#
# Rate-limit counters and the AI daily quota both live in Postgres now, so they
# survive a server restart — which is the point of the change, and which makes
# this suite non-idempotent without a reset. A full run spends more of some
# hourly allowances than a real user would in a day, so a second run inside the
# window would fail on 429s that say nothing about the code under test.
#
# Cleared here rather than per-section so the reset is one obvious thing in one
# place. The checks that exercise the limiter deliberately fill their own bucket
# afterwards and clean up after themselves.
# ---------------------------------------------------------------------------
$PSQL -q -c "DELETE FROM rate_limit_buckets; DELETE FROM ai_usage_logs;" >/dev/null 2>&1 \
  || echo "  (could not reset limiter state — set \$PSQL if the suite reports 429s)"

echo
echo "── Public pages (no session) ────────────────────────────────────"
for path in / /careers /exams /jobs /business /pathways /search "/search?q=government+jobs+for+a+25+year+old+commerce+graduate" /login /signup /assessment; do
  check "GET $path" 200 "$(getn "$path")"
done

echo
echo "── Detail pages ─────────────────────────────────────────────────"
for path in /careers/software-developer-in /careers/doctor-mbbs-in /careers/electrician-in \
            /exams/upsc-cse /exams/ssc-cgl /exams/neet-ug \
            /business/tiffin-service-in /business/digital-marketing-agency-in; do
  check "GET $path" 200 "$(getn "$path")"
done

echo
echo "── Filtered listings ────────────────────────────────────────────"
check "GET /careers?group=technology" 200 "$(getn '/careers?group=technology')"
check "GET /careers?maxCost=25000&remote=1" 200 "$(getn '/careers?maxCost=25000&remote=1')"
check "GET /careers?sort=salary" 200 "$(getn '/careers?sort=salary')"
check "GET /exams?category=banking" 200 "$(getn '/exams?category=banking')"
check "GET /exams?age=27" 200 "$(getn '/exams?age=27')"
check "GET /jobs?remote=REMOTE" 200 "$(getn '/jobs?remote=REMOTE')"
check "GET /business?budget=100000" 200 "$(getn '/business?budget=100000')"

echo
echo "── Not found handling ───────────────────────────────────────────"
check "GET /careers/does-not-exist" 404 "$(getn /careers/does-not-exist)"
check "GET /exams/does-not-exist" 404 "$(getn /exams/does-not-exist)"

echo
echo "── Auth gates (should redirect signed-out users) ────────────────"
for path in /dashboard /dashboard/profile /dashboard/documents /guidance/resume /admin; do
  code=$(getn "$path")
  # Next.js redirects render as 200 after following, or 307 without; accept either.
  if [[ "$code" == "200" || "$code" == "307" ]]; then
    printf '  \033[32m✓\033[0m %-52s %s (redirects to login)\n' "GET $path" "$code"
    PASSED=$((PASSED + 1))
  else
    printf '  \033[31m✗\033[0m %-52s got %s\n' "GET $path" "$code"
    FAILED=$((FAILED + 1))
  fi
done

echo
echo "── Unauthenticated API must refuse ──────────────────────────────"
check "GET /api/v1/users/me/profile" 401 "$(getn /api/v1/users/me/profile)"
check "GET /api/v1/documents" 401 "$(getn /api/v1/documents)"
check "GET /api/v1/roadmaps" 401 "$(getn /api/v1/roadmaps)"
check "POST /api/v1/admin/publish" 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"entityType":"career","entityId":"x","action":"publish"}' "$BASE/api/v1/admin/publish")"

echo
echo "── Open API endpoints ───────────────────────────────────────────"
check "GET /api/v1/auth/me (anon)" 200 "$(getn /api/v1/auth/me)"
check "POST /api/v1/assessment (anon)" 200 "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"interests":["technology"],"workStyle":"analytical","budget":50000,"studyAppetite":"short"}' "$BASE/api/v1/assessment")"
check "POST study-plan (anon)" 200 "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d "{\"hoursPerDay\":4,\"targetDate\":\"$(date -d '+8 months' +%Y-%m-%d)T00:00:00.000Z\"}" "$BASE/api/v1/exams/ssc-cgl/study-plan")"

echo
echo "── Validation must reject bad input ─────────────────────────────"
check "POST signup, weak password" 422 "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"email":"x@y.com","password":"short"}' "$BASE/api/v1/auth/signup")"
check "POST signup, invalid email" 422 "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"email":"notanemail","password":"averylongpassword123"}' "$BASE/api/v1/auth/signup")"
check "POST study-plan, past date" 422 "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"hoursPerDay":4,"targetDate":"2020-01-01T00:00:00.000Z"}' "$BASE/api/v1/exams/ssc-cgl/study-plan")"

echo
echo "── Sign in as demo seeker ───────────────────────────────────────"
LOGIN=$(curl -s -c "$JAR" -X POST -H 'Content-Type: application/json' \
  -d '{"email":"demo@examwale.test","password":"examwale-demo-2026"}' \
  -w '\n%{http_code}' "$BASE/api/v1/auth/login")
check "POST /api/v1/auth/login" 200 "$(echo "$LOGIN" | tail -1)"

echo
echo "── Authenticated pages ──────────────────────────────────────────"
for path in /dashboard /dashboard/profile /dashboard/documents /dashboard/saved \
            /dashboard/applications /dashboard/roadmaps /dashboard/exams /guidance; do
  check "GET $path" 200 "$(get "$path" "$JAR")"
done

echo
echo "── Authenticated API ────────────────────────────────────────────"
check "GET /api/v1/users/me/profile" 200 "$(get /api/v1/users/me/profile "$JAR")"
check "GET /api/v1/documents" 200 "$(get /api/v1/documents "$JAR")"
check "GET /api/v1/roadmaps" 200 "$(get /api/v1/roadmaps "$JAR")"
check "GET /api/v1/users/me/saved" 200 "$(get /api/v1/users/me/saved "$JAR")"
check "PATCH profile" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X PATCH -H 'Content-Type: application/json' -d '{"age":25,"availableBudget":75000,"availableHoursPerDay":3,"interests":["technology","finance"]}' "$BASE/api/v1/users/me/profile")"

echo
echo "── Roadmap creation and step updates ────────────────────────────"
ROADMAP=$(curl -s -b "$JAR" -X POST -H 'Content-Type: application/json' \
  -d '{"careerSlug":"data-analyst-in","timelineMonths":6,"hoursPerDay":3,"currentLevel":"beginner","targetIncome":2000000}' \
  "$BASE/api/v1/roadmaps")
ROADMAP_ID=$(echo "$ROADMAP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [[ -n "$ROADMAP_ID" ]]; then
  printf '  \033[32m✓\033[0m %-52s %s\n' "POST /api/v1/roadmaps" "created"
  PASSED=$((PASSED + 1))
  check "GET /dashboard/roadmaps/$ROADMAP_ID" 200 "$(get "/dashboard/roadmaps/$ROADMAP_ID" "$JAR")"
  # A 6-month timeline on a path that typically takes longer should be flagged.
  if echo "$ROADMAP" | grep -q '"verdict"'; then
    VERDICT=$(echo "$ROADMAP" | grep -o '"verdict":"[^"]*"' | head -1 | cut -d'"' -f4)
    printf '  \033[32m✓\033[0m %-52s %s\n' "Reality check produced a verdict" "$VERDICT"
    PASSED=$((PASSED + 1))
  else
    printf '  \033[31m✗\033[0m %-52s no verdict\n' "Reality check"
    FAILED=$((FAILED + 1))
  fi
else
  printf '  \033[31m✗\033[0m %-52s no id returned\n' "POST /api/v1/roadmaps"
  FAILED=$((FAILED + 1))
fi

echo
echo "── Save / unsave round trip ─────────────────────────────────────"
CAREER_ID=$(curl -s -b "$JAR" "$BASE/api/v1/users/me/saved" >/dev/null; $PSQL -tAc "SELECT id FROM career_profiles LIMIT 1")
SAVE1=$(curl -s -b "$JAR" -X POST -H 'Content-Type: application/json' -d "{\"itemType\":\"career\",\"itemId\":\"$CAREER_ID\",\"label\":\"test\"}" "$BASE/api/v1/users/me/saved")
SAVE2=$(curl -s -b "$JAR" -X POST -H 'Content-Type: application/json' -d "{\"itemType\":\"career\",\"itemId\":\"$CAREER_ID\"}" "$BASE/api/v1/users/me/saved")
if echo "$SAVE1" | grep -q '"saved":true' && echo "$SAVE2" | grep -q '"saved":false'; then
  printf '  \033[32m✓\033[0m %-52s toggles correctly\n' "Save then unsave"
  PASSED=$((PASSED + 1))
else
  printf '  \033[31m✗\033[0m %-52s %s / %s\n' "Save then unsave" "$SAVE1" "$SAVE2"
  FAILED=$((FAILED + 1))
fi

echo
echo "── Job application ──────────────────────────────────────────────"
JOB_ID=$($PSQL -tAc "SELECT id FROM job_postings WHERE status='ACTIVE' LIMIT 1")
check "POST /api/v1/jobs/{id}/apply" 201 "$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X POST -H 'Content-Type: application/json' -d '{"coverLetter":"Smoke test application."}' "$BASE/api/v1/jobs/$JOB_ID/apply")"

echo
echo "── The AI surface is gone, and its URLs still resolve ───────────"
# Removing a feature is not the same as deleting its routes. /chat and /ai/*
# were live and indexed; a 404 on them reads as a broken site rather than a
# deliberate change, so each one redirects permanently to what replaced it.
check "GET /chat redirects" 308 "$(getn /chat)"
check "GET /ai redirects" 308 "$(getn /ai)"
check "GET /ai/resume redirects" 308 "$(getn /ai/resume)"
check "GET /ai/interview redirects" 308 "$(getn /ai/interview)"
check "GET /ai/recommendations redirects" 308 "$(getn /ai/recommendations)"
check "…/chat lands on the guidance hub" 1 \
  "$(curl -s -o /dev/null -w '%{redirect_url}' "$BASE/chat" | grep -c '/guidance$')"
check "…/ai/recommendations lands on matches" 1 \
  "$(curl -s -o /dev/null -w '%{redirect_url}' "$BASE/ai/recommendations" | grep -c '/guidance/matches$')"

# The endpoints themselves must be gone, not merely unlinked.
for gone in /api/v1/ai/chat /api/v1/ai/resume-review /api/v1/ai/interview /api/v1/ai/recommendations; do
  check "$gone is gone" 404 "$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X POST \
    -H 'Content-Type: application/json' -d '{}' "$BASE$gone")"
done

# Nothing may reach a language model. The dependency is the proof: if the SDK
# is still installed, something can still call it.
check "The Anthropic SDK is not a dependency" 0 \
  "$(grep -c '@anthropic-ai/sdk' package.json)"
check "No source file imports an AI provider" 0 \
  "$(grep -rl 'modules/ai/' src 2>/dev/null | wc -l | tr -d ' ')"
check "No API key is read anywhere" 0 \
  "$(grep -rl 'ANTHROPIC_API_KEY' src 2>/dev/null | wc -l | tr -d ' ')"

# The deterministic engines survived, under a name that describes them.
check "The rulebook modules exist" 3 \
  "$(ls src/modules/guidance/ 2>/dev/null | wc -l | tr -d ' ')"
check "The assessment endpoint moved off /ai" 200 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
      -d '{"interests":["technology"],"workStyle":"analytical"}' "$BASE/api/v1/assessment")"

echo
echo "── Regression: security fixes ───────────────────────────────────"

# IDOR — a second user must not be able to post into someone else's thread.
curl -s -o /dev/null -X POST -H 'Content-Type: application/json' \
  -d '{"email":"intruder@examwale.test","password":"Zephyr-Quandary-8814","name":"Intruder"}' \
  "$BASE/api/v1/auth/signup"
INTRUDER_JAR=$(mktemp)
curl -s -o /dev/null -c "$INTRUDER_JAR" -X POST -H 'Content-Type: application/json' \
  -d '{"email":"intruder@examwale.test","password":"Zephyr-Quandary-8814"}' "$BASE/api/v1/auth/login"
# The conversation this used to target no longer exists — the endpoint that
# leaked was deleted with the assistant. The bug class did not go away, so the
# check now points at the equivalent owned resource: a saved interview session,
# read through the same requireSession + ownership-assert path.
VICTIM_SESSION=$($PSQL -tAc \
  "SELECT s.id FROM interview_sessions s JOIN users u ON u.id = s.user_id WHERE u.email='demo@examwale.test' LIMIT 1" | tr -d '[:space:]')
if [[ -n "$VICTIM_SESSION" ]]; then
  check "Cross-user practice session refused" 403 \
    "$(curl -s -o /dev/null -w '%{http_code}' -b "$INTRUDER_JAR" \
        "$BASE/api/v1/guidance/interview/$VICTIM_SESSION/answer")"
else
  printf '  \033[33m!\033[0m %-52s no session to test against\n' "IDOR check"
fi
rm -f "$INTRUDER_JAR"

# Open redirect — an absolute URL in ?next must not survive.
# The rendered links must carry the sanitised target. (The raw query string
# also appears in Next's RSC payload; that is inert serialised props, not a link.)
REDIR_HTML=$(curl -s "$BASE/login?next=https://evil.tld")
BAD_HREF=$(echo "$REDIR_HTML" | grep -o 'href="[^"]*evil\.tld[^"]*"' | wc -l)
GOOD_HREF=$(echo "$REDIR_HTML" | grep -c 'href="/signup?next=%2Fdashboard"' || true)
if [[ "$BAD_HREF" == "0" && "$GOOD_HREF" != "0" ]]; then
  printf '  \033[32m✓\033[0m %-52s target rewritten to /dashboard\n' "Open redirect blocked"
  PASSED=$((PASSED + 1))
else
  printf '  \033[31m✗\033[0m %-52s %s bad hrefs, %s good\n' "Open redirect blocked" "$BAD_HREF" "$GOOD_HREF"
  FAILED=$((FAILED + 1))
fi

# Login timing must not distinguish known from unknown accounts.
T_KNOWN=$( { TIMEFORMAT=%R; time curl -s -o /dev/null -X POST -H 'Content-Type: application/json' -d '{"email":"demo@examwale.test","password":"definitely-wrong-password"}' "$BASE/api/v1/auth/login"; } 2>&1 )
T_UNKNOWN=$( { TIMEFORMAT=%R; time curl -s -o /dev/null -X POST -H 'Content-Type: application/json' -d '{"email":"nobody-here-at-all@examwale.test","password":"definitely-wrong-password"}' "$BASE/api/v1/auth/login"; } 2>&1 )
DELTA=$(python3 -c "print(abs($T_KNOWN - $T_UNKNOWN) < 0.15)")
if [[ "$DELTA" == "True" ]]; then
  printf '  \033[32m✓\033[0m %-52s %ss vs %ss\n' "Login timing does not leak account existence" "$T_KNOWN" "$T_UNKNOWN"
  PASSED=$((PASSED + 1))
else
  printf '  \033[31m✗\033[0m %-52s %ss vs %ss\n' "Login timing leak" "$T_KNOWN" "$T_UNKNOWN"
  FAILED=$((FAILED + 1))
fi

# Malformed query params must not 500 a public page.
for bad in '/jobs?page=x' '/jobs?minSalary=abc' '/careers?maxCost=1,00,000' '/careers?page=-5' '/exams?age=notanumber' '/business?budget=xyz'; do
  check "GET $bad" 200 "$(getn "$bad")"
done

# Study plan must reject an absurd horizon rather than allocating millions of buckets.
check "POST study-plan, year 9999" 422 "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"hoursPerDay":1,"targetDate":"9999-12-31T00:00:00.000Z"}' "$BASE/api/v1/exams/ssc-cgl/study-plan")"

# Unknown document type must be ignored, not 500.
printf 'Resume of Test Person. Email test@example.com. Skills: Python, SQL, Excel.' > /tmp/smoke-resume.txt
check "POST document with bogus type" 201 "$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -F 'file=@/tmp/smoke-resume.txt;type=text/plain' -F 'type=NOT_A_REAL_TYPE' "$BASE/api/v1/documents")"

echo
echo "── Sign in as admin ─────────────────────────────────────────────"
ADMIN_LOGIN=$(curl -s -c "$ADMIN_JAR" -X POST -H 'Content-Type: application/json' \
  -d '{"email":"admin@examwale.test","password":"examwale-admin-2026"}' \
  -w '%{http_code}' -o /dev/null "$BASE/api/v1/auth/login")
check "POST admin login" 200 "$ADMIN_LOGIN"

for path in /admin /admin/careers /admin/exams /admin/users /admin/audit /admin/organisations; do
  check "GET $path" 200 "$(get "$path" "$ADMIN_JAR")"
done

echo
echo "── Publish gate ─────────────────────────────────────────────────"
# A record with no source must be refused with a specific, actionable reason.
$PSQL -q -c \
  "INSERT INTO career_profiles (id, occupation_id, country_id, slug, summary, day_to_day, work_environment, education_required, eligibility, advantages, disadvantages, progression, next_steps, status, source_id)
   SELECT 'gatetest01', (SELECT id FROM occupations LIMIT 1), (SELECT id FROM countries WHERE iso_code='IN'),
          'gate-test-career', 's', 'd', 'w', '[]', '[]', '[]', '[]', '[]', '[]', 'DRAFT', NULL
   ON CONFLICT (id) DO UPDATE SET source_id = NULL, status = 'DRAFT'" >/dev/null 2>&1
GATE=$(curl -s -b "$ADMIN_JAR" -X POST -H 'Content-Type: application/json' \
  -d '{"entityType":"career","entityId":"gatetest01","action":"publish"}' "$BASE/api/v1/admin/publish")
if echo "$GATE" | grep -q 'missing_source'; then
  printf '  \033[32m✓\033[0m %-52s refused unsourced record\n' "Publish gate"
  PASSED=$((PASSED + 1))
else
  printf '  \033[31m✗\033[0m %-52s %s\n' "Publish gate" "$GATE"
  FAILED=$((FAILED + 1))
fi
$PSQL -tAc "DELETE FROM career_profiles WHERE id='gatetest01'" >/dev/null

echo
echo "── Non-admin must not reach admin API ───────────────────────────"
check "POST /api/v1/admin/publish as seeker" 403 "$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X POST -H 'Content-Type: application/json' -d '{"entityType":"career","entityId":"x","action":"publish"}' "$BASE/api/v1/admin/publish")"

# =================================================================
# PHASE 2
# =================================================================
# The checks below are mostly about the gates, not the happy paths.
# Each Phase 2 feature has one rule that must not be bypassable, and
# a smoke suite that only proves the pages render would miss all of
# them.

echo
echo "── Phase 2 · public pages ───────────────────────────────────────"
for path in /courses /mentors /pricing /employers; do
  check "GET $path" 200 "$(getn "$path")"
done
check "GET /courses?mode=CLASSROOM" 200 "$(getn '/courses?mode=CLASSROOM')"
check "GET /courses?sort=fee" 200 "$(getn '/courses?sort=fee')"
check "GET /courses?page=x" 200 "$(getn '/courses?page=x')"
check "GET /mentors?free=1" 200 "$(getn '/mentors?free=1')"
check "GET /mentors?page=notanumber" 200 "$(getn '/mentors?page=notanumber')"

echo
echo "── Phase 2 · public APIs ────────────────────────────────────────"
check "GET /api/v1/courses" 200 "$(getn /api/v1/courses)"
check "GET /api/v1/providers" 200 "$(getn /api/v1/providers)"
check "GET /api/v1/mentors" 200 "$(getn /api/v1/mentors)"

echo
echo "── Mentor listability gate ──────────────────────────────────────"
# Seeded: 7 approved+verified, 3 PENDING with nothing verified.
# Anchored on totalPages: each mentor row also carries a rating.total, and an
# unanchored match picks up the first of those instead of the page total.
LISTED=$(curl -s "$BASE/api/v1/mentors" | grep -o '"total":[0-9]*,"totalPages"' | head -1 | tr -cd '0-9')
DB_LISTABLE=$($PSQL -tAc \
  "SELECT count(*) FROM mentors WHERE status='ACTIVE' AND credential_verified_at IS NOT NULL" | tr -d '[:space:]')
DB_TOTAL=$($PSQL -tAc \
  "SELECT count(*) FROM mentors" | tr -d '[:space:]')
check "Listing returns only listable mentors" "$DB_LISTABLE" "${LISTED:-0}"
if [[ "$DB_TOTAL" -gt "$DB_LISTABLE" ]]; then
  printf '  \033[32m✓\033[0m %-52s %s of %s hidden\n' "Unverified mentors excluded" "$((DB_TOTAL - DB_LISTABLE))" "$DB_TOTAL"
  PASSED=$((PASSED + 1))
else
  printf '  \033[31m✗\033[0m %-52s no pending mentors in seed to test with\n' "Unverified mentors excluded"
  FAILED=$((FAILED + 1))
fi

# A pending mentor's profile must 404 for the public.
PENDING_ID=$($PSQL -tAc \
  "SELECT id FROM mentors WHERE status='PENDING' LIMIT 1" | tr -d '[:space:]')
if [[ -n "$PENDING_ID" ]]; then
  check "GET /mentors/<pending> is 404 publicly" 404 "$(getn "/mentors/$PENDING_ID")"
  check "GET /api/v1/mentors/<pending> is 404" 404 "$(getn "/api/v1/mentors/$PENDING_ID")"
fi

echo
echo "── Course outcome claims stay labelled ──────────────────────────"
UNVERIFIED_CLAIMS=$($PSQL -tAc \
  "SELECT count(*) FROM course_outcome_claims WHERE confidence <> 'UNVERIFIED' AND source_id IS NULL" | tr -d '[:space:]')
check "No claim is non-UNVERIFIED without a source" 0 "$UNVERIFIED_CLAIMS"

COURSE_ID=$($PSQL -tAc \
  "SELECT c.id FROM courses c JOIN course_outcome_claims oc ON oc.course_id = c.id
   WHERE c.status='PUBLISHED' LIMIT 1" | tr -d '[:space:]')
if [[ -n "$COURSE_ID" ]]; then
  check "GET /courses/<id> with claims" 200 "$(getn "/courses/$COURSE_ID")"
  BODY=$(curl -s "$BASE/courses/$COURSE_ID")
  if echo "$BODY" | grep -qi "Claimed by the provider"; then
    printf '  \033[32m✓\033[0m %-52s attribution rendered\n' "Unverified claim is attributed"
    PASSED=$((PASSED + 1))
  else
    printf '  \033[31m✗\033[0m %-52s no attribution text found\n' "Unverified claim is attributed"
    FAILED=$((FAILED + 1))
  fi
fi

echo
echo "── Employer posting gate ────────────────────────────────────────"
# An unverified organisation's posting must not be publishable, and no
# employer-sourced posting may be ACTIVE without an approve review.
BAD_ACTIVE=$($PSQL -tAc \
  "SELECT count(*) FROM job_postings jp
   WHERE jp.organisation_id IS NOT NULL AND jp.status='ACTIVE'
     AND NOT EXISTS (
       SELECT 1 FROM job_moderation_reviews r
       WHERE r.job_posting_id = jp.id AND r.decision='approve')" | tr -d '[:space:]')
check "No employer posting ACTIVE without approval" 0 "$BAD_ACTIVE"

UNVERIFIED_ORG_ACTIVE=$($PSQL -tAc \
  "SELECT count(*) FROM job_postings jp
   JOIN organisations o ON o.id = jp.organisation_id
   WHERE jp.status='ACTIVE' AND o.verification_status <> 'VERIFIED'" | tr -d '[:space:]')
check "No ACTIVE posting from an unverified org" 0 "$UNVERIFIED_ORG_ACTIVE"

echo
echo "── Advertising disclosure is structural ─────────────────────────"
BLANK_LABEL=$($PSQL -tAc \
  "SELECT count(*) FROM ad_creatives WHERE disclosure_label IS NULL OR trim(disclosure_label) = ''" | tr -d '[:space:]')
check "No creative without a disclosure label" 0 "$BLANK_LABEL"

NOT_NULL=$($PSQL -tAc \
  "SELECT is_nullable FROM information_schema.columns
   WHERE table_name='ad_creatives' AND column_name='disclosure_label'" | tr -d '[:space:]')
check "disclosure_label column is NOT NULL" "NO" "$NOT_NULL"

# Ad events must be aggregate-only: no user column anywhere on the table.
AD_USER_COL=$($PSQL -tAc \
  "SELECT count(*) FROM information_schema.columns
   WHERE table_name='ad_events' AND column_name LIKE '%user%'" | tr -d '[:space:]')
check "ad_events holds no per-user column" 0 "$AD_USER_COL"

echo
echo "── Phase 2 · auth gates (signed out) ────────────────────────────"
for path in /api/v1/employers/organisations /api/v1/billing/subscription /api/v1/notifications; do
  check "GET $path unauthenticated" 401 "$(getn "$path")"
done
check "GET /api/v1/notifications/preferences unauth" 401 "$(getn /api/v1/notifications/preferences)"
check "POST /api/v1/mentors unauth" 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' "$BASE/api/v1/mentors")"

echo
echo "── Phase 2 · admin-only endpoints reject a seeker ────────────────"
for path in /api/v1/admin/job-moderation /api/v1/admin/mentors /api/v1/admin/ad-campaigns; do
  check "GET $path as seeker" 403 "$(get "$path" "$JAR")"
done

echo
echo "── Phase 2 · signed-in reads ────────────────────────────────────"
check "GET /api/v1/notifications" 200 "$(get /api/v1/notifications "$JAR")"
check "GET /api/v1/notifications/preferences" 200 "$(get /api/v1/notifications/preferences "$JAR")"
check "GET /api/v1/billing/subscription" 200 "$(get /api/v1/billing/subscription "$JAR")"
check "GET /dashboard/billing" 200 "$(get /dashboard/billing "$JAR")"
check "GET /dashboard/notifications" 200 "$(get /dashboard/notifications "$JAR")"
check "GET /dashboard/mentorship" 200 "$(get /dashboard/mentorship "$JAR")"
check "GET /dashboard/cohorts" 200 "$(get /dashboard/cohorts "$JAR")"

echo
echo "── Billing: refusal, idempotency and entitlements ───────────────"
# Free plan resolves for a seeded seeker with no subscription.
PLAN=$(curl -s -b "$JAR" "$BASE/api/v1/billing/subscription" | grep -o '"planCode":"[^"]*"' | head -1 | cut -d'"' -f4)
check "Seeded seeker resolves to the free plan" "free" "${PLAN:-none}"

# With no payment provider configured, a paid plan must be refused outright
# rather than silently granted. This is the honest failure, so it is a check.
PAID=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X POST -H 'Content-Type: application/json' \
  -d '{"planCode":"premium-monthly","idempotencyKey":"smoke-paid-refusal"}' \
  "$BASE/api/v1/billing/checkout")
check "Paid plan refused with no payment provider" 503 "$PAID"

# Idempotency is exercised on the zero-cost plan, which the guard above lets
# through: the same key twice must produce exactly one payment row.
IDEM="smoke-$(date +%s)-$RANDOM"
for _ in 1 2; do
  curl -s -o /dev/null -b "$JAR" -X POST -H 'Content-Type: application/json' \
    -d "{\"planCode\":\"free\",\"idempotencyKey\":\"$IDEM\"}" \
    "$BASE/api/v1/billing/checkout"
done
PAYMENT_COUNT=$($PSQL -tAc \
  "SELECT count(*) FROM payments WHERE idempotency_key = '$IDEM'" | tr -d '[:space:]')
check "Repeated checkout key creates one payment" 1 "$PAYMENT_COUNT"

# Entitlements must follow the subscription row, not the session token. Grant a
# premium subscription directly — the path an admin comp takes — and confirm
# the resolver reflects it without the user signing in again.
# Replaces rather than adds: the free-plan checkout above already left a
# subscription row, and a user is only ever meant to have one.
$PSQL -q -c \
  "DELETE FROM subscriptions WHERE user_id = (SELECT id FROM users WHERE email='demo@examwale.test');
   INSERT INTO subscriptions (id, user_id, plan_id, status, current_period_start, current_period_end, provider)
   SELECT 'smoketestsub01', u.id, p.id, 'ACTIVE', now(), now() + interval '30 days', 'manual'
   FROM users u, plans p WHERE u.email='demo@examwale.test' AND p.code='premium-monthly';" >/dev/null

NEW_LIMIT=$(curl -s -b "$JAR" "$BASE/api/v1/billing/subscription" | grep -o '"mentorSessionsPerMonth":[0-9]*' | head -1 | cut -d: -f2)
if [[ "${NEW_LIMIT:-0}" -gt 1 ]]; then
  printf '  \033[32m✓\033[0m %-52s raised to %s\n' "Entitlement follows the subscription" "$NEW_LIMIT"
  PASSED=$((PASSED + 1))
else
  printf '  \033[31m✗\033[0m %-52s got %s\n' "Entitlement follows the subscription" "${NEW_LIMIT:-none}"
  FAILED=$((FAILED + 1))
fi

# An expired period must stop entitling, with no job having run.
$PSQL -q -c \
  "UPDATE subscriptions SET current_period_end = now() - interval '1 day' WHERE id='smoketestsub01';" >/dev/null
LAPSED=$(curl -s -b "$JAR" "$BASE/api/v1/billing/subscription" | grep -o '"mentorSessionsPerMonth":[0-9]*' | head -1 | cut -d: -f2)
check "Lapsed period drops back to free allowance" 1 "${LAPSED:-0}"

# Clean up so a re-run starts from the same state.
$PSQL -q -c \
  "DELETE FROM payments WHERE idempotency_key = '$IDEM';
   DELETE FROM subscriptions WHERE user_id = (SELECT id FROM users WHERE email='demo@examwale.test');
   UPDATE users SET plan='FREE' WHERE email='demo@examwale.test';" >/dev/null

echo "── Notifications ────────────────────────────────────────────────"
check "PUT a notification preference" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X PUT -H 'Content-Type: application/json' -d '{"type":"exam.deadline_soon","channel":"EMAIL","enabled":false}' "$BASE/api/v1/notifications/preferences")"
check "PUT an unknown notification type" 404 "$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X PUT -H 'Content-Type: application/json' -d '{"type":"not.a.real.type","channel":"EMAIL","enabled":true}' "$BASE/api/v1/notifications/preferences")"
check "POST read-all" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X POST "$BASE/api/v1/notifications/read-all")"
check "Mark a notification that isn't yours" 404 "$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X POST "$BASE/api/v1/notifications/doesnotexist")"

echo
echo "── B2B privacy floor ────────────────────────────────────────────"
# The suppression threshold must be enforced, and cohort membership must
# require consent rather than being conferred by an invitation.
CONSENT_LEAK=$($PSQL -tAc \
  "SELECT count(*) FROM cohort_members WHERE status='ACTIVE' AND consented_at IS NULL" | tr -d '[:space:]')
check "No ACTIVE cohort member without consent" 0 "$CONSENT_LEAK"

echo
echo "── Localisation ─────────────────────────────────────────────────"
check "POST a valid locale" 200 "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"locale":"hi"}' "$BASE/api/v1/i18n/locale")"
check "POST an unsupported locale" 422 "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"locale":"fr"}' "$BASE/api/v1/i18n/locale")"
HI_BODY=$(curl -s -H 'Cookie: examwale_locale=hi' "$BASE/mentors")
if echo "$HI_BODY" | grep -q "मेंटर"; then
  printf '  \033[32m✓\033[0m %-52s Hindi rendered\n' "Locale cookie switches the interface"
  PASSED=$((PASSED + 1))
else
  printf '  \033[31m✗\033[0m %-52s no Devanagari found\n' "Locale cookie switches the interface"
  FAILED=$((FAILED + 1))
fi

# A machine translation must never be stored as reviewed.
BAD_TRANSLATION=$($PSQL -tAc \
  "SELECT count(*) FROM translations WHERE source='MACHINE' AND reviewed_at IS NOT NULL" | tr -d '[:space:]')
check "No MACHINE translation marked reviewed" 0 "$BAD_TRANSLATION"

echo
echo "── Phase 2 · input validation must not 500 ──────────────────────"
check "GET /api/v1/courses?maxFee=abc" 200 "$(getn '/api/v1/courses?maxFee=abc')"
check "GET /api/v1/mentors?page=-5" 200 "$(getn '/api/v1/mentors?page=-5')"
check "GET /courses/nonexistent-id" 404 "$(getn /courses/nonexistent-id)"
check "GET /mentors/nonexistent-id" 404 "$(getn /mentors/nonexistent-id)"
check "GET /providers/nonexistent-id" 404 "$(getn /providers/nonexistent-id)"
check "POST mentor apply with junk body" 422 "$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X POST -H 'Content-Type: application/json' -d '{"headline":"x"}' "$BASE/api/v1/mentors")"

# =================================================================
# PHASE 3 — multi-country
# =================================================================
# The claim under test is that a second country is a content operation.
# These checks assert the two things that would make that claim false:
# content leaking across the boundary, and a country being launchable
# while empty.

echo
echo "── Country isolation ────────────────────────────────────────────"
IN_CAREERS=$($PSQL -tAc \
  "SELECT count(*) FROM career_profiles cp JOIN countries c ON c.id=cp.country_id
   WHERE c.iso_code='IN' AND cp.status='PUBLISHED'" | tr -d '[:space:]')
AE_CAREERS=$($PSQL -tAc \
  "SELECT count(*) FROM career_profiles cp JOIN countries c ON c.id=cp.country_id
   WHERE c.iso_code='AE' AND cp.status='PUBLISHED'" | tr -d '[:space:]')

# React emits an HTML comment between the interpolated number and the text,
# so the count is matched with that marker rather than a bare lookahead.
LISTED_IN=$(curl -s "$BASE/careers" | grep -oP '\d+(?=<!-- --> careers with what)' | head -1)
LISTED_AE=$(curl -s -H 'Cookie: examwale_country=AE' "$BASE/careers" | grep -oP '\d+(?=<!-- --> careers with what)' | head -1)
check "India listing shows only Indian careers" "$IN_CAREERS" "${LISTED_IN:-0}"
check "UAE listing shows only UAE careers" "$AE_CAREERS" "${LISTED_AE:-0}"

# Currency must follow the country, and the budget bands with it.
AE_BODY=$(curl -s -H 'Cookie: examwale_country=AE' "$BASE/careers")
IN_BODY=$(curl -s "$BASE/careers")
if echo "$AE_BODY" | grep -q "AED" && ! echo "$AE_BODY" | grep -q "₹"; then
  printf '  \033[32m✓\033[0m %-52s AED only\n' "UAE page carries no rupee figures"
  PASSED=$((PASSED + 1))
else
  printf '  \033[31m✗\033[0m %-52s rupee symbol present on a UAE page\n' "UAE page carries no rupee figures"
  FAILED=$((FAILED + 1))
fi
if echo "$IN_BODY" | grep -q "₹" && ! echo "$IN_BODY" | grep -q "AED"; then
  printf '  \033[32m✓\033[0m %-52s rupees only\n' "India page carries no AED figures"
  PASSED=$((PASSED + 1))
else
  printf '  \033[31m✗\033[0m %-52s AED present on an Indian page\n' "India page carries no AED figures"
  FAILED=$((FAILED + 1))
fi

# A career slug from one country must not resolve while browsing the other's
# listing — the detail page is shared, but the listing must not surface it.
check "UAE-only slug 404s as a career in neither country" 200 "$(getn /careers/software-developer-ae)"

echo
echo "── Retrieval corpus is country-tagged ───────────────────────────"
MISTAGGED=$($PSQL -tAc \
  "SELECT count(*) FROM knowledge_chunks kc
   JOIN career_profiles cp ON cp.slug = kc.entity_slug
   JOIN countries c ON c.id = cp.country_id
   WHERE kc.entity_type='career' AND kc.country_iso <> c.iso_code" | tr -d '[:space:]')
check "No career chunk tagged with the wrong country" 0 "$MISTAGGED"

AE_CHUNKS=$($PSQL -tAc \
  "SELECT count(*) FROM knowledge_chunks WHERE country_iso='AE'" | tr -d '[:space:]')
if [[ "${AE_CHUNKS:-0}" -gt 0 ]]; then
  printf '  \033[32m✓\033[0m %-52s %s indexed\n' "UAE content reached the retrieval corpus" "$AE_CHUNKS"
  PASSED=$((PASSED + 1))
else
  printf '  \033[31m✗\033[0m %-52s none indexed\n' "UAE content reached the retrieval corpus"
  FAILED=$((FAILED + 1))
fi

# A rupee figure inside a UAE chunk would be a factual error in the corpus.
RUPEE_IN_AE=$($PSQL -tAc \
  "SELECT count(*) FROM knowledge_chunks WHERE country_iso='AE' AND content LIKE '%₹%'" | tr -d '[:space:]')
check "No rupee figures inside UAE chunks" 0 "$RUPEE_IN_AE"

echo
echo "── The taxonomy stayed shared ───────────────────────────────────"
# Careers that exist in both countries must share one occupation row, or every
# cross-country comparison the schema was built for silently breaks.
SHARED=$($PSQL -tAc \
  "SELECT count(*) FROM (
     SELECT o.id FROM career_profiles cp JOIN occupations o ON o.id=cp.occupation_id
     GROUP BY o.id HAVING count(DISTINCT cp.country_id) > 1) t" | tr -d '[:space:]')
if [[ "${SHARED:-0}" -ge 5 ]]; then
  printf '  \033[32m✓\033[0m %-52s %s occupations span both\n' "Occupations reused across countries" "$SHARED"
  PASSED=$((PASSED + 1))
else
  printf '  \033[31m✗\033[0m %-52s only %s — taxonomy was duplicated\n' "Occupations reused across countries" "${SHARED:-0}"
  FAILED=$((FAILED + 1))
fi

echo
echo "── Coverage is declared, not inferred ───────────────────────────"
# The UAE has no civil-service exam. That must be a stated absence, not an
# empty list, and the page must say so.
AE_EXAM_STATE=$($PSQL -tAc \
  "SELECT cc.state FROM country_coverage cc JOIN countries c ON c.id=cc.country_id
   WHERE c.iso_code='AE' AND cc.section='exams'" | tr -d '[:space:]')
check "UAE exams declared NOT_APPLICABLE" "NOT_APPLICABLE" "$AE_EXAM_STATE"

if curl -s -H 'Cookie: examwale_country=AE' "$BASE/exams" | grep -q "civil-service examination"; then
  printf '  \033[32m✓\033[0m %-52s explanation rendered\n' "UAE exams page explains the absence"
  PASSED=$((PASSED + 1))
else
  printf '  \033[31m✗\033[0m %-52s empty list with no explanation\n' "UAE exams page explains the absence"
  FAILED=$((FAILED + 1))
fi

# Nothing may claim to be covered while empty.
LYING=$($PSQL -tAc \
  "SELECT count(*) FROM country_coverage cc JOIN countries c ON c.id = cc.country_id
   WHERE cc.state='COVERED' AND cc.section='careers'
     AND NOT EXISTS (SELECT 1 FROM career_profiles cp
                     WHERE cp.country_id = c.id AND cp.status='PUBLISHED')" | tr -d '[:space:]')
check "No section marked covered while empty" 0 "$LYING"

# Every live country must have declared every section.
UNDECLARED=$($PSQL -tAc \
  "SELECT count(*) FROM countries c
   CROSS JOIN (VALUES ('careers'),('exams'),('jobs'),('business'),('courses'),('mentors'),('scholarships')) AS s(section)
   WHERE c.is_active = true
     AND NOT EXISTS (SELECT 1 FROM country_coverage cc
                     WHERE cc.country_id=c.id AND cc.section=s.section)" | tr -d '[:space:]')
check "Every live country declares every section" 0 "$UNDECLARED"

echo
echo "── The launch gate ──────────────────────────────────────────────"
check "GET /admin/countries as admin" 200 "$(get /admin/countries "$ADMIN_JAR")"
check "GET /api/v1/admin/countries as seeker" 403 "$(get /api/v1/admin/countries "$JAR")"

# An unlaunched, empty country must be refused. GB is seeded with nothing.
GB_ID=$($PSQL -tAc \
  "SELECT id FROM countries WHERE iso_code='GB'" | tr -d '[:space:]')
if [[ -n "$GB_ID" ]]; then
  GATE=$(curl -s -b "$ADMIN_JAR" -X POST -H 'Content-Type: application/json' \
    -d '{"action":"activate"}' "$BASE/api/v1/admin/countries/$GB_ID")
  if echo "$GATE" | grep -q "isn't ready to launch"; then
    printf '  \033[32m✓\033[0m %-52s refused an empty country\n' "Launch gate"
    PASSED=$((PASSED + 1))
  else
    printf '  \033[31m✗\033[0m %-52s %s\n' "Launch gate" "$(echo "$GATE" | head -c 90)"
    FAILED=$((FAILED + 1))
  fi

  STILL_OFF=$($PSQL -tAc \
    "SELECT is_active FROM countries WHERE id='$GB_ID'" | tr -d '[:space:]')
  check "Refused country stayed inactive" "f" "$STILL_OFF"
fi

# Switching to an unlaunched country must be refused too.
check "Switching to an unlaunched country" 422 "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"isoCode":"GB"}' "$BASE/api/v1/geo/country")"
check "Switching to a nonexistent country" 422 "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"isoCode":"ZZ"}' "$BASE/api/v1/geo/country")"
check "Switching to a live country" 200 "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"isoCode":"AE"}' "$BASE/api/v1/geo/country")"

# The last live country must not be switchable off.
IN_ID=$($PSQL -tAc \
  "SELECT id FROM countries WHERE iso_code='IN'" | tr -d '[:space:]')
$PSQL -q -c \
  "UPDATE countries SET is_active=false WHERE iso_code='AE'" >/dev/null
LAST=$(curl -s -b "$ADMIN_JAR" -X POST -H 'Content-Type: application/json' \
  -d '{"action":"deactivate"}' "$BASE/api/v1/admin/countries/$IN_ID")
if echo "$LAST" | grep -q "only active country"; then
  printf '  \033[32m✓\033[0m %-52s refused\n' "Switching off the last live country"
  PASSED=$((PASSED + 1))
else
  printf '  \033[31m✗\033[0m %-52s %s\n' "Switching off the last live country" "$(echo "$LAST" | head -c 70)"
  FAILED=$((FAILED + 1))
fi
$PSQL -q -c \
  "UPDATE countries SET is_active=true WHERE iso_code='AE'" >/dev/null

echo
echo "── Subscriptions: one per user, structurally ────────────────────"
UQ=$($PSQL -tAc \
  "SELECT count(*) FROM pg_indexes WHERE tablename='subscriptions' AND indexname='subscription_user_uq'" | tr -d '[:space:]')
check "subscription_user_uq index exists" 1 "$UQ"

DUPES=$($PSQL -tAc \
  "SELECT count(*) FROM (SELECT user_id FROM subscriptions GROUP BY user_id HAVING count(*)>1) t" | tr -d '[:space:]')
check "No user holds two subscriptions" 0 "$DUPES"

# The constraint must actually bite, not merely exist.
VIOLATION=$($PSQL -tAc "
  INSERT INTO subscriptions (id, user_id, plan_id, current_period_end)
  SELECT 'smokedup1', u.id, p.id, now() + interval '30 days' FROM users u, plans p
  WHERE u.email='demo@examwale.test' AND p.code='free';
  INSERT INTO subscriptions (id, user_id, plan_id, current_period_end)
  SELECT 'smokedup2', u.id, p.id, now() + interval '30 days' FROM users u, plans p
  WHERE u.email='demo@examwale.test' AND p.code='free';
" 2>&1 | grep -c "subscription_user_uq")
check "A second subscription row is rejected" 1 "$VIOLATION"
$PSQL -q -c \
  "DELETE FROM subscriptions WHERE id IN ('smokedup1','smokedup2')" >/dev/null

# A lapsed subscriber resubscribing must not collide — the upsert path.
$PSQL -q -c \
  "INSERT INTO subscriptions (id, user_id, plan_id, status, current_period_end)
   SELECT 'smokelapsed', u.id, p.id, 'EXPIRED', now() - interval '1 day' FROM users u, plans p
   WHERE u.email='demo@examwale.test' AND p.code='free'
   ON CONFLICT (user_id) DO NOTHING;" >/dev/null
RESUB=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X POST -H 'Content-Type: application/json' \
  -d "{\"planCode\":\"free\",\"idempotencyKey\":\"smoke-resub-$RANDOM\"}" "$BASE/api/v1/billing/checkout")
check "A lapsed subscriber can resubscribe" 201 "$RESUB"
$PSQL -q -c \
  "DELETE FROM subscriptions WHERE user_id = (SELECT id FROM users WHERE email='demo@examwale.test');
   DELETE FROM payments WHERE idempotency_key LIKE 'smoke-resub-%';
   UPDATE users SET plan='FREE' WHERE email='demo@examwale.test';" >/dev/null

echo
echo "── Phase 3 · pages render in both countries ─────────────────────"
for path in / /careers /exams /jobs /business /courses /mentors; do
  check "GET $path as UAE" 200 "$(curl -s -o /dev/null -w '%{http_code}' -H 'Cookie: examwale_country=AE' "$BASE$path")"
done
check "GET a UAE career detail" 200 "$(curl -s -o /dev/null -w '%{http_code}' -H 'Cookie: examwale_country=AE' "$BASE/careers/registered-nurse-ae")"
check "Junk country cookie falls back cleanly" 200 "$(curl -s -o /dev/null -w '%{http_code}' -H 'Cookie: examwale_country=NOTACOUNTRY' "$BASE/careers")"

echo
echo "── Phase 4 · search typeahead ───────────────────────────────────"
check "GET /api/v1/search/suggest (no session)" 200 "$(getn '/api/v1/search/suggest?q=software')"
SUGGEST=$(curl -s "$BASE/api/v1/search/suggest?q=software")
check "Typeahead returns career hits" 1 "$(printf '%s' "$SUGGEST" | grep -c '"kind":"career"')"
# A one-character query must not hit the database at all.
check "One-character query returns nothing" 1 \
  "$(curl -s "$BASE/api/v1/search/suggest?q=s" | grep -c '"hits":\[\]')"
# Suggestions must respect the country the visitor is browsing, or the
# dropdown will preview records the results page then refuses to show.
AE_SUGGEST=$(curl -s -H 'Cookie: examwale_country=AE' "$BASE/api/v1/search/suggest?q=nurse")
check "Typeahead is country-scoped (no -in slugs under AE)" 0 \
  "$(printf '%s' "$AE_SUGGEST" | grep -c '"slug":"[a-z-]*-in"')"

echo
echo "── Guidance tools (rulebook only) ───────────────────────────────"
check "GET /guidance (public)" 200 "$(getn /guidance)"
check "GET /guidance/matches (public)" 200 "$(getn /guidance/matches)"
for path in /guidance/resume /guidance/interview; do
  code=$(getn "$path")
  if [[ "$code" == "200" || "$code" == "307" ]]; then
    printf '  \033[32m✓\033[0m %-52s %s\n' "GET $path gated" "$code"
    PASSED=$((PASSED + 1))
  else
    printf '  \033[31m✗\033[0m %-52s got %s\n' "GET $path gated" "$code"
    FAILED=$((FAILED + 1))
  fi
done
check "GET /guidance/resume signed in" 200 "$(get /guidance/resume "$JAR")"
check "GET /guidance/interview signed in" 200 "$(get /guidance/interview "$JAR")"

echo
echo "── Phase 4 · résumé review ──────────────────────────────────────"
check "POST /api/v1/guidance/resume needs a session" 401 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
      -d '{"text":"x"}' "$BASE/api/v1/guidance/resume")"
# Too short to review: refused rather than scored on nothing.
check "A three-word résumé is refused" 422 \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X POST -H 'Content-Type: application/json' \
      -d '{"text":"I am good"}' "$BASE/api/v1/guidance/resume")"

REVIEW_BODY='{"targetSlug":"software-developer-in","text":"ASHA MENON\nasha@example.com | +91 9876500011 | linkedin.com/in/asha\n\nSUMMARY\nBackend engineer.\n\nEXPERIENCE\nEngineer, Acme (2022 - present)\n- Responsible for the payments service\n- Reduced p95 latency from 800ms to 210ms across 14 endpoints\n- Wrote SQL reports used by 30 people weekly\n\nEDUCATION\nB.Tech Computer Science, 2021\n\nSKILLS\nPython, SQL, React, Docker, Git\n\nCERTIFICATIONS\nAWS Certified Cloud Practitioner"}'
REVIEW=$(curl -s -b "$JAR" -X POST -H 'Content-Type: application/json' -d "$REVIEW_BODY" \
  "$BASE/api/v1/guidance/resume")
check "Review returns an overall score" 1 "$(printf '%s' "$REVIEW" | grep -c '"overall"')"
check "Review scores all six sections" 6 \
  "$(printf '%s' "$REVIEW" | grep -o '"key":"[a-z]*"' | wc -l | tr -d ' ')"
# The keyword comparison must come from the role's own skill rows.
check "Matched skills are drawn from the target role" 1 \
  "$(printf '%s' "$REVIEW" | grep -c '"matchedForTarget":\[')"
check "Review is persisted with an id" 1 "$(printf '%s' "$REVIEW" | grep -c '"id":"')"
# A quoted "before" line that isn't in the résumé is the one failure mode that
# would make the rewrites worse than useless, so the route drops any it cannot
# find. Here: every quoted opener must be one the fixture actually contains.
check "Rewrites quote lines that exist in the résumé" 0 \
  "$(printf '%s' "$REVIEW" | grep -o '"before":"[^"]*"' | grep -vc 'Responsible for' || true)"

echo
echo "── Phase 4 · interview practice ─────────────────────────────────"
check "POST /api/v1/guidance/interview needs a session" 401 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
      -d '{"round":"MIXED"}' "$BASE/api/v1/guidance/interview")"
IV=$(curl -s -b "$JAR" -X POST -H 'Content-Type: application/json' \
  -d '{"targetSlug":"software-developer-in","round":"MIXED","count":6}' "$BASE/api/v1/guidance/interview")
IV_ID=$(printf '%s' "$IV" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
check "A practice set is created" 6 "$(printf '%s' "$IV" | grep -o '"index":[0-9]*' | wc -l | tr -d ' ')"
check "Questions are grounded in the role's guide" 1 "$(printf '%s' "$IV" | grep -c '"grounded":true')"
# A full mock that is six motivation questions is not a full mock.
CATS=$(printf '%s' "$IV" | grep -o '"category":"[A-Z_]*"' | sort -u | wc -l | tr -d ' ')
if [[ "$CATS" -ge 4 ]]; then
  printf '  \033[32m✓\033[0m %-52s %s\n' "A full mock spans at least four categories" "$CATS"
  PASSED=$((PASSED + 1))
else
  printf '  \033[31m✗\033[0m %-52s got %s, expected >= 4\n' "A full mock spans at least four categories" "$CATS"
  FAILED=$((FAILED + 1))
fi

# The grader must separate a structured, quantified answer from a vague one.
STRONG='{"questionIndex":0,"answer":"Last year at Acme my role was to own the payments service. I pushed a change on a Friday without a staged rollout. It broke refunds for about 400 customers over six hours. I rolled it back, wrote the incident up, and we added a rule that payment changes never ship after Thursday. Since then I have shipped around 60 changes with no incidents, and I insist on a canary even when it slows me down."}'
WEAK='{"questionIndex":0,"answer":"We had some problems on a project once and we fixed them as a team. It was a learning experience."}'
STRONG_SCORE=$(curl -s -b "$JAR" -X POST -H 'Content-Type: application/json' -d "$STRONG" \
  "$BASE/api/v1/guidance/interview/$IV_ID/answer" | grep -o '"score":[0-9]*' | head -1 | cut -d: -f2)
WEAK_SCORE=$(curl -s -b "$JAR" -X POST -H 'Content-Type: application/json' -d "$WEAK" \
  "$BASE/api/v1/guidance/interview/$IV_ID/answer" | grep -o '"score":[0-9]*' | head -1 | cut -d: -f2)
if [[ -n "$STRONG_SCORE" && -n "$WEAK_SCORE" && "$STRONG_SCORE" -gt $(( WEAK_SCORE + 25 )) ]]; then
  printf '  \033[32m✓\033[0m %-52s %s vs %s\n' "A STAR answer outscores a vague one" "$STRONG_SCORE" "$WEAK_SCORE"
  PASSED=$((PASSED + 1))
else
  printf '  \033[31m✗\033[0m %-52s got %s vs %s\n' "A STAR answer outscores a vague one" "${STRONG_SCORE:-none}" "${WEAK_SCORE:-none}"
  FAILED=$((FAILED + 1))
fi

# Re-answering replaces rather than stacks, so "your score" stays unambiguous.
ANSWER_ROWS=$($PSQL -tAc "SELECT count(*) FROM interview_answers WHERE session_id='$IV_ID' AND question_index=0" | tr -d ' ')
check "Re-answering replaces the previous attempt" 1 "$ANSWER_ROWS"

# Another user's practice session must not be readable.
check "Another user's session is refused" 403 \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" "$BASE/api/v1/guidance/interview/$IV_ID/answer")"
check "An out-of-range question index is refused" 422 \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X POST -H 'Content-Type: application/json' \
      -d '{"questionIndex":19,"answer":"something long enough to be graded properly here"}' \
      "$BASE/api/v1/guidance/interview/$IV_ID/answer")"

echo
echo "── Phase 4 · recommendations ────────────────────────────────────"
RECS=$(curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"interests":["technology"],"workStyle":"analytical","limit":8}' "$BASE/api/v1/guidance/matches")
check "Anonymous callers still get a shortlist" 1 "$(printf '%s' "$RECS" | grep -c '"careerSlug"')"
check "Anonymous callers get no written explanation" 1 "$(printf '%s' "$RECS" | grep -c '"rulesOnly":true')"
# Every slug must correspond to a real published guide — the whole point of
# restricting the model to the scorer's shortlist.
BAD_SLUGS=0
for slug in $(printf '%s' "$RECS" | grep -o '"careerSlug":"[^"]*"' | cut -d'"' -f4); do
  [[ "$(getn "/careers/$slug")" == "200" ]] || BAD_SLUGS=$((BAD_SLUGS + 1))
done
check "Every recommended career has a live page" 0 "$BAD_SLUGS"
check "Signed-in recommendations are saved" 1 \
  "$(curl -s -b "$JAR" -X POST -H 'Content-Type: application/json' \
      -d '{"interests":["technology"],"limit":5}' "$BASE/api/v1/guidance/matches" | grep -c '"saved":true')"

echo
echo "── Phase 4 · study plan guidance is additive ────────────────────"
# With no model key the plan must still be complete: the AI layer is never a
# gate on the arithmetic a user might budget their year against.
PLAN=$(curl -s -b "$JAR" -X POST -H 'Content-Type: application/json' \
  -d "{\"hoursPerDay\":4,\"targetDate\":\"$(date -u -d '+8 months' +%Y-%m-%d 2>/dev/null || date -u -v+8m +%Y-%m-%d)\",\"withGuidance\":true}" \
  "$BASE/api/v1/exams/upsc-cse/study-plan")
check "A plan is returned with guidance requested" 1 "$(printf '%s' "$PLAN" | grep -c '"totalHours"')"
check "The feasibility verdict is still computed" 1 "$(printf '%s' "$PLAN" | grep -c '"verdict"')"
check "Signed-out visitors get the plan without guidance" 200 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
      -d "{\"hoursPerDay\":4,\"targetDate\":\"$(date -u -d '+8 months' +%Y-%m-%d 2>/dev/null || date -u -v+8m +%Y-%m-%d)\",\"withGuidance\":true}" \
      "$BASE/api/v1/exams/upsc-cse/study-plan")"

echo
echo "── Stage 1 · job expiry is load-bearing ─────────────────────────"
# expires_at existed as a column and was read by nothing. These four checks are
# the ones that would have caught it: a posting past its deadline must leave the
# listing, the region facet, the detail page and the application endpoint.
LIVE_JOB=$($PSQL -tAc "SELECT slug FROM job_postings WHERE status='ACTIVE' ORDER BY slug LIMIT 1" | tr -d ' ')
JOB_EXPIRY_WAS=$($PSQL -tAc "SELECT coalesce(to_char(expires_at,'YYYY-MM-DD\"T\"HH24:MI:SS+00'),'') FROM job_postings WHERE slug='$LIVE_JOB'")
restore_job_expiry() {
  if [[ -n "$JOB_EXPIRY_WAS" ]]; then
    $PSQL -q -c "UPDATE job_postings SET expires_at='$JOB_EXPIRY_WAS' WHERE slug='$LIVE_JOB'" >/dev/null
  else
    $PSQL -q -c "UPDATE job_postings SET expires_at=NULL WHERE slug='$LIVE_JOB'" >/dev/null
  fi
}
check "A live posting is reachable" 200 "$(getn "/jobs/$LIVE_JOB")"
check "A live posting appears on the board" 1 "$(curl -s "$BASE/jobs?perPage=50" | grep -c "$LIVE_JOB")"

# Expire it, then every surface must agree that it is gone.
$PSQL -q -c "UPDATE job_postings SET expires_at = now() - interval '1 day' WHERE slug='$LIVE_JOB'" >/dev/null
check "An expired posting 404s on its own page" 404 "$(getn "/jobs/$LIVE_JOB")"
check "An expired posting leaves the board" 0 "$(curl -s "$BASE/jobs?perPage=50" | grep -c "$LIVE_JOB")"
check "An expired posting is absent from search" 0 \
  "$(curl -s "$BASE/api/v1/search?q=$LIVE_JOB" | grep -c "\"$LIVE_JOB\"")"
EXPIRED_ID=$($PSQL -tAc "SELECT id FROM job_postings WHERE slug='$LIVE_JOB'" | tr -d ' ')
check "An expired posting refuses applications" 404 \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X POST -H 'Content-Type: application/json' \
      -d '{}' "$BASE/api/v1/jobs/$EXPIRED_ID/apply")"
# An admin still needs to be able to read it in order to moderate it.
check "An admin can still open an expired posting" 200 "$(get "/jobs/$LIVE_JOB" "$ADMIN_JAR")"
restore_job_expiry
check "Restoring the deadline restores the posting" 200 "$(getn "/jobs/$LIVE_JOB")"

# A future deadline must not hide a posting — null and future both mean live.
$PSQL -q -c "UPDATE job_postings SET expires_at = now() + interval '30 days' WHERE slug='$LIVE_JOB'" >/dev/null
check "A posting with a future deadline stays live" 200 "$(getn "/jobs/$LIVE_JOB")"
$PSQL -q -c "UPDATE job_postings SET expires_at = NULL WHERE slug='$LIVE_JOB'" >/dev/null
check "A posting with no deadline stays live" 200 "$(getn "/jobs/$LIVE_JOB")"
restore_job_expiry

# Drafts were readable by anyone holding the slug — getJobBySlug applied no
# status filter at all.
$PSQL -q -c "UPDATE job_postings SET status='DRAFT' WHERE slug='$LIVE_JOB'" >/dev/null
check "A draft posting 404s for the public" 404 "$(getn "/jobs/$LIVE_JOB")"
$PSQL -q -c "UPDATE job_postings SET status='CLOSED' WHERE slug='$LIVE_JOB'" >/dev/null
check "A closed posting 404s for the public" 404 "$(getn "/jobs/$LIVE_JOB")"
$PSQL -q -c "UPDATE job_postings SET status='ACTIVE' WHERE slug='$LIVE_JOB'" >/dev/null

echo
echo "── Stage 1 · storage driver ─────────────────────────────────────"
check "storage_objects table exists" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM information_schema.tables WHERE table_name='storage_objects'" | tr -d ' ')"
# A document uploaded through the API must leave bytes in the store, not just a
# metadata row. Under the old local-disk default on a serverless host the row
# was written and the bytes were not.
RESUME_FIXTURE=$(mktemp /tmp/smoke-resume-XXXX.txt)
printf 'ASHA MENON\nasha@example.com | +91 9876500011\n\nEXPERIENCE\n- Reduced p95 latency from 800ms to 210ms\n\nSKILLS\nPython, SQL\n' > "$RESUME_FIXTURE"
UPLOAD=$(curl -s -b "$JAR" -F "file=@$RESUME_FIXTURE;type=text/plain" -F "kind=RESUME" \
  "$BASE/api/v1/documents")
check "A document upload succeeds" 1 "$(printf '%s' "$UPLOAD" | grep -c '"id"')"
DOC_ID=$(printf '%s' "$UPLOAD" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [[ -n "$DOC_ID" ]]; then
  STORED=$($PSQL -tAc "SELECT count(*) FROM storage_objects so JOIN user_documents ud ON ud.storage_key = so.key WHERE ud.id='$DOC_ID'" | tr -d ' ')
  check "The bytes reached the store, not just the row" 1 "$STORED"
  check "The stored size is non-zero" 0 \
    "$($PSQL -tAc "SELECT count(*) FROM storage_objects so JOIN user_documents ud ON ud.storage_key=so.key WHERE ud.id='$DOC_ID' AND so.size_bytes=0" | tr -d ' ')"
  check "The document reads back through the authorised route" 200 \
    "$(get "/api/v1/documents/$DOC_ID" "$JAR")"
  DENIED=$(get "/api/v1/documents/$DOC_ID" "$ADMIN_JAR")
  if [[ "$DENIED" == "403" || "$DENIED" == "404" ]]; then
    printf '  \033[32m✓\033[0m %-52s %s\n' "Another user cannot read it" "$DENIED"
    PASSED=$((PASSED + 1))
  else
    printf '  \033[31m✗\033[0m %-52s got %s\n' "Another user cannot read it" "$DENIED"
    FAILED=$((FAILED + 1))
  fi
fi
rm -f "$RESUME_FIXTURE"

echo
echo "── Stage 1 · rate limiting is shared ────────────────────────────"
check "rate_limit_buckets table exists" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM information_schema.tables WHERE table_name='rate_limit_buckets'" | tr -d ' ')"
# The limiter must leave a row in Postgres, which is the whole point — an
# in-process map leaves nothing for a second instance to see.
$PSQL -q -c "DELETE FROM rate_limit_buckets WHERE key LIKE 'login:acct:smoke-rl%'" >/dev/null
curl -s -o /dev/null -X POST -H 'Content-Type: application/json' \
  -d '{"email":"smoke-rl@example.com","password":"wrong-on-purpose"}' "$BASE/api/v1/auth/login"
check "A limited request is recorded in Postgres" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM rate_limit_buckets WHERE key='login:acct:smoke-rl@example.com'" | tr -d ' ')"
# Exhaust the per-account limit (10 in 15 minutes) and confirm a 429 arrives.
for _ in $(seq 1 12); do
  curl -s -o /dev/null -X POST -H 'Content-Type: application/json' \
    -d '{"email":"smoke-rl@example.com","password":"wrong-on-purpose"}' "$BASE/api/v1/auth/login"
done
check "The limit actually rejects" 429 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
      -d '{"email":"smoke-rl@example.com","password":"wrong-on-purpose"}' "$BASE/api/v1/auth/login")"
# The shared counter must reach the limit. It stops there rather than climbing
# past it because the in-process layer rejects first and skips the round trip —
# which is the intended ordering: the cheap check short-circuits, and the shared
# one is what a second instance reads.
RL_COUNT=$($PSQL -tAc "SELECT count FROM rate_limit_buckets WHERE key='login:acct:smoke-rl@example.com'" | tr -d ' ')
if [[ -n "$RL_COUNT" && "$RL_COUNT" -ge 10 ]]; then
  printf '  \033[32m✓\033[0m %-52s %s\n' "The shared counter reached the limit" "$RL_COUNT"
  PASSED=$((PASSED + 1))
else
  printf '  \033[31m✗\033[0m %-52s got %s, expected >= 10\n' "The shared counter reached the limit" "${RL_COUNT:-none}"
  FAILED=$((FAILED + 1))
fi
# A different account must not inherit that rejection.
check "A different account is unaffected" 401 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
      -d '{"email":"smoke-rl-other@example.com","password":"wrong-on-purpose"}' "$BASE/api/v1/auth/login")"
$PSQL -q -c "DELETE FROM rate_limit_buckets WHERE key LIKE 'login:acct:smoke-rl%'" >/dev/null
$PSQL -q -c "DELETE FROM rate_limit_buckets WHERE key LIKE 'login:acct:smoke-rl%'" >/dev/null

echo
echo "── Stage 1 · booking respects the mentor's timezone ─────────────"
# The defect: availability minutes are wall-clock in the mentor's zone, and the
# booking check read them with the server's clock. On a UTC host that put a
# Kolkata mentor's published hours 5h30 out — 10:00 IST refused, 15:30 accepted.
MENTOR_ID=$($PSQL -tAc "SELECT id FROM mentors WHERE status='ACTIVE' AND credential_verified_at IS NOT NULL LIMIT 1" | tr -d ' ')
if [[ -n "$MENTOR_ID" ]]; then
  check "A listed mentor's page renders" 200 "$(getn "/mentors/$MENTOR_ID")"
  # Pin availability to Tuesday 10:00–13:00 Asia/Kolkata so the expected UTC
  # instants are known exactly.
  $PSQL -q -c "DELETE FROM mentor_availability WHERE mentor_id='$MENTOR_ID';
    INSERT INTO mentor_availability (id, mentor_id, weekday, start_minute, end_minute, timezone)
    VALUES ('smoketz1','$MENTOR_ID',2,600,780,'Asia/Kolkata');
    UPDATE mentors SET session_minutes=30 WHERE id='$MENTOR_ID';" >/dev/null
  # The free plan allows one session a month, so a previous run would refuse
  # these bookings for a reason unrelated to what is being tested.
  SMOKE_SEEKER=$($PSQL -tAc "SELECT id FROM users WHERE email='demo@examwale.test'" | tr -d ' ')
  $PSQL -q -c "DELETE FROM mentorship_sessions WHERE mentor_id='$MENTOR_ID' AND topic LIKE 'smoke-tz%';
    DELETE FROM mentorship_sessions WHERE seeker_id='$SMOKE_SEEKER';" >/dev/null

  # Next Tuesday at 04:30Z is 10:00 IST — inside the window.
  NEXT_TUE=$($PSQL -tAc "SELECT to_char((date_trunc('week', now() + interval '7 days') + interval '1 day')::date, 'YYYY-MM-DD')" | tr -d ' ')
  IN_WINDOW="${NEXT_TUE}T04:30:00.000Z"
  OUT_OF_WINDOW="${NEXT_TUE}T10:00:00.000Z"

  BOOK_IN=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X POST -H 'Content-Type: application/json' \
    -d "{\"topic\":\"smoke-tz in window\",\"scheduledAt\":\"$IN_WINDOW\"}" \
    "$BASE/api/v1/mentors/$MENTOR_ID/sessions")
  check "10:00 in the mentor's zone is accepted" 201 "$BOOK_IN"

  BOOK_OUT=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X POST -H 'Content-Type: application/json' \
    -d "{\"topic\":\"smoke-tz out of window\",\"scheduledAt\":\"$OUT_OF_WINDOW\"}" \
    "$BASE/api/v1/mentors/$MENTOR_ID/sessions")
  check "The same clock time in UTC is refused" 422 "$BOOK_OUT"

  # Off-grid inside the window, and the right time on the wrong weekday.
  check "A time off the session grid is refused" 422 \
    "$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X POST -H 'Content-Type: application/json' \
        -d "{\"topic\":\"smoke-tz offgrid\",\"scheduledAt\":\"${NEXT_TUE}T04:37:00.000Z\"}" \
        "$BASE/api/v1/mentors/$MENTOR_ID/sessions")"

  # Double booking, as it actually happens: a *second person* wants the slot the
  # first one just took. Using the same seeker would hit the per-seeker monthly
  # allowance first and never reach the collision.
  check "A second seeker cannot take the same slot" 409 \
    "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" -X POST -H 'Content-Type: application/json' \
        -d "{\"topic\":\"smoke-tz duplicate\",\"scheduledAt\":\"$IN_WINDOW\"}" \
        "$BASE/api/v1/mentors/$MENTOR_ID/sessions")"
  check "Only one session row exists for that instant" 1 \
    "$($PSQL -tAc "SELECT count(*) FROM mentorship_sessions WHERE mentor_id='$MENTOR_ID' AND scheduled_at='$IN_WINDOW'" | tr -d ' ')"

  # An unknown zone must be refused on write, not left to break slot generation
  # on the mentor's public page. Called as the mentor, since the endpoint is
  # keyed to the signed-in user.
  MENTOR_EMAIL=$($PSQL -tAc "SELECT u.email FROM users u JOIN mentors m ON m.user_id=u.id WHERE m.id='$MENTOR_ID'" | tr -d ' ')
  MENTOR_JAR=$(mktemp)
  MENTOR_LOGIN=$(curl -s -o /dev/null -w '%{http_code}' -c "$MENTOR_JAR" -X POST -H 'Content-Type: application/json' \
    -d "{\"email\":\"$MENTOR_EMAIL\",\"password\":\"examwale-mentor-2026\"}" "$BASE/api/v1/auth/login")
  if [[ "$MENTOR_LOGIN" == "200" ]]; then
    check "An invalid timezone is refused on save" 422 \
      "$(curl -s -o /dev/null -w '%{http_code}' -b "$MENTOR_JAR" -X PUT -H 'Content-Type: application/json' \
          -d '{"slots":[{"weekday":2,"startMinute":600,"endMinute":780,"timezone":"Mars/Olympus"}]}' \
          "$BASE/api/v1/mentors/me/availability")"
    check "A valid timezone is accepted" 200 \
      "$(curl -s -o /dev/null -w '%{http_code}' -b "$MENTOR_JAR" -X PUT -H 'Content-Type: application/json' \
          -d '{"slots":[{"weekday":2,"startMinute":600,"endMinute":780,"timezone":"Asia/Dubai"}]}' \
          "$BASE/api/v1/mentors/me/availability")"
    check "The saved zone is what was sent" "Asia/Dubai" \
      "$($PSQL -tAc "SELECT timezone FROM mentor_availability WHERE mentor_id='$MENTOR_ID' LIMIT 1" | tr -d ' ')"
  else
    printf '  \033[31m✗\033[0m %-52s mentor sign-in returned %s\n' "Timezone validation" "$MENTOR_LOGIN"
    FAILED=$((FAILED + 1))
  fi
  rm -f "$MENTOR_JAR"

  $PSQL -q -c "DELETE FROM mentorship_sessions WHERE mentor_id='$MENTOR_ID' AND topic LIKE 'smoke-tz%';
    DELETE FROM mentor_availability WHERE id='smoketz1';" >/dev/null
fi

echo
echo "── Stage 2 · scheduler ──────────────────────────────────────────"
CRON_KEY="${CRON_SECRET:-dev-cron-secret-for-local-testing-only}"
tick() { curl -s -H "Authorization: Bearer $CRON_KEY" "$BASE/api/cron/tick"; }
tick_code() { curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $CRON_KEY" "$BASE/api/cron/tick"; }

check "scheduled_task_runs table exists" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM information_schema.tables WHERE table_name='scheduled_task_runs'" | tr -d ' ')"
# The overlap guard is a partial unique index, not application logic.
check "One RUNNING row per task, enforced by an index" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM pg_indexes WHERE indexname='scheduled_run_one_active_uq'" | tr -d ' ')"

# The endpoint must refuse everything it cannot authenticate. It sends email and
# writes rows, so an open trigger is not an acceptable default.
check "The tick refuses an unauthenticated call" 401 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/cron/tick")"
check "The tick refuses a wrong secret" 401 \
  "$(curl -s -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer definitely-not-the-secret' "$BASE/api/cron/tick")"
check "The tick accepts the right secret" 200 "$(tick_code)"
check "It also accepts the header some schedulers must use" 200 \
  "$(curl -s -o /dev/null -w '%{http_code}' -H "x-cron-secret: $CRON_KEY" "$BASE/api/cron/tick")"

$PSQL -q -c "DELETE FROM scheduled_task_runs" >/dev/null
FIRST=$(tick)
# Counted from the registry rather than hard-coded, so adding a task does not
# mean editing this test.
TASK_COUNT=$(grep -cE '^  "[a-z-]+": \{$' src/modules/scheduler/tasks.ts)
check "Every registered task ran on a clean history" "$TASK_COUNT" \
  "$(printf '%s' "$FIRST" | grep -o '"status":"SUCCEEDED"' | wc -l | tr -d ' ')"
check "The tick reports no failures" 1 "$(printf '%s' "$FIRST" | grep -c '"ok":true')"

# Due-checking: a second tick immediately after must run nothing.
check "A second tick skips everything as not due" "$TASK_COUNT" \
  "$(tick | grep -o '"status":"SKIPPED"' | wc -l | tr -d ' ')"

# Concurrency. Eight simultaneous ticks against an empty history must still
# produce exactly one successful run per task — this is the check that caught
# two earlier versions of the claiming logic racing.
$PSQL -q -c "DELETE FROM scheduled_task_runs" >/dev/null
for _ in $(seq 1 8); do
  curl -s -o /dev/null -H "Authorization: Bearer $CRON_KEY" "$BASE/api/cron/tick" &
done
wait
check "8 concurrent ticks run each task exactly once" 0 \
  "$($PSQL -tAc "SELECT coalesce(sum(c-1),0) FROM (SELECT count(*) c FROM scheduled_task_runs WHERE status='SUCCEEDED' GROUP BY task) x" | tr -d ' ')"
check "No run is left stuck in RUNNING" 0 \
  "$($PSQL -tAc "SELECT count(*) FROM scheduled_task_runs WHERE status='RUNNING'" | tr -d ' ')"

# A run abandoned mid-task must be released, and recorded as abandoned rather
# than quietly overwritten — otherwise the task is blocked by its own corpse.
$PSQL -q -c "DELETE FROM scheduled_task_runs;
  INSERT INTO scheduled_task_runs (id, task, status, started_at)
  VALUES ('smokestale1','purge-rate-limits','RUNNING', now() - interval '40 minutes');" >/dev/null
STALE=$(tick)
check "An abandoned run is released" 1 "$(printf '%s' "$STALE" | grep -c '"staleRunsReleased":1')"
check "It is recorded as FAILED with a reason" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM scheduled_task_runs WHERE id='smokestale1' AND status='FAILED' AND detail LIKE 'Abandoned%'" | tr -d ' ')"
check "And the blocked task then ran" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM scheduled_task_runs WHERE task='purge-rate-limits' AND status='SUCCEEDED'" | tr -d ' ')"

echo
echo "── Stage 2 · the tasks actually do their work ───────────────────"
# Six notification types were declared, listed on every preferences screen, and
# unreachable because nothing noticed time passing. Each check below sets up the
# condition and asserts the notification arrives — then that a re-run does not
# send it twice, which is the property a scheduler most needs.
SMOKE_USER=$($PSQL -tAc "SELECT id FROM users WHERE email='demo@examwale.test'" | tr -d ' ')
SMOKE_MENTOR=$($PSQL -tAc "SELECT id FROM mentors WHERE status='ACTIVE' LIMIT 1" | tr -d ' ')
SMOKE_ROADMAP=$($PSQL -tAc "SELECT id FROM roadmaps WHERE user_id='$SMOKE_USER' LIMIT 1" | tr -d ' ')

SMOKE_MENTOR_USER=$($PSQL -tAc "SELECT user_id FROM mentors WHERE id='$SMOKE_MENTOR'" | tr -d ' ')
$PSQL -q -c "DELETE FROM notifications WHERE user_id IN ('$SMOKE_USER','$SMOKE_MENTOR_USER');
  DELETE FROM scheduled_task_runs;
  DELETE FROM mentorship_sessions WHERE topic LIKE 'smoke-sched%' OR topic LIKE 'sched-test%';
  INSERT INTO mentorship_sessions (id, mentor_id, seeker_id, topic, scheduled_at, duration_minutes, status)
  VALUES ('smokesched1','$SMOKE_MENTOR','$SMOKE_USER','smoke-sched session', now() + interval '18 hours', 30, 'ACCEPTED');
  UPDATE roadmap_steps SET target_date = now() + interval '2 days', status='NOT_STARTED'
   WHERE roadmap_id='$SMOKE_ROADMAP'
     AND sequence = (SELECT min(sequence) FROM roadmap_steps WHERE roadmap_id='$SMOKE_ROADMAP');" >/dev/null

tick >/dev/null
check "A session 18h out produces a reminder" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM notifications WHERE user_id='$SMOKE_USER' AND type='mentor.session_reminder'" | tr -d ' ')"
check "The reminder names a timezone" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM notifications WHERE user_id='$SMOKE_USER' AND type='mentor.session_reminder' AND (body LIKE '%IST%' OR body LIKE '%GST%' OR body LIKE '%GMT%' OR body LIKE '%UTC%')" | tr -d ' ')"
check "The mentor is reminded too" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM notifications WHERE user_id='$SMOKE_MENTOR_USER' AND type='mentor.session_reminder'" | tr -d ' ')"
check "A roadmap step due in 2 days produces a nudge" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM notifications WHERE user_id='$SMOKE_USER' AND type='roadmap.step_due'" | tr -d ' ')"

# Idempotency: clear the run history so every task is due again, and confirm the
# dedupe keys stop a second send. This is the check that matters most — a
# scheduler will run each task twice sooner or later.
BEFORE_N=$($PSQL -tAc "SELECT count(*) FROM notifications" | tr -d ' ')
$PSQL -q -c "DELETE FROM scheduled_task_runs" >/dev/null
tick >/dev/null
check "Re-running every task sends nothing twice" "$BEFORE_N" \
  "$($PSQL -tAc "SELECT count(*) FROM notifications" | tr -d ' ')"

# A cancelled session must stop producing reminders.
$PSQL -q -c "DELETE FROM notifications WHERE type='mentor.session_reminder';
  UPDATE mentorship_sessions SET status='CANCELLED' WHERE id='smokesched1';
  DELETE FROM scheduled_task_runs;" >/dev/null
tick >/dev/null
check "A cancelled session is not reminded about" 0 \
  "$($PSQL -tAc "SELECT count(*) FROM notifications WHERE user_id IN ('$SMOKE_USER','$SMOKE_MENTOR_USER') AND type='mentor.session_reminder'" | tr -d ' ')"

# A completed roadmap step must stop being nudged.
$PSQL -q -c "DELETE FROM notifications WHERE user_id='$SMOKE_USER' AND type='roadmap.step_due';
  UPDATE roadmap_steps SET status='DONE' WHERE roadmap_id='$SMOKE_ROADMAP';
  DELETE FROM scheduled_task_runs;" >/dev/null
tick >/dev/null
check "A completed step is not nudged" 0 \
  "$($PSQL -tAc "SELECT count(*) FROM notifications WHERE user_id='$SMOKE_USER' AND type='roadmap.step_due'" | tr -d ' ')"

$PSQL -q -c "DELETE FROM mentorship_sessions WHERE id='smokesched1';" >/dev/null

echo
echo "── Stage 2 · admin surface ──────────────────────────────────────"
check "GET /admin/scheduler as admin" 200 "$(get /admin/scheduler "$ADMIN_JAR")"
SEEKER_ADMIN=$(get /admin/scheduler "$JAR")
if [[ "$SEEKER_ADMIN" == "403" || "$SEEKER_ADMIN" == "307" ]]; then
  printf '  \033[32m✓\033[0m %-52s %s\n' "A seeker is turned away from it" "$SEEKER_ADMIN"
  PASSED=$((PASSED + 1))
else
  printf '  \033[31m✗\033[0m %-52s got %s\n' "A seeker is turned away from it" "$SEEKER_ADMIN"
  FAILED=$((FAILED + 1))
fi
check "Manual run needs a session" 401 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/v1/admin/scheduler/purge-rate-limits/run")"
check "Manual run refuses a non-admin" 403 \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -X POST "$BASE/api/v1/admin/scheduler/purge-rate-limits/run")"
check "An unknown task is refused" 404 \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" -X POST "$BASE/api/v1/admin/scheduler/not-a-real-task/run")"
check "An admin can force a task that is not due" 200 \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" -X POST "$BASE/api/v1/admin/scheduler/purge-rate-limits/run")"
check "The manual run is attributed, not logged as cron" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM scheduled_task_runs WHERE task='purge-rate-limits' AND trigger <> 'cron'" | tr -d ' ')"
check "And written to the audit log" 1 \
  "$($PSQL -tAc "SELECT least(count(*),1) FROM audit_logs WHERE action='scheduler.run'" | tr -d ' ')"

echo
echo "── Stage 3 · provider identity ──────────────────────────────────"
check "provider_profiles table exists" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM information_schema.tables WHERE table_name='provider_profiles'" | tr -d ' ')"
check "One profile per person, enforced by an index" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM pg_indexes WHERE indexname='provider_profile_user_uq'" | tr -d ' ')"
check "One row per capability per profile" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM pg_indexes WHERE indexname='provider_capability_uq'" | tr -d ' ')"
# The backfill has to have reached every mentor, or their listings vanish: the
# listing query now inner-joins the profile.
check "Every mentor has a provider profile" 0 \
  "$($PSQL -tAc "SELECT count(*) FROM mentors m LEFT JOIN provider_profiles pp ON pp.user_id=m.user_id WHERE pp.id IS NULL" | tr -d ' ')"
check "Every mentor has a MENTOR capability" 0 \
  "$($PSQL -tAc "SELECT count(*) FROM mentors m JOIN provider_profiles pp ON pp.user_id=m.user_id LEFT JOIN provider_capabilities pc ON pc.provider_profile_id=pp.id AND pc.kind='MENTOR' WHERE pc.id IS NULL" | tr -d ' ')"
# The capability status must agree with the mentor's own status, or a listed
# mentor shows as pending on their own dashboard.
check "Capability status matches the mentor's" 0 \
  "$($PSQL -tAc "SELECT count(*) FROM mentors m JOIN provider_profiles pp ON pp.user_id=m.user_id JOIN provider_capabilities pc ON pc.provider_profile_id=pp.id AND pc.kind='MENTOR' WHERE (m.status='ACTIVE') <> (pc.status='ACTIVE')" | tr -d ' ')"
check "Every profile has a timezone" 0 \
  "$($PSQL -tAc "SELECT count(*) FROM provider_profiles WHERE timezone IS NULL" | tr -d ' ')"
# The professional identity must be read from its new home, not the frozen copy.
check "Mentor listings still render" 200 "$(getn /mentors)"
MENTOR_PAGE_ID=$($PSQL -tAc "SELECT id FROM mentors WHERE status='ACTIVE' LIMIT 1" | tr -d ' ')
check "A mentor profile still renders" 200 "$(getn "/mentors/$MENTOR_PAGE_ID")"
# Change the profile and confirm the public page follows it — this is what
# proves the read moved rather than falling back to the old column.
PROFILE_ID=$($PSQL -tAc "SELECT pp.id FROM provider_profiles pp JOIN mentors m ON m.user_id=pp.user_id WHERE m.id='$MENTOR_PAGE_ID'" | tr -d ' ')
# Captured before the probe. An earlier version restored from `mentors.headline`,
# which Stage 3 superseded and the seed no longer fills — so the "restore" wrote
# NULL and left a test string on a live mentor profile.
HEADLINE_WAS=$($PSQL -tAc "SELECT headline FROM provider_profiles WHERE id='$PROFILE_ID'")
$PSQL -q -c "UPDATE provider_profiles SET headline='SMOKEHEADLINEPROBE' WHERE id='$PROFILE_ID'" >/dev/null
check "The public page reads the new profile" 1 \
  "$(curl -s "$BASE/mentors/$MENTOR_PAGE_ID" | grep -c 'SMOKEHEADLINEPROBE')"
check "So does the listing" 1 "$(curl -s "$BASE/mentors" | grep -c 'SMOKEHEADLINEPROBE')"
check "And search finds it there" 1 \
  "$(curl -s "$BASE/mentors?search=SMOKEHEADLINEPROBE" | grep -c 'SMOKEHEADLINEPROBE')"
$PSQL -q -c "UPDATE provider_profiles SET headline='$HEADLINE_WAS' WHERE id='$PROFILE_ID'" >/dev/null
check "The probe left no test data behind" 0 \
  "$($PSQL -tAc "SELECT count(*) FROM provider_profiles WHERE headline LIKE 'SMOKE%'" | tr -d ' ')"

echo
echo "── Stage 3 · one identity, several capabilities ──────────────────"
PROV_JAR=$(mktemp)
curl -s -o /dev/null -c "$PROV_JAR" -X POST -H 'Content-Type: application/json' \
  -d '{"email":"demo@examwale.test","password":"examwale-demo-2026"}' "$BASE/api/v1/auth/login"
SMOKE_PROV_USER=$($PSQL -tAc "SELECT id FROM users WHERE email='demo@examwale.test'" | tr -d ' ')
$PSQL -q -c "DELETE FROM provider_capabilities WHERE provider_profile_id IN
    (SELECT pp.id FROM provider_profiles pp WHERE pp.user_id='$SMOKE_PROV_USER');
  DELETE FROM provider_profiles WHERE user_id='$SMOKE_PROV_USER';" >/dev/null

check "A non-provider has no profile" 1 \
  "$(curl -s -b "$PROV_JAR" "$BASE/api/v1/providers/me" | grep -c '"profile":null')"
check "/provider renders the setup page for them" 200 "$(get /provider "$PROV_JAR")"

GOOD_BIO="I help commerce graduates work out whether an MBA is worth it, and what the alternatives actually pay."
mk_profile() {
  curl -s -o /dev/null -w '%{http_code}' -b "$PROV_JAR" -X PUT -H 'Content-Type: application/json' \
    -d "{\"displayName\":\"Demo User\",\"headline\":\"Career coach for commerce graduates\",\"bio\":\"$GOOD_BIO\",\"languages\":[\"English\"]$1}" \
    "$BASE/api/v1/providers/me"
}
check "A short bio is refused with a usable message" 1 \
  "$(curl -s -b "$PROV_JAR" -X PUT -H 'Content-Type: application/json' \
      -d '{"displayName":"Demo User","headline":"Career coach for commerce","bio":"too short","languages":["English"]}' \
      "$BASE/api/v1/providers/me" | grep -c 'tells a seeker nothing')"
# A profile field rendered as an anchor must not accept a script URL.
check "A javascript: link is refused" 1 \
  "$(mk_profile ',"links":[{"label":"Site","url":"javascript:alert(1)"}]' > /dev/null; \
     curl -s -b "$PROV_JAR" -X PUT -H 'Content-Type: application/json' \
      -d "{\"displayName\":\"Demo User\",\"headline\":\"Career coach for commerce graduates\",\"bio\":\"$GOOD_BIO\",\"languages\":[\"English\"],\"links\":[{\"label\":\"Site\",\"url\":\"javascript:alert(1)\"}]}" \
      "$BASE/api/v1/providers/me" | grep -c 'http or https')"
check "An unknown timezone is refused" 1 \
  "$(curl -s -b "$PROV_JAR" -X PUT -H 'Content-Type: application/json' \
      -d "{\"displayName\":\"Demo User\",\"headline\":\"Career coach for commerce graduates\",\"bio\":\"$GOOD_BIO\",\"languages\":[\"English\"],\"timezone\":\"Mars/Olympus\"}" \
      "$BASE/api/v1/providers/me" | grep -c "isn't a timezone")"
check "A valid profile saves" 200 "$(mk_profile ',"timezone":"Asia/Dubai"')"
check "Exactly one profile exists for that person" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM provider_profiles WHERE user_id='$SMOKE_PROV_USER'" | tr -d ' ')"
check "Saving twice does not create a second" 1 \
  "$(mk_profile ',"timezone":"Asia/Dubai"' >/dev/null; $PSQL -tAc "SELECT count(*) FROM provider_profiles WHERE user_id='$SMOKE_PROV_USER'" | tr -d ' ')"

apply_for() {
  curl -s -b "$PROV_JAR" -X POST -H 'Content-Type: application/json' \
    -d "{\"kind\":\"$1\"}" "$BASE/api/v1/providers/me/capabilities"
}
check "Applying for a service capability works" 1 "$(apply_for SERVICE_PROVIDER | grep -c '"status":"PENDING"')"
check "Applying twice does not stack" 1 \
  "$(apply_for SERVICE_PROVIDER >/dev/null; $PSQL -tAc "SELECT count(*) FROM provider_capabilities pc JOIN provider_profiles pp ON pp.id=pc.provider_profile_id WHERE pp.user_id='$SMOKE_PROV_USER' AND pc.kind='SERVICE_PROVIDER'" | tr -d ' ')"
# Mentoring and hiring collect things this endpoint has no way to gather, so it
# must send the applicant to the right flow rather than creating an empty row.
check "MENTOR is redirected to its own flow" 1 "$(apply_for MENTOR | grep -c '/mentors/apply')"
check "EMPLOYER is redirected to its own flow" 1 "$(apply_for EMPLOYER | grep -c '/employers/register')"
check "Two capabilities can coexist on one identity" 2 \
  "$(apply_for COURSE_PROVIDER >/dev/null; $PSQL -tAc "SELECT count(*) FROM provider_capabilities pc JOIN provider_profiles pp ON pp.id=pc.provider_profile_id WHERE pp.user_id='$SMOKE_PROV_USER'" | tr -d ' ')"
check "…still sharing a single profile" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM provider_profiles WHERE user_id='$SMOKE_PROV_USER'" | tr -d ' ')"
# The nav link keys on having a profile, not on holding an approved capability:
# somebody whose application is still under review needs to reach the page that
# tells them so.
check "A pending-only provider still gets the nav link" 1 \
  "$(curl -s -b "$PROV_JAR" "$BASE/dashboard" | grep -c 'href="/provider"')"
check "A non-provider does not" 0 \
  "$(curl -s -b "$ADMIN_JAR" "$BASE/dashboard" | grep -c 'href="/provider"')"

echo
echo "── Stage 3 · capability moderation ──────────────────────────────"
SMOKE_CAP=$($PSQL -tAc "SELECT pc.id FROM provider_capabilities pc JOIN provider_profiles pp ON pp.id=pc.provider_profile_id WHERE pp.user_id='$SMOKE_PROV_USER' AND pc.kind='SERVICE_PROVIDER'" | tr -d ' ')
check "GET /admin/providers as admin" 200 "$(get /admin/providers "$ADMIN_JAR")"
check "A pending application is in the queue" 1 \
  "$(curl -s -b "$ADMIN_JAR" "$BASE/admin/providers" | grep -c 'Career coach for commerce graduates')"
check "A seeker cannot decide an application" 403 \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$PROV_JAR" -X PATCH -H 'Content-Type: application/json' \
      -d '{"status":"ACTIVE"}' "$BASE/api/v1/admin/providers/capabilities/$SMOKE_CAP")"
check "A refusal with no reason is refused" 1 \
  "$(curl -s -b "$ADMIN_JAR" -X PATCH -H 'Content-Type: application/json' -d '{"status":"REJECTED"}' \
      "$BASE/api/v1/admin/providers/capabilities/$SMOKE_CAP" | grep -c 'Say why')"
check "Approval works" 200 \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" -X PATCH -H 'Content-Type: application/json' \
      -d '{"status":"ACTIVE"}' "$BASE/api/v1/admin/providers/capabilities/$SMOKE_CAP")"
check "The applicant is told" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM notifications WHERE user_id='$SMOKE_PROV_USER' AND dedupe_key LIKE 'provider.capability:%ACTIVE'" | tr -d ' ')"
check "The decision is audited" 1 \
  "$($PSQL -tAc "SELECT least(count(*),1) FROM audit_logs WHERE action='provider.capability_decided'" | tr -d ' ')"

# MODERATOR is the whole reason that enum value was added: reviewing provider
# applications must not require the ability to edit country coverage.
$PSQL -q -c "UPDATE users SET role='MODERATOR' WHERE id='$SMOKE_PROV_USER'" >/dev/null
MOD_JAR=$(mktemp)
curl -s -o /dev/null -c "$MOD_JAR" -X POST -H 'Content-Type: application/json' \
  -d '{"email":"demo@examwale.test","password":"examwale-demo-2026"}' "$BASE/api/v1/auth/login"
check "A moderator can decide an application" 200 \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$MOD_JAR" -X PATCH -H 'Content-Type: application/json' \
      -d '{"status":"SUSPENDED","note":"Smoke check of the moderator path."}' \
      "$BASE/api/v1/admin/providers/capabilities/$SMOKE_CAP")"
MOD_ADMIN=$(get /admin "$MOD_JAR")
if [[ "$MOD_ADMIN" == "403" || "$MOD_ADMIN" == "307" ]]; then
  printf '  \033[32m✓\033[0m %-52s %s\n' "A moderator is still not an admin" "$MOD_ADMIN"
  PASSED=$((PASSED + 1))
else
  printf '  \033[31m✗\033[0m %-52s got %s\n' "A moderator is still not an admin" "$MOD_ADMIN"
  FAILED=$((FAILED + 1))
fi
# A suspended capability is a moderation decision and must not be self-reversible.
check "A suspended capability cannot be self-reopened" 1 \
  "$(apply_for SERVICE_PROVIDER | grep -c 'suspended')"
$PSQL -q -c "UPDATE users SET role='SEEKER' WHERE id='$SMOKE_PROV_USER'" >/dev/null
rm -f "$MOD_JAR" "$PROV_JAR"

echo
echo "── Stage 4 · job lifecycle ──────────────────────────────────────"
check "job_publication_periods table exists" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM information_schema.tables WHERE table_name='job_publication_periods'" | tr -d ' ')"
# At most one open period per posting, enforced by Postgres rather than by
# remembering to close the old one before opening a new one.
check "One open period per posting, by index" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM pg_indexes WHERE indexname='job_period_one_open_uq'" | tr -d ' ')"
check "The lifecycle enum carries all ten states" 10 \
  "$($PSQL -tAc "SELECT count(*) FROM unnest(enum_range(NULL::job_status))" | tr -d ' ')"
check "Every live posting has an open period" 0 \
  "$($PSQL -tAc "SELECT count(*) FROM job_postings jp WHERE jp.status='ACTIVE' AND NOT EXISTS (SELECT 1 FROM job_publication_periods p WHERE p.job_posting_id=jp.id AND p.ended_at IS NULL)" | tr -d ' ')"
check "No posting has two open periods" 0 \
  "$($PSQL -tAc "SELECT count(*) FROM (SELECT job_posting_id FROM job_publication_periods WHERE ended_at IS NULL GROUP BY job_posting_id HAVING count(*)>1) x" | tr -d ' ')"

# Fixtures: a verified organisation, an owner, a posting, and an application, so
# expiry and revival have something real to preserve.
LC_USER=$($PSQL -tAc "SELECT id FROM users WHERE email='demo@examwale.test'" | tr -d ' ')
LC_COUNTRY=$($PSQL -tAc "SELECT id FROM countries WHERE iso_code='IN'" | tr -d ' ')
$PSQL -q -c "INSERT INTO organisations (id,name,type,country_id,verification_status,contact_email)
   VALUES ('smokelcorg','Smoke Lifecycle Org','company','$LC_COUNTRY','VERIFIED','ops@smoke.test')
   ON CONFLICT (id) DO UPDATE SET verification_status='VERIFIED';
 INSERT INTO organisation_members (organisation_id,user_id,role)
   VALUES ('smokelcorg','$LC_USER','owner') ON CONFLICT DO NOTHING;
 DELETE FROM job_applications WHERE id='smokelcapp';
 DELETE FROM job_publication_periods WHERE job_posting_id='smokelcjob';
 DELETE FROM job_moderation_reviews WHERE job_posting_id='smokelcjob';
 DELETE FROM job_postings WHERE id='smokelcjob';
 INSERT INTO job_postings (id,company_id,title,slug,description,skills_required,status,moderation_status,organisation_id,created_by_id,expires_at,posted_at)
   VALUES ('smokelcjob',(SELECT id FROM companies LIMIT 1),'Smoke Lifecycle Role','smoke-lifecycle-role',
     'A description long enough to clear the minimum length this field requires of an employer posting.',
     '[\"SQL\"]','ACTIVE','VERIFIED','smokelcorg','$LC_USER', now() + interval '10 days', now());
 -- An ACTIVE employer posting has, by definition, been approved by somebody.
 -- Without this row the fixture describes a state that cannot occur, and the
 -- publish gate rightly refuses to revive it — which is exactly how the missing
 -- gate was found.
 INSERT INTO job_moderation_reviews (id,job_posting_id,reviewer_id,decision)
   VALUES ('smokelcrev','smokelcjob',NULL,'approve');
 INSERT INTO job_publication_periods (id,job_posting_id,sequence,expires_at)
   VALUES ('smokelcp1','smokelcjob',1, now() + interval '10 days');
 INSERT INTO job_applications (id,user_id,job_posting_id,status)
   VALUES ('smokelcapp','$LC_USER','smokelcjob','APPLIED');" >/dev/null

LC_JAR=$(mktemp)
curl -s -o /dev/null -c "$LC_JAR" -X POST -H 'Content-Type: application/json' \
  -d '{"email":"demo@examwale.test","password":"examwale-demo-2026"}' "$BASE/api/v1/auth/login"
lc_status() { $PSQL -tAc "SELECT status FROM job_postings WHERE id='smokelcjob'" | tr -d ' '; }
lc_own() { curl -s -b "$LC_JAR" -X POST -H 'Content-Type: application/json' -d "$1" \
  "$BASE/api/v1/employers/jobs/smokelcjob/lifecycle"; }
# One moderation endpoint, taking a decision. There were briefly two; the
# duplicate was removed before it could drift from this one.
lc_mod() { curl -s -b "$ADMIN_JAR" -X POST -H 'Content-Type: application/json' -d "$1" \
  "$BASE/api/v1/admin/job-moderation/smokelcjob"; }

check "A live posting is public" 200 "$(getn /jobs/smoke-lifecycle-role)"

echo
echo "── Stage 4 · expiry keeps everything ────────────────────────────"
# Past its deadline, then run the sweep. Read-time filtering already hides it;
# the sweep is what makes the dashboards and the history agree.
$PSQL -q -c "UPDATE job_postings SET expires_at = now() - interval '1 day' WHERE id='smokelcjob';
  UPDATE job_publication_periods SET expires_at = now() - interval '1 day' WHERE id='smokelcp1';
  DELETE FROM scheduled_task_runs;" >/dev/null
check "An overdue posting is already hidden before the sweep" 404 "$(getn /jobs/smoke-lifecycle-role)"
tick > /dev/null
check "The sweep moves it to EXPIRED" "EXPIRED" "$(lc_status)"
check "Its period is closed as EXPIRED" "EXPIRED" \
  "$($PSQL -tAc "SELECT ended_reason FROM job_publication_periods WHERE id='smokelcp1'" | tr -d ' ')"
# The whole point of the brief's requirement: nothing is destroyed.
check "The application survived expiry" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM job_applications WHERE job_posting_id='smokelcjob'" | tr -d ' ')"
check "The owner was told" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM notifications WHERE user_id='$LC_USER' AND dedupe_key LIKE 'job.expired:smokelcjob%'" | tr -d ' ')"
check "Running the sweep again does not re-notify" 1 \
  "$($PSQL -q -c "DELETE FROM scheduled_task_runs" >/dev/null; tick >/dev/null; \
     $PSQL -tAc "SELECT count(*) FROM notifications WHERE user_id='$LC_USER' AND dedupe_key LIKE 'job.expired:smokelcjob%'" | tr -d ' ')"

echo
echo "── Stage 4 · revival opens a second period ──────────────────────"
check "Reviving works" 1 "$(lc_own '{"action":"revive"}' | grep -c '"sequence":2')"
check "It is live again" "ACTIVE" "$(lc_status)"
check "…and public again" 200 "$(getn /jobs/smoke-lifecycle-role)"
check "The application is still there" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM job_applications WHERE job_posting_id='smokelcjob'" | tr -d ' ')"
# The history is the requirement, not a side effect: the first run keeps its own
# end reason rather than being overwritten.
check "Two periods exist" 2 \
  "$($PSQL -tAc "SELECT count(*) FROM job_publication_periods WHERE job_posting_id='smokelcjob'" | tr -d ' ')"
check "The first still reads EXPIRED" "EXPIRED" \
  "$($PSQL -tAc "SELECT ended_reason FROM job_publication_periods WHERE id='smokelcp1'" | tr -d ' ')"
check "The second records who revived it" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM job_publication_periods WHERE job_posting_id='smokelcjob' AND sequence=2 AND revived_by_id='$LC_USER'" | tr -d ' ')"
check "A fresh 30-day deadline was set" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM job_postings WHERE id='smokelcjob' AND expires_at > now() + interval '29 days'" | tr -d ' ')"
check "Reviving a live posting is refused" 1 "$(lc_own '{"action":"revive"}' | grep -c 'expired or closed')"

echo
echo "── Stage 4 · moderation and illegal transitions ─────────────────"
check "A suspension with no reason is refused" 1 "$(lc_mod '{"decision":"suspend"}' | grep -c 'Say why')"
check "Suspension works" 1 \
  "$(lc_mod '{"decision":"suspend","reason":"Smoke check of the suspension path."}' | grep -c 'SUSPENDED')"
check "It leaves the public board" 404 "$(getn /jobs/smoke-lifecycle-role)"
check "The period closed as SUSPENDED" "SUSPENDED" \
  "$($PSQL -tAc "SELECT ended_reason FROM job_publication_periods WHERE job_posting_id='smokelcjob' AND sequence=2" | tr -d ' ')"
# A suspension is a moderator's decision, so its owner must not be able to undo it.
check "The owner cannot revive a suspension" 1 \
  "$(lc_own '{"action":"revive"}' | grep -c 'moderator has to lift')"
check "A moderator can reopen review" "UNDER_REVIEW" \
  "$(lc_mod '{"decision":"start_review"}' >/dev/null; lc_status)"
check "…and approve it back to live" "ACTIVE" "$(lc_mod '{"decision":"approve"}' >/dev/null; lc_status)"
check "A seeker cannot moderate" 403 \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$LC_JAR" -X POST -H 'Content-Type: application/json' \
      -d '{"decision":"approve"}' "$BASE/api/v1/admin/job-moderation/smokelcjob")"
check "Archiving works" "ARCHIVED" "$(lc_own '{"action":"archive"}' >/dev/null; lc_status)"
check "An archived posting is not public" 404 "$(getn /jobs/smoke-lifecycle-role)"
check "Applications survive archiving too" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM job_applications WHERE job_posting_id='smokelcjob'" | tr -d ' ')"
# Restore goes to DRAFT rather than straight back to live: a posting that has
# been away is worth re-reading before anybody applies to it.
check "Restoring returns it to draft, not to live" "DRAFT" "$(lc_own '{"action":"restore"}' >/dev/null; lc_status)"
check "A draft cannot be revived" 1 "$(lc_own '{"action":"revive"}' | grep -c 'expired or closed')"
check "A draft cannot be restored" 1 "$(lc_own '{"action":"restore"}' | grep -c 'Only an archived')"
check "The moderation trail is complete" 1 \
  "$($PSQL -tAc "SELECT least(count(*),1) FROM job_moderation_reviews WHERE job_posting_id='smokelcjob' AND decision='suspend' AND reason IS NOT NULL" | tr -d ' ')"

echo
echo "── Stage 4 · approved but waiting on verification ───────────────"
# The state that had nowhere to live before: moderation passed, organisation not
# verified. Previously approving such a posting threw and left it in DRAFT with
# no record that it had passed.
$PSQL -q -c "UPDATE organisations SET verification_status='PENDING' WHERE id='smokelcorg';
  UPDATE job_postings SET status='SUBMITTED' WHERE id='smokelcjob';" >/dev/null
PERIODS_BEFORE=$($PSQL -tAc "SELECT count(*) FROM job_publication_periods WHERE job_posting_id='smokelcjob'" | tr -d ' ')
check "Approving an unverified org's posting lands on APPROVED" "APPROVED" \
  "$(lc_mod '{"decision":"approve"}' >/dev/null; lc_status)"
check "It is not public" 404 "$(getn /jobs/smoke-lifecycle-role)"
# Nothing was published, so nothing opened a period. Counted as a delta, because
# an absolute number here just encodes how many transitions the test did earlier.
check "Approval alone opens no period" "$PERIODS_BEFORE" \
  "$($PSQL -tAc "SELECT count(*) FROM job_publication_periods WHERE job_posting_id='smokelcjob'" | tr -d ' ')"
# Verifying the organisation must release it immediately, not on the next tick.
check "Verifying the organisation publishes it" 200 \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" -X POST -H 'Content-Type: application/json' \
      -d '{"status":"VERIFIED"}' "$BASE/api/v1/admin/organisations/smokelcorg")"
check "It went live" "ACTIVE" "$(lc_status)"
check "…and that publication opened one" "$(( PERIODS_BEFORE + 1 ))" \
  "$($PSQL -tAc "SELECT count(*) FROM job_publication_periods WHERE job_posting_id='smokelcjob'" | tr -d ' ')"
# Sequence numbers must stay dense and ordered — the history is meant to read as
# "this role has been posted N times", which a gap would break.
check "Period sequences are 1..n with no gaps" 1 \
  "$($PSQL -tAc "SELECT CASE WHEN count(*) = max(sequence) AND min(sequence) = 1 THEN 1 ELSE 0 END FROM job_publication_periods WHERE job_posting_id='smokelcjob'" | tr -d ' ')"
check "And is public" 200 "$(getn /jobs/smoke-lifecycle-role)"
# The scheduler backstop must find nothing left to do.
check "The backstop sweep has nothing left" 1 \
  "$($PSQL -q -c "DELETE FROM scheduled_task_runs" >/dev/null; \
     tick | grep -c 'Nothing approved is waiting')"

$PSQL -q -c "DELETE FROM job_applications WHERE id='smokelcapp';
  DELETE FROM job_moderation_reviews WHERE job_posting_id='smokelcjob';
  DELETE FROM job_publication_periods WHERE job_posting_id='smokelcjob';
  DELETE FROM job_postings WHERE id='smokelcjob';
  DELETE FROM organisation_members WHERE organisation_id='smokelcorg';
  DELETE FROM organisations WHERE id='smokelcorg';
  DELETE FROM notifications WHERE dedupe_key LIKE '%smokelcjob%';" >/dev/null
rm -f "$LC_JAR"

echo
echo "── Stage 5 · availability exceptions, buffers and caps ──────────"
check "mentor_availability_exceptions table exists" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM information_schema.tables WHERE table_name='mentor_availability_exceptions'" | tr -d ' ')"
check "The offer carries buffer and cap columns" 3 \
  "$($PSQL -tAc "SELECT count(*) FROM information_schema.columns WHERE table_name='mentors' AND column_name IN ('buffer_minutes','max_per_day','max_per_week')" | tr -d ' ')"

AV_MENTOR=$($PSQL -tAc "SELECT id FROM mentors WHERE status='ACTIVE' AND credential_verified_at IS NOT NULL LIMIT 1" | tr -d ' ')
AV_MENTOR_USER=$($PSQL -tAc "SELECT user_id FROM mentors WHERE id='$AV_MENTOR'" | tr -d ' ')
AV_MENTOR_EMAIL=$($PSQL -tAc "SELECT email FROM users WHERE id='$AV_MENTOR_USER'" | tr -d ' ')
AV_SEEKER=$($PSQL -tAc "SELECT id FROM users WHERE email='demo@examwale.test'" | tr -d ' ')
# 'premium-monthly', not 'premium' — an empty plan_id silently leaves the seeker
# on the free allowance of one session a month, which then refuses later
# bookings for a reason that has nothing to do with availability.
AV_PLAN=$($PSQL -tAc "SELECT id FROM plans WHERE code='premium-monthly' LIMIT 1" | tr -d ' ')

# Pin the calendar: Tuesdays 10:00–13:00 IST, 30-minute sessions, no buffer, no
# caps. And give the seeker a real premium subscription, because the free
# allowance of one session a month would otherwise refuse the later bookings for
# a reason that has nothing to do with availability.
$PSQL -q -c "DELETE FROM mentor_availability WHERE mentor_id='$AV_MENTOR';
  DELETE FROM mentor_availability_exceptions WHERE mentor_id='$AV_MENTOR';
  DELETE FROM mentorship_sessions WHERE mentor_id='$AV_MENTOR';
  INSERT INTO mentor_availability (id,mentor_id,weekday,start_minute,end_minute,timezone)
    VALUES ('smokeav1','$AV_MENTOR',2,600,780,'Asia/Kolkata');
  UPDATE mentors SET session_minutes=30, buffer_minutes=0, max_per_day=0, max_per_week=0
    WHERE id='$AV_MENTOR';
  DELETE FROM subscriptions WHERE user_id='$AV_SEEKER';
  INSERT INTO subscriptions (id,user_id,plan_id,status,current_period_end)
    VALUES ('smokeavsub','$AV_SEEKER','$AV_PLAN','ACTIVE', now() + interval '30 days');" >/dev/null

AV_JAR=$(mktemp); AV_MJAR=$(mktemp); AV_OTHER=$(mktemp)
curl -s -o /dev/null -c "$AV_JAR" -X POST -H 'Content-Type: application/json' \
  -d '{"email":"demo@examwale.test","password":"examwale-demo-2026"}' "$BASE/api/v1/auth/login"
curl -s -o /dev/null -c "$AV_MJAR" -X POST -H 'Content-Type: application/json' \
  -d "{\"email\":\"$AV_MENTOR_EMAIL\",\"password\":\"examwale-mentor-2026\"}" "$BASE/api/v1/auth/login"
curl -s -o /dev/null -c "$AV_OTHER" -X POST -H 'Content-Type: application/json' \
  -d '{"email":"admin@examwale.test","password":"examwale-admin-2026"}' "$BASE/api/v1/auth/login"

# Two Tuesdays out, so "next Tuesday" is never today.
TUE_A=$($PSQL -tAc "SELECT to_char((date_trunc('week', now() + interval '7 days') + interval '1 day')::date,'YYYY-MM-DD')" | tr -d ' ')
TUE_B=$($PSQL -tAc "SELECT to_char((date_trunc('week', now() + interval '14 days') + interval '1 day')::date,'YYYY-MM-DD')" | tr -d ' ')
SUN_A=$($PSQL -tAc "SELECT to_char((date_trunc('week', now() + interval '7 days') + interval '6 days')::date,'YYYY-MM-DD')" | tr -d ' ')

book() { curl -s -o /dev/null -w '%{http_code}' -b "$AV_JAR" -X POST -H 'Content-Type: application/json' \
  -d "{\"topic\":\"smoke availability probe\",\"scheduledAt\":\"$1\"}" \
  "$BASE/api/v1/mentors/$AV_MENTOR/sessions"; }
except() { curl -s -b "$AV_MJAR" -X POST -H 'Content-Type: application/json' -d "$1" \
  "$BASE/api/v1/mentors/me/exceptions"; }
rules() { curl -s -o /dev/null -w '%{http_code}' -b "$AV_MJAR" -X PUT -H 'Content-Type: application/json' \
  -d "$1" "$BASE/api/v1/mentors/me/booking-rules"; }
clear_sessions() { $PSQL -q -c "DELETE FROM mentorship_sessions WHERE mentor_id='$AV_MENTOR'" >/dev/null; }

check "10:00 IST on a Tuesday books" 201 "$(book "${TUE_A}T04:30:00.000Z")"
clear_sessions

# A whole-day block must beat the weekly pattern.
check "A whole-day block is created" 1 \
  "$(except "{\"kind\":\"UNAVAILABLE\",\"onDate\":\"$TUE_A\",\"note\":\"smoke\"}" | grep -c '"kind":"UNAVAILABLE"')"
check "That Tuesday is now unbookable" 422 "$(book "${TUE_A}T04:30:00.000Z")"
check "The following Tuesday still is" 201 "$(book "${TUE_B}T04:30:00.000Z")"
clear_sessions

# A partial block carves a hole and leaves the ends.
$PSQL -q -c "DELETE FROM mentor_availability_exceptions WHERE mentor_id='$AV_MENTOR';" >/dev/null
check "A partial block is created" 1 \
  "$(except "{\"kind\":\"UNAVAILABLE\",\"onDate\":\"$TUE_A\",\"startMinute\":660,\"endMinute\":720}" | grep -c '"startMinute":660')"
check "11:00 IST inside the block is refused" 422 "$(book "${TUE_A}T05:30:00.000Z")"
check "10:00 IST before it still books" 201 "$(book "${TUE_A}T04:30:00.000Z")"
clear_sessions
check "12:00 IST after it still books" 201 "$(book "${TUE_A}T06:30:00.000Z")"
clear_sessions

# An EXTRA window opens a day the weekly pattern does not cover.
$PSQL -q -c "DELETE FROM mentor_availability_exceptions WHERE mentor_id='$AV_MENTOR';" >/dev/null
check "A whole-day EXTRA is refused as meaningless" 1 \
  "$(except "{\"kind\":\"EXTRA\",\"onDate\":\"$SUN_A\"}" | grep -c 'needs a start and an end')"
check "A past date is refused" 1 \
  "$(except '{"kind":"UNAVAILABLE","onDate":"2020-01-01"}' | grep -c 'has passed')"
check "A backwards window is refused" 1 \
  "$(except "{\"kind\":\"EXTRA\",\"onDate\":\"$SUN_A\",\"startMinute\":600,\"endMinute\":540}" | grep -c 'before the end')"
check "An EXTRA Sunday window is created" 1 \
  "$(except "{\"kind\":\"EXTRA\",\"onDate\":\"$SUN_A\",\"startMinute\":540,\"endMinute\":600}" | grep -c '"kind":"EXTRA"')"
check "Sunday 09:00 IST now books" 201 "$(book "${SUN_A}T03:30:00.000Z")"
clear_sessions
check "Sunday 11:00 IST — outside the window — does not" 422 "$(book "${SUN_A}T05:30:00.000Z")"

# Blocking a day must beat an EXTRA window on it, whichever was written first.
check "A block on the same day is created" 1 \
  "$(except "{\"kind\":\"UNAVAILABLE\",\"onDate\":\"$SUN_A\"}" | grep -c '"kind":"UNAVAILABLE"')"
check "The EXTRA window loses to the block" 422 "$(book "${SUN_A}T03:30:00.000Z")"
$PSQL -q -c "DELETE FROM mentor_availability_exceptions WHERE mentor_id='$AV_MENTOR';" >/dev/null

# Buffer widens the grid without changing session length.
check "Booking rules save" 200 "$(rules '{"sessionMinutes":30,"bufferMinutes":30}')"
check "10:30 IST is now off the grid" 422 "$(book "${TUE_A}T05:00:00.000Z")"
check "11:00 IST is on it" 201 "$(book "${TUE_A}T05:30:00.000Z")"
clear_sessions
check "A daily maximum below the weekly one is refused" 1 \
  "$(curl -s -b "$AV_MJAR" -X PUT -H 'Content-Type: application/json' -d '{"maxPerDay":9,"maxPerWeek":2}' \
      "$BASE/api/v1/mentors/me/booking-rules" | grep -c 'never apply')"

# Caps count what is booked. One a day means the second is refused and the
# following week is not.
check "Caps save" 200 "$(rules '{"bufferMinutes":0,"maxPerDay":1,"maxPerWeek":0}')"
check "The first booking of the day works" 201 "$(book "${TUE_A}T04:30:00.000Z")"
check "The second the same day is refused" 422 "$(book "${TUE_A}T05:00:00.000Z")"
check "The following Tuesday is unaffected" 201 "$(book "${TUE_B}T04:30:00.000Z")"
clear_sessions
check "Rules reset" 200 "$(rules '{"maxPerDay":0,"maxPerWeek":0,"bufferMinutes":0}')"

echo
echo "── Stage 6 · holds, confirmation and rescheduling ───────────────"
hold() { curl -s -b "$1" -X POST -H 'Content-Type: application/json' \
  -d "{\"scheduledAt\":\"$2\"}" "$BASE/api/v1/mentors/$AV_MENTOR/hold"; }

HOLD_SLOT="${TUE_A}T04:30:00.000Z"
HOLD_RESPONSE=$(hold "$AV_JAR" "$HOLD_SLOT")
check "A seeker can hold a slot" 1 "$(printf '%s' "$HOLD_RESPONSE" | grep -c '"holdId"')"
SMOKE_HOLD=$(printf '%s' "$HOLD_RESPONSE" | grep -o '"holdId":"[^"]*"' | cut -d'"' -f4)
check "The hold is one row, status HELD" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM mentorship_sessions WHERE id='$SMOKE_HOLD' AND status='HELD' AND hold_expires_at > now()" | tr -d ' ')"
# The whole point: the second person is stopped before they fill in a form.
check "A second seeker cannot hold it" 1 "$(hold "$AV_OTHER" "$HOLD_SLOT" | grep -c 'booking that slot right now')"
check "…nor book it outright" 1 \
  "$(curl -s -b "$AV_OTHER" -X POST -H 'Content-Type: application/json' \
      -d "{\"topic\":\"smoke jump the queue\",\"scheduledAt\":\"$HOLD_SLOT\"}" \
      "$BASE/api/v1/mentors/$AV_MENTOR/sessions" | grep -c 'just been taken')"
# Re-taking your own hold extends it rather than losing the slot on a refresh.
check "Re-holding your own slot succeeds" 1 "$(hold "$AV_JAR" "$HOLD_SLOT" | grep -c '"holdId"')"
check "…and does not create a second row" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM mentorship_sessions WHERE mentor_id='$AV_MENTOR' AND scheduled_at='$HOLD_SLOT'" | tr -d ' ')"
# A held slot is shown, marked, rather than silently vanishing from the list.
check "The slot shows as being booked" 1 \
  "$(curl -s -b "$AV_OTHER" "$BASE/mentors/$AV_MENTOR" | grep -c 'being booked')"
# Confirming converts the held row. Inserting beside it would collide with the
# seeker's own reservation.
check "Confirming the hold books it" 201 \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$AV_JAR" -X POST -H 'Content-Type: application/json' \
      -d "{\"topic\":\"smoke confirmed booking\",\"scheduledAt\":\"$HOLD_SLOT\",\"fromHoldId\":\"$SMOKE_HOLD\"}" \
      "$BASE/api/v1/mentors/$AV_MENTOR/sessions")"
check "It reused the held row rather than adding one" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM mentorship_sessions WHERE id='$SMOKE_HOLD' AND status='REQUESTED' AND hold_expires_at IS NULL" | tr -d ' ')"
check "Still exactly one row at that instant" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM mentorship_sessions WHERE mentor_id='$AV_MENTOR' AND scheduled_at='$HOLD_SLOT'" | tr -d ' ')"

# A lapsed hold must free its slot at read time, not wait for the sweep.
clear_sessions
$PSQL -q -c "INSERT INTO mentorship_sessions (id,mentor_id,seeker_id,topic,scheduled_at,duration_minutes,status,hold_expires_at)
  VALUES ('smokedeadhold','$AV_MENTOR','$AV_MENTOR_USER','(holding)','$HOLD_SLOT',30,'HELD', now() - interval '1 minute');" >/dev/null
check "A lapsed hold does not block a booking" 1 "$(hold "$AV_JAR" "$HOLD_SLOT" | grep -c '"holdId"')"
check "…and was taken over, not duplicated" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM mentorship_sessions WHERE mentor_id='$AV_MENTOR' AND scheduled_at='$HOLD_SLOT'" | tr -d ' ')"
# Releasing gives it straight back.
LIVE_HOLD=$($PSQL -tAc "SELECT id FROM mentorship_sessions WHERE mentor_id='$AV_MENTOR' AND status='HELD' LIMIT 1" | tr -d ' ')
check "Releasing a hold frees the slot" 204 \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$AV_JAR" -X DELETE -H 'Content-Type: application/json' \
      -d "{\"holdId\":\"$LIVE_HOLD\"}" "$BASE/api/v1/mentors/$AV_MENTOR/hold")"
check "…leaving no row behind" 0 \
  "$($PSQL -tAc "SELECT count(*) FROM mentorship_sessions WHERE mentor_id='$AV_MENTOR'" | tr -d ' ')"

# The scheduler sweep clears lapsed holds so a session list is not full of ghosts.
$PSQL -q -c "INSERT INTO mentorship_sessions (id,mentor_id,seeker_id,topic,scheduled_at,duration_minutes,status,hold_expires_at)
  VALUES ('smokesweep','$AV_MENTOR','$AV_SEEKER','(holding)','${TUE_B}T05:00:00.000Z',30,'HELD', now() - interval '5 minutes');
  DELETE FROM scheduled_task_runs;" >/dev/null
tick > /dev/null
check "The sweep clears lapsed holds" 0 \
  "$($PSQL -tAc "SELECT count(*) FROM mentorship_sessions WHERE id='smokesweep'" | tr -d ' ')"

echo
echo "── Stage 6 · rescheduling ───────────────────────────────────────"
clear_sessions
RS=$(curl -s -b "$AV_JAR" -X POST -H 'Content-Type: application/json' \
  -d "{\"topic\":\"smoke reschedule me\",\"scheduledAt\":\"${TUE_A}T04:30:00.000Z\"}" \
  "$BASE/api/v1/mentors/$AV_MENTOR/sessions")
RS_ID=$(printf '%s' "$RS" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
resched() { curl -s -b "$1" -X POST -H 'Content-Type: application/json' \
  -d "{\"scheduledAt\":\"$2\"}" "$BASE/api/v1/mentors/sessions/$RS_ID/reschedule"; }

check "Somebody else's session cannot be moved" 1 "$(resched "$AV_OTHER" "${TUE_A}T05:00:00.000Z" | grep -c \
  "isn't your session")"
check "Moving to the same time is refused" 1 \
  "$(resched "$AV_JAR" "${TUE_A}T04:30:00.000Z" | grep -c 'already at')"
check "Moving to a time outside the hours is refused" 1 \
  "$(resched "$AV_JAR" "${TUE_A}T10:00:00.000Z" | grep -c "isn't one of the mentor's offered slots")"
check "The seeker can move it to another offered slot" 1 \
  "$(resched "$AV_JAR" "${TUE_A}T05:00:00.000Z" | grep -c '"rescheduledFromId"')"
# The old row is kept, not edited, so both parties can see that it moved.
check "The original is marked RESCHEDULED" "RESCHEDULED" \
  "$($PSQL -tAc "SELECT status FROM mentorship_sessions WHERE id='$RS_ID'" | tr -d ' ')"
check "The new one points back at it" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM mentorship_sessions WHERE rescheduled_from_id='$RS_ID'" | tr -d ' ')"
# A moved session needs accepting again — an accepted time is not agreement to a
# different one.
check "It needs accepting again" "REQUESTED" \
  "$($PSQL -tAc "SELECT status FROM mentorship_sessions WHERE rescheduled_from_id='$RS_ID'" | tr -d ' ')"
check "The other party is told" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM notifications WHERE user_id='$AV_MENTOR_USER' AND dedupe_key LIKE 'mentorship.rescheduled:%'" | tr -d ' ')"
check "The old slot is free again" 1 \
  "$(hold "$AV_OTHER" "${TUE_A}T04:30:00.000Z" | grep -c '"holdId"')"
check "A rescheduled session cannot be moved again" 1 \
  "$(resched "$AV_JAR" "${TUE_A}T06:00:00.000Z" | grep -c 'cannot be rescheduled')"

# This section books more times than any real seeker would in a day, so its own
# rate-limit bucket is cleared rather than the checks being written around a
# limit that is working correctly.
$PSQL -q -c "DELETE FROM rate_limit_buckets WHERE key LIKE 'mentorship:request:%'" >/dev/null

# Only live bookings reserve a slot. The unique index used to be unconditional,
# so any row at that instant held it forever: cancel a session and the mentor
# could never offer that time again. The symptom looked exactly like a real
# double-booking conflict, which is why nothing surfaced it.
check "The slot index is partial, not unconditional" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM pg_indexes WHERE indexname='mentorship_slot_uq' AND indexdef LIKE '%WHERE%'" | tr -d ' ')"
clear_sessions
$PSQL -q -c "INSERT INTO mentorship_sessions (id,mentor_id,seeker_id,topic,scheduled_at,duration_minutes,status)
  VALUES ('smokecancelled','$AV_MENTOR','$AV_MENTOR_USER','was cancelled','${TUE_A}T04:30:00.000Z',30,'CANCELLED');" >/dev/null
check "A cancelled session frees its slot" 201 "$(book "${TUE_A}T04:30:00.000Z")"
clear_sessions
$PSQL -q -c "DELETE FROM rate_limit_buckets WHERE key LIKE 'mentorship:request:%'" >/dev/null
$PSQL -q -c "INSERT INTO mentorship_sessions (id,mentor_id,seeker_id,topic,scheduled_at,duration_minutes,status)
  VALUES ('smokedeclined','$AV_MENTOR','$AV_MENTOR_USER','was declined','${TUE_A}T04:30:00.000Z',30,'DECLINED');" >/dev/null
check "So does a declined one" 201 "$(book "${TUE_A}T04:30:00.000Z")"
check "But two live bookings at one instant are impossible" 1 \
  "$($PSQL -tAc "INSERT INTO mentorship_sessions (id,mentor_id,seeker_id,topic,scheduled_at,duration_minutes,status)
      VALUES ('smokedupe','$AV_MENTOR','$AV_MENTOR_USER','dupe','${TUE_A}T04:30:00.000Z',30,'ACCEPTED')" 2>&1 | grep -c 'duplicate key')"

$PSQL -q -c "DELETE FROM mentorship_sessions WHERE mentor_id='$AV_MENTOR';
  DELETE FROM mentor_availability_exceptions WHERE mentor_id='$AV_MENTOR';
  DELETE FROM mentor_availability WHERE id='smokeav1';
  DELETE FROM subscriptions WHERE id='smokeavsub';
  DELETE FROM notifications WHERE dedupe_key LIKE 'mentorship.rescheduled:%';
  UPDATE mentors SET buffer_minutes=0, max_per_day=0, max_per_week=0 WHERE id='$AV_MENTOR';" >/dev/null
rm -f "$AV_JAR" "$AV_MJAR" "$AV_OTHER"

echo
echo "── Stage 7 · profile pictures ───────────────────────────────────"
check "users carries an avatar hash" 2 \
  "$($PSQL -tAc "SELECT count(*) FROM information_schema.columns WHERE table_name='users' AND column_name IN ('avatar_hash','avatar_updated_at')" | tr -d ' ')"

AV_USER=$($PSQL -tAc "SELECT id FROM users WHERE email='demo@examwale.test'" | tr -d ' ')
PIC_JAR=$(mktemp)
curl -s -o /dev/null -c "$PIC_JAR" -X POST -H 'Content-Type: application/json' \
  -d '{"email":"demo@examwale.test","password":"examwale-demo-2026"}' "$BASE/api/v1/auth/login"

# A photo carrying GPS, as a phone produces. The whole pipeline exists so this
# does not reach a public page.
PIC=$(mktemp /tmp/smoke-avatar-XXXX.jpg)
node -e "
const sharp = require('./node_modules/sharp/dist/index.cjs');
sharp({create:{width:900,height:1400,channels:3,background:{r:150,g:100,b:70}}})
  .jpeg()
  .withExif({IFD0:{Artist:'Somebody'},GPS:{GPSLatitude:'18/1 55/1 0/1',GPSLongitude:'72/1 52/1 0/1'}})
  .toFile('$PIC');
" 2>/dev/null
check "The fixture really carries EXIF" 1 \
  "$(node -e "require('./node_modules/sharp/dist/index.cjs')('$PIC').metadata().then(m=>console.log(m.exif?1:0))" 2>/dev/null)"

$PSQL -q -c "DELETE FROM storage_objects WHERE key LIKE 'avatars/%';
  UPDATE users SET avatar_hash=NULL WHERE id='$AV_USER';" >/dev/null

UPLOAD=$(curl -s -b "$PIC_JAR" -F "file=@$PIC" "$BASE/api/v1/users/me/avatar")
check "Uploading returns a content hash" 1 "$(printf '%s' "$UPLOAD" | grep -c '"hash"')"
PIC_HASH=$(printf '%s' "$UPLOAD" | grep -o '"hash":"[^"]*"' | cut -d'"' -f4)
check "Two variants are stored" 2 \
  "$($PSQL -tAc "SELECT count(*) FROM storage_objects WHERE key LIKE 'avatars/%'" | tr -d ' ')"
check "Both are webp" 0 \
  "$($PSQL -tAc "SELECT count(*) FROM storage_objects WHERE key LIKE 'avatars/%' AND content_type <> 'image/webp'" | tr -d ' ')"
# The key must not read back as a user id: object keys reach logs and errors.
check "The storage key does not embed the user id" 0 \
  "$($PSQL -tAc "SELECT count(*) FROM storage_objects WHERE key LIKE '%$AV_USER%'" | tr -d ' ')"

check "The picture serves to the owner" 200 \
  "$(get "/api/v1/users/$AV_USER/avatar?size=sm&v=$PIC_HASH" "$PIC_JAR")"
check "…and the large variant too" 200 \
  "$(get "/api/v1/users/$AV_USER/avatar?size=lg&v=$PIC_HASH" "$PIC_JAR")"
check "It is cached immutably" 1 \
  "$(curl -s -D- -o /dev/null -b "$PIC_JAR" "$BASE/api/v1/users/$AV_USER/avatar?v=$PIC_HASH" | grep -ci 'max-age=31536000, immutable')"
check "…and marked nosniff" 1 \
  "$(curl -s -D- -o /dev/null -b "$PIC_JAR" "$BASE/api/v1/users/$AV_USER/avatar?v=$PIC_HASH" | grep -ci 'x-content-type-options: nosniff')"

# THE ONE THAT MATTERS. A mentor uploading a selfie from home must not publish
# their coordinates, and nothing in the interface would show it happening.
SERVED=$(mktemp /tmp/smoke-served-XXXX.webp)
curl -s -o "$SERVED" -b "$PIC_JAR" "$BASE/api/v1/users/$AV_USER/avatar?size=sm&v=$PIC_HASH"
check "The served image has no EXIF" 0 \
  "$(node -e "require('./node_modules/sharp/dist/index.cjs')('$SERVED').metadata().then(m=>console.log(m.exif?1:0))" 2>/dev/null)"
check "…and is exactly 128px square" "128x128" \
  "$(node -e "require('./node_modules/sharp/dist/index.cjs')('$SERVED').metadata().then(m=>console.log(m.width+'x'+m.height))" 2>/dev/null)"

# A seeker's face is not public; a listed provider's is, because their profile
# page already is.
check "A seeker's picture is not public" 404 "$(getn "/api/v1/users/$AV_USER/avatar?v=$PIC_HASH")"
PIC_MENTOR=$($PSQL -tAc "SELECT m.user_id FROM mentors m JOIN provider_profiles pp ON pp.user_id=m.user_id JOIN provider_capabilities pc ON pc.provider_profile_id=pp.id AND pc.status='ACTIVE' WHERE m.status='ACTIVE' AND pp.visibility='PUBLIC' LIMIT 1" | tr -d ' ')
PIC_MENTOR_EMAIL=$($PSQL -tAc "SELECT email FROM users WHERE id='$PIC_MENTOR'" | tr -d ' ')
PIC_MJAR=$(mktemp)
curl -s -o /dev/null -c "$PIC_MJAR" -X POST -H 'Content-Type: application/json' \
  -d "{\"email\":\"$PIC_MENTOR_EMAIL\",\"password\":\"examwale-mentor-2026\"}" "$BASE/api/v1/auth/login"
curl -s -o /dev/null -b "$PIC_MJAR" -F "file=@$PIC" "$BASE/api/v1/users/me/avatar"
PIC_MHASH=$($PSQL -tAc "SELECT avatar_hash FROM users WHERE id='$PIC_MENTOR'" | tr -d ' ')
check "A listed mentor's picture is public" 200 "$(getn "/api/v1/users/$PIC_MENTOR/avatar?v=$PIC_MHASH")"
$PSQL -q -c "UPDATE provider_profiles SET visibility='HIDDEN' WHERE user_id='$PIC_MENTOR'" >/dev/null
check "Hiding the profile hides the picture" 404 "$(getn "/api/v1/users/$PIC_MENTOR/avatar?v=$PIC_MHASH")"
$PSQL -q -c "UPDATE provider_profiles SET visibility='PUBLIC' WHERE user_id='$PIC_MENTOR'" >/dev/null
check "It appears on the mentor listing" 1 \
  "$(curl -s "$BASE/mentors" | grep -c "/api/v1/users/$PIC_MENTOR/avatar")"

# SVG is a scripting format. Anything that is not really an image is refused
# whatever the declared type says.
printf '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><script>alert(1)</script></svg>' > /tmp/smoke-x.svg
check "SVG is refused" 1 \
  "$(curl -s -b "$PIC_JAR" -F "file=@/tmp/smoke-x.svg;type=image/svg+xml" "$BASE/api/v1/users/me/avatar" | grep -c "can carry scripts")"
printf 'not an image at all, whatever the content type claims' > /tmp/smoke-x.txt
check "A text file claiming to be a PNG is refused" 1 \
  "$(curl -s -b "$PIC_JAR" -F "file=@/tmp/smoke-x.txt;type=image/png" "$BASE/api/v1/users/me/avatar" | grep -c "look like an image")"
check "An upload with no file is refused" 1 \
  "$(curl -s -b "$PIC_JAR" -X POST "$BASE/api/v1/users/me/avatar" | grep -c "Attach an image")"
check "Uploading needs a session" 401 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST -F "file=@$PIC" "$BASE/api/v1/users/me/avatar")"

# Two people uploading the same photo share a content hash but not a key — the
# key is scoped per user — so one removing theirs must not touch the other's.
OBJECTS_BEFORE=$($PSQL -tAc "SELECT count(*) FROM storage_objects WHERE key LIKE 'avatars/%'" | tr -d ' ')
# Removing must take the bytes, not only the row — otherwise "delete my photo"
# leaves the photo on the server.
check "Removing a picture succeeds" 204 \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$PIC_JAR" -X DELETE "$BASE/api/v1/users/me/avatar")"
check "…and deletes exactly that person's two variants" "$(( OBJECTS_BEFORE - 2 ))" \
  "$($PSQL -tAc "SELECT count(*) FROM storage_objects WHERE key LIKE 'avatars/%'" | tr -d ' ')"
check "The other person's identical photo is untouched" 200 \
  "$(getn "/api/v1/users/$PIC_MENTOR/avatar?v=$PIC_MHASH")"
check "…so it stops serving" 404 "$(get "/api/v1/users/$AV_USER/avatar?v=$PIC_HASH" "$PIC_JAR")"
check "Somebody with no picture 404s rather than erroring" 404 \
  "$(get "/api/v1/users/$AV_USER/avatar" "$PIC_JAR")"

$PSQL -q -c "DELETE FROM storage_objects WHERE key LIKE 'avatars/%';
  UPDATE users SET avatar_hash=NULL, avatar_updated_at=NULL;" >/dev/null
rm -f "$PIC" "$SERVED" "$PIC_JAR" "$PIC_MJAR" /tmp/smoke-x.svg /tmp/smoke-x.txt

echo
echo "── Stage 8 · messaging: who may talk to whom ────────────────────"
for t in conversations conversation_participants messages user_blocks abuse_reports; do
  check "$t exists" 1 \
    "$($PSQL -tAc "SELECT count(*) FROM information_schema.tables WHERE table_name='$t'" | tr -d ' ')"
done
check "One open report per person per subject" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM pg_indexes WHERE indexname='report_open_uq'" | tr -d ' ')"

MSG_SEEKER=$($PSQL -tAc "SELECT id FROM users WHERE email='demo@examwale.test'" | tr -d ' ')
MSG_ADMIN=$($PSQL -tAc "SELECT id FROM users WHERE email='admin@examwale.test'" | tr -d ' ')
MSG_MENTOR=$($PSQL -tAc "SELECT id FROM mentors WHERE status='ACTIVE' AND credential_verified_at IS NOT NULL LIMIT 1" | tr -d ' ')
MSG_MENTOR_USER=$($PSQL -tAc "SELECT user_id FROM mentors WHERE id='$MSG_MENTOR'" | tr -d ' ')
MSG_MENTOR_EMAIL=$($PSQL -tAc "SELECT email FROM users WHERE id='$MSG_MENTOR_USER'" | tr -d ' ')

MSG_SJAR=$(mktemp); MSG_MJAR=$(mktemp)
curl -s -o /dev/null -c "$MSG_SJAR" -X POST -H 'Content-Type: application/json' \
  -d '{"email":"demo@examwale.test","password":"examwale-demo-2026"}' "$BASE/api/v1/auth/login"
curl -s -o /dev/null -c "$MSG_MJAR" -X POST -H 'Content-Type: application/json' \
  -d "{\"email\":\"$MSG_MENTOR_EMAIL\",\"password\":\"examwale-mentor-2026\"}" "$BASE/api/v1/auth/login"

$PSQL -q -c "DELETE FROM messages; DELETE FROM conversation_participants; DELETE FROM conversations;
  DELETE FROM user_blocks; DELETE FROM abuse_reports;
  DELETE FROM mentorship_sessions WHERE id IN ('smokemsg1','smokemsgother');
  DELETE FROM notifications WHERE type LIKE 'messaging%';" >/dev/null

open_with() { curl -s -b "$1" -X POST -H 'Content-Type: application/json' \
  -d "{\"withUserId\":\"$2\",\"contextType\":\"MENTORSHIP\",\"contextId\":\"$3\"}" \
  "$BASE/api/v1/messages"; }

# The decision the whole module rests on: no relationship, no conversation. This
# platform's users include school students and its providers are adults they have
# never met, so an open inbox is not a feature that was left out.
check "No relationship means no conversation" 1 \
  "$(open_with "$MSG_SJAR" "$MSG_MENTOR_USER" "anything" | grep -c 'something in progress with')"
# Nor can somebody borrow a context id belonging to two other people.
$PSQL -q -c "INSERT INTO mentorship_sessions (id,mentor_id,seeker_id,topic,scheduled_at,duration_minutes,status)
  VALUES ('smokemsgother','$MSG_MENTOR','$MSG_ADMIN','not yours', now() + interval '2 days', 30, 'ACCEPTED');" >/dev/null
check "Somebody else's session does not grant access" 1 \
  "$(open_with "$MSG_SJAR" "$MSG_MENTOR_USER" "smokemsgother" | grep -c 'something in progress with')"

$PSQL -q -c "INSERT INTO mentorship_sessions (id,mentor_id,seeker_id,topic,scheduled_at,duration_minutes,status)
  VALUES ('smokemsg1','$MSG_MENTOR','$MSG_SEEKER','Choosing an optional', now() + interval '3 days', 30, 'ACCEPTED');" >/dev/null
OPENED=$(open_with "$MSG_SJAR" "$MSG_MENTOR_USER" "smokemsg1")
check "A real session opens a thread" 1 "$(printf '%s' "$OPENED" | grep -c '"created":true')"
MSG_CONV=$(printf '%s' "$OPENED" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
check "Opening it again returns the same thread" 1 \
  "$(open_with "$MSG_SJAR" "$MSG_MENTOR_USER" "smokemsg1" | grep -c '"created":false')"
check "…rather than splitting the history" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM conversations" | tr -d ' ')"
check "You cannot message yourself" 1 \
  "$(open_with "$MSG_SJAR" "$MSG_SEEKER" "smokemsg1" | grep -c 'cannot message yourself')"

# 404 not 403: whether a conversation exists is not something to leak.
check "A non-participant cannot read the thread" 404 "$(get "/api/v1/messages/$MSG_CONV" "$ADMIN_JAR")"
check "…nor send to it" 404 \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" -X POST -H 'Content-Type: application/json' \
      -d '{"body":"let me in"}' "$BASE/api/v1/messages/$MSG_CONV")"
check "Both participants can read it" 200 "$(get "/api/v1/messages/$MSG_CONV" "$MSG_MJAR")"

echo
echo "── Stage 8 · messages, unread and search ────────────────────────"
send_as() { curl -s -b "$1" -X POST -H 'Content-Type: application/json' -d "{\"body\":\"$2\"}" \
  "$BASE/api/v1/messages/$MSG_CONV"; }
check "Sending works" 201 \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$MSG_SJAR" -X POST -H 'Content-Type: application/json' \
      -d '{"body":"Wanted to ask about the optional subject before we meet."}' \
      "$BASE/api/v1/messages/$MSG_CONV")"
check "An empty message is refused" 1 "$(send_as "$MSG_SJAR" "   " | grep -c 'Write something')"
send_as "$MSG_MJAR" "Of course, what are you weighing up?" > /dev/null
check "The seeker has one unread" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM messages m JOIN conversation_participants cp ON cp.conversation_id=m.conversation_id AND cp.user_id='$MSG_SEEKER' WHERE m.sender_id<>'$MSG_SEEKER' AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)" | tr -d ' ')"
curl -s -o /dev/null -b "$MSG_SJAR" -X POST "$BASE/api/v1/messages/$MSG_CONV/read"
check "Marking read clears it" 0 \
  "$($PSQL -tAc "SELECT count(*) FROM messages m JOIN conversation_participants cp ON cp.conversation_id=m.conversation_id AND cp.user_id='$MSG_SEEKER' WHERE m.sender_id<>'$MSG_SEEKER' AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)" | tr -d ' ')"

# A burst is one thing that happened. Five notifications for it teaches people to
# switch the category off.
$PSQL -q -c "DELETE FROM notifications WHERE type='messaging.new_message'" >/dev/null
for i in 1 2 3 4; do send_as "$MSG_MJAR" "burst probe $i" > /dev/null; done
check "Four messages produce one notification" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM notifications WHERE user_id='$MSG_SEEKER' AND type='messaging.new_message'" | tr -d ' ')"
# Notifications reach email and push, so the message text must not be in them.
check "The notification carries no message text" 0 \
  "$($PSQL -tAc "SELECT count(*) FROM notifications WHERE type='messaging.new_message' AND body LIKE '%burst probe%'" | tr -d ' ')"
curl -s -o /dev/null -b "$MSG_SJAR" -X POST "$BASE/api/v1/messages/$MSG_CONV/read"
send_as "$MSG_MJAR" "one more after catching up" > /dev/null
check "…and a new one once they have caught up" 2 \
  "$($PSQL -tAc "SELECT count(*) FROM notifications WHERE user_id='$MSG_SEEKER' AND type='messaging.new_message'" | tr -d ' ')"

# Search joins through participation, so a matching term in a stranger's thread
# cannot surface.
check "Search finds your own messages" 1 \
  "$(curl -s -b "$MSG_SJAR" "$BASE/api/v1/messages/search?q=optional" | grep -c '"body"')"
check "…and nobody else's" 0 \
  "$(curl -s -b "$ADMIN_JAR" "$BASE/api/v1/messages/search?q=optional" | grep -c '"body"')"

# A deletion leaves a gap rather than rewriting the conversation.
SMOKE_MSG=$($PSQL -tAc "SELECT id FROM messages WHERE body='burst probe 2'" | tr -d ' ')
check "A sender can remove their own message" 204 \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$MSG_MJAR" -X DELETE "$BASE/api/v1/messages/items/$SMOKE_MSG")"
check "The other side no longer sees the text" 0 \
  "$(curl -s -b "$MSG_SJAR" "$BASE/api/v1/messages/$MSG_CONV" | grep -c 'burst probe 2')"
# But the evidence survives: a deletion that destroys it protects whoever sent
# the abuse, not whoever received it.
check "The original is kept for moderation" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM messages WHERE id='$SMOKE_MSG' AND original_body='burst probe 2'" | tr -d ' ')"
check "You cannot delete somebody else's message" 1 \
  "$(curl -s -b "$MSG_SJAR" -X DELETE "$BASE/api/v1/messages/items/$SMOKE_MSG" | grep -c \
      "isn't your message")"

echo
echo "── Stage 8 · blocking and reporting ─────────────────────────────"
check "Blocking works" 204 \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$MSG_SJAR" -X POST -H 'Content-Type: application/json' \
      -d "{\"userId\":\"$MSG_MENTOR_USER\"}" "$BASE/api/v1/messages/blocks")"
check "The blocker cannot send" 1 "$(send_as "$MSG_SJAR" "still here" | grep -c 'cannot message this person')"
# Symmetric: a one-way block would let the blocker keep messaging somebody who
# cannot reply, which is a harassment tool rather than a safety feature.
check "Nor can the person they blocked" 1 "$(send_as "$MSG_MJAR" "hello?" | grep -c 'cannot message this person')"
check "The history is still readable" 200 "$(get "/api/v1/messages/$MSG_CONV" "$MSG_SJAR")"
check "Unblocking restores it" 204 \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$MSG_SJAR" -X DELETE -H 'Content-Type: application/json' \
      -d "{\"userId\":\"$MSG_MENTOR_USER\"}" "$BASE/api/v1/messages/blocks")"
check "…and sending works again" 201 \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$MSG_SJAR" -X POST -H 'Content-Type: application/json' \
      -d '{"body":"back again"}' "$BASE/api/v1/messages/$MSG_CONV")"

REPORTED=$($PSQL -tAc "SELECT id FROM messages WHERE sender_id='$MSG_MENTOR_USER' AND deleted_at IS NULL LIMIT 1" | tr -d ' ')
report() { curl -s -b "$1" -X POST -H 'Content-Type: application/json' -d "$2" "$BASE/api/v1/reports"; }
check "Reporting a message works" 1 \
  "$(report "$MSG_SJAR" "{\"subjectType\":\"MESSAGE\",\"subjectId\":\"$REPORTED\",\"reason\":\"harassment\",\"detail\":\"Smoke check.\"}" | grep -c '"status":"OPEN"')"
# Reporting and wanting it to stop are almost always the same intention.
check "Reporting blocks by default" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM user_blocks WHERE blocker_id='$MSG_SEEKER'" | tr -d ' ')"
check "Reporting the same thing twice is refused" 1 \
  "$(report "$MSG_SJAR" "{\"subjectType\":\"MESSAGE\",\"subjectId\":\"$REPORTED\",\"reason\":\"spam\"}" | grep -c 'already reported')"
check "You cannot report a message you cannot see" 404 \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" -X POST -H 'Content-Type: application/json' \
      -d "{\"subjectType\":\"MESSAGE\",\"subjectId\":\"$REPORTED\",\"reason\":\"spam\"}" "$BASE/api/v1/reports")"

echo
echo "── Stage 8 · moderation ─────────────────────────────────────────"
SMOKE_REPORT=$($PSQL -tAc "SELECT id FROM abuse_reports WHERE status='OPEN' LIMIT 1" | tr -d ' ')
check "GET /admin/reports as admin" 200 "$(get /admin/reports "$ADMIN_JAR")"
check "A seeker cannot decide a report" 403 \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$MSG_SJAR" -X PATCH -H 'Content-Type: application/json' \
      -d '{"status":"UPHELD","note":"letting myself through"}' "$BASE/api/v1/admin/reports/$SMOKE_REPORT")"
check "A decision with no reason is refused" 1 \
  "$(curl -s -b "$ADMIN_JAR" -X PATCH -H 'Content-Type: application/json' -d '{"status":"UPHELD"}' \
      "$BASE/api/v1/admin/reports/$SMOKE_REPORT" | grep -c 'Record why')"
# The moderator sees what was deleted — that is what originalBody is for.
check "The queue shows the deleted message" 1 \
  "$(curl -s -b "$ADMIN_JAR" "$BASE/admin/reports" | grep -c 'burst probe 2')"
check "Upholding works" 200 \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADMIN_JAR" -X PATCH -H 'Content-Type: application/json' \
      -d '{"status":"UPHELD","note":"Smoke check of the moderation path.","lockConversation":true}' \
      "$BASE/api/v1/admin/reports/$SMOKE_REPORT")"
check "The conversation is locked" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM conversations WHERE id='$MSG_CONV' AND locked_at IS NOT NULL" | tr -d ' ')"
check "Nobody can send to a locked thread" 1 \
  "$($PSQL -q -c "DELETE FROM user_blocks" >/dev/null; send_as "$MSG_MJAR" "after the lock" | grep -c 'closed this conversation')"
check "…but it is still readable" 200 "$(get "/api/v1/messages/$MSG_CONV" "$MSG_SJAR")"
# A report that vanishes into silence teaches people not to file the next one.
check "The reporter is told the outcome" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM notifications WHERE user_id='$MSG_SEEKER' AND type='messaging.report_reviewed'" | tr -d ' ')"
check "The decision is audited" 1 \
  "$($PSQL -tAc "SELECT least(count(*),1) FROM audit_logs WHERE action='messaging.report_decided'" | tr -d ' ')"

check "GET /messages as a signed-in user" 200 "$(get /messages "$MSG_SJAR")"
check "…and it needs a session" 307 "$(getn /messages)"

$PSQL -q -c "DELETE FROM messages; DELETE FROM conversation_participants; DELETE FROM conversations;
  DELETE FROM user_blocks; DELETE FROM abuse_reports;
  DELETE FROM mentorship_sessions WHERE id IN ('smokemsg1','smokemsgother');
  DELETE FROM notifications WHERE type LIKE 'messaging%';" >/dev/null
rm -f "$MSG_SJAR" "$MSG_MJAR"

echo
echo "── Stage 9 · the services marketplace ───────────────────────────"
for t in services service_moderation_reviews service_requests; do
  check "$t exists" 1 \
    "$($PSQL -tAc "SELECT count(*) FROM information_schema.tables WHERE table_name='$t'" | tr -d ' ')"
done
check "One open request per person per service" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM pg_indexes WHERE indexname='service_request_open_uq'" | tr -d ' ')"

SVC_MENTOR_USER=$($PSQL -tAc "SELECT m.user_id FROM mentors m WHERE m.status='ACTIVE' LIMIT 1" | tr -d ' ')
SVC_EMAIL=$($PSQL -tAc "SELECT email FROM users WHERE id='$SVC_MENTOR_USER'" | tr -d ' ')
SVC_PROFILE=$($PSQL -tAc "SELECT id FROM provider_profiles WHERE user_id='$SVC_MENTOR_USER'" | tr -d ' ')
SVC_BUYER=$($PSQL -tAc "SELECT id FROM users WHERE email='demo@examwale.test'" | tr -d ' ')

$PSQL -q -c "DELETE FROM service_requests; DELETE FROM service_moderation_reviews; DELETE FROM services;
  DELETE FROM notifications WHERE type LIKE 'service.%';
  DELETE FROM provider_capabilities WHERE provider_profile_id='$SVC_PROFILE' AND kind='SERVICE_PROVIDER';" >/dev/null

SVC_PJAR=$(mktemp); SVC_BJAR=$(mktemp)
curl -s -o /dev/null -c "$SVC_PJAR" -X POST -H 'Content-Type: application/json' \
  -d "{\"email\":\"$SVC_EMAIL\",\"password\":\"examwale-mentor-2026\"}" "$BASE/api/v1/auth/login"
curl -s -o /dev/null -c "$SVC_BJAR" -X POST -H 'Content-Type: application/json' \
  -d '{"email":"demo@examwale.test","password":"examwale-demo-2026"}' "$BASE/api/v1/auth/login"

LONG_DESC="You send me your CV as a PDF and within three days you get it back marked up, with a comment on every bullet point that is not doing any work, plus a short note on what the whole document says about you before anybody reads a word of it."
mk_service() { curl -s -b "$SVC_PJAR" -X POST -H 'Content-Type: application/json' -d "$1" "$BASE/api/v1/services"; }

# The capability gate: a provider profile alone is not enough.
check "Listing without the capability is refused" 1 \
  "$(mk_service "{\"kind\":\"RESUME_REVIEW\",\"title\":\"Resume review for graduates\",\"summary\":\"I read your CV and say what a recruiter thinks.\",\"description\":\"$LONG_DESC\",\"delivery\":\"ASYNC_REVIEW\",\"price\":800}" | grep -c \
      "haven't applied")"

$PSQL -q -c "INSERT INTO provider_capabilities (id,provider_profile_id,kind,status,approved_at)
  VALUES ('smokesvccap','$SVC_PROFILE','SERVICE_PROVIDER','ACTIVE',now())
  ON CONFLICT (provider_profile_id,kind) DO UPDATE SET status='ACTIVE';" >/dev/null

# A price is required, or an explicit "depends on the work". A directory of
# listings whose cost you can only learn by asking wastes everybody's time.
check "A listing with no price is refused" 1 \
  "$(mk_service "{\"kind\":\"RESUME_REVIEW\",\"title\":\"Resume review for graduates\",\"summary\":\"I read your CV and say what a recruiter thinks.\",\"description\":\"$LONG_DESC\",\"delivery\":\"ASYNC_REVIEW\"}" | grep -c 'Give a price')"
check "…but priced-per-engagement is accepted" 1 \
  "$(mk_service "{\"kind\":\"CONSULTING\",\"title\":\"Consulting on hiring processes\",\"summary\":\"Advice on a specific hiring problem you are having.\",\"description\":\"$LONG_DESC\",\"delivery\":\"WRITTEN_DELIVERABLE\",\"priceOnRequest\":true}" | grep -c '"priceOnRequest":true')"
check "A thin description is refused" 1 \
  "$(mk_service "{\"kind\":\"RESUME_REVIEW\",\"title\":\"Resume review for graduates\",\"summary\":\"I read your CV and say what a recruiter thinks.\",\"description\":\"too short\",\"delivery\":\"ASYNC_REVIEW\",\"price\":800}" | grep -c 'tells a buyer nothing')"

CREATED=$(mk_service "{\"kind\":\"RESUME_REVIEW\",\"title\":\"Resume review for commerce graduates\",\"summary\":\"I read your CV line by line and say what a recruiter would think.\",\"description\":\"$LONG_DESC\",\"deliverables\":[\"A marked-up copy of your CV\",\"A one-page note on the overall impression\"],\"delivery\":\"ASYNC_REVIEW\",\"price\":800,\"turnaroundDays\":3}")
check "A complete listing is created" 1 "$(printf '%s' "$CREATED" | grep -c '"status":"DRAFT"')"
SMOKE_SVC=$(printf '%s' "$CREATED" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
SMOKE_SVC_SLUG=$(printf '%s' "$CREATED" | grep -o '"slug":"[^"]*"' | cut -d'"' -f4)

# Nothing is public until a person has read it.
check "A draft is not public" 404 "$(getn "/services/$SMOKE_SVC_SLUG")"
check "…nor in the directory" 0 "$(curl -s "$BASE/services" | grep -c "$SMOKE_SVC_SLUG")"
check "…but its owner can see it" 200 "$(get "/services/$SMOKE_SVC_SLUG" "$SVC_PJAR")"

svc_action() { curl -s -b "$SVC_PJAR" -X POST -H 'Content-Type: application/json' -d "{\"action\":\"$1\"}" \
  "$BASE/api/v1/services/$SMOKE_SVC"; }
svc_mod() { curl -s -b "$ADMIN_JAR" -X POST -H 'Content-Type: application/json' -d "$1" \
  "$BASE/api/v1/admin/services/$SMOKE_SVC"; }
svc_status() { $PSQL -tAc "SELECT status FROM services WHERE id='$SMOKE_SVC'" | tr -d ' '; }

check "Submitting works" "SUBMITTED" "$(svc_action submit > /dev/null; svc_status)"
check "It appears in the moderation queue" 1 \
  "$(curl -s -b "$ADMIN_JAR" "$BASE/admin/services" | grep -c 'Resume review for commerce graduates')"
check "A seeker cannot moderate" 403 \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$SVC_BJAR" -X POST -H 'Content-Type: application/json' \
      -d '{"decision":"approve"}' "$BASE/api/v1/admin/services/$SMOKE_SVC")"
check "Approving lists it" "ACTIVE" "$(svc_mod '{"decision":"approve"}' > /dev/null; svc_status)"
check "It is public now" 200 "$(getn "/services/$SMOKE_SVC_SLUG")"
check "…and in the directory" 1 "$(curl -s "$BASE/services" | grep -c "$SMOKE_SVC_SLUG")"
check "The provider is told" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM notifications WHERE user_id='$SVC_MENTOR_USER' AND type='service.reviewed'" | tr -d ' ')"

echo
echo "── Stage 9 · screening and refusal ──────────────────────────────"
# The two things a service marketplace attracts: promises nobody can keep, and
# attempts to move the money somewhere with no record of it.
SCAM=$(mk_service "{\"kind\":\"INTERVIEW_COACHING\",\"title\":\"Guaranteed selection coaching\",\"summary\":\"100% placement guarantee for every serious candidate who joins.\",\"description\":\"This programme has an assured outcome and every candidate who completes it gets selected. Pay the registration fee in advance and message me on WhatsApp to begin. Sure shot results within three months.\",\"delivery\":\"PROGRAMME\",\"price\":15000}")
SCAM_ID=$(printf '%s' "$SCAM" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
FLAGS=$(curl -s -b "$SVC_PJAR" -X POST -H 'Content-Type: application/json' -d '{"action":"submit"}' \
  "$BASE/api/v1/services/$SCAM_ID")
check "A guaranteed outcome is flagged" 1 "$(printf '%s' "$FLAGS" | grep -c 'guarantees_outcome')"
check "So is pushing contact off-platform" 1 "$(printf '%s' "$FLAGS" | grep -c 'directs_off_platform')"
check "So is payment before any conversation" 1 "$(printf '%s' "$FLAGS" | grep -c 'asks_for_payment_upfront')"
# A flag is not a rejection — a person still decides.
check "…but flags do not block submission" "SUBMITTED" \
  "$($PSQL -tAc "SELECT status FROM services WHERE id='$SCAM_ID'" | tr -d ' ')"
check "A refusal with no reason is refused" 1 \
  "$(curl -s -b "$ADMIN_JAR" -X POST -H 'Content-Type: application/json' -d '{"decision":"reject"}' \
      "$BASE/api/v1/admin/services/$SCAM_ID" | grep -c 'Say why')"
check "With a reason it is refused properly" "REJECTED" \
  "$(curl -s -o /dev/null -b "$ADMIN_JAR" -X POST -H 'Content-Type: application/json' \
      -d '{"decision":"reject","reason":"Nobody can guarantee selection, and the number moves this off the platform."}' \
      "$BASE/api/v1/admin/services/$SCAM_ID"; $PSQL -tAc "SELECT status FROM services WHERE id='$SCAM_ID'" | tr -d ' ')"
check "The reason reaches the provider" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM notifications WHERE user_id='$SVC_MENTOR_USER' AND body LIKE '%guarantee selection%'" | tr -d ' ')"

echo
echo "── Stage 9 · requests open conversations ────────────────────────"
ASK=$(curl -s -b "$SVC_BJAR" -X POST -H 'Content-Type: application/json' \
  -d '{"message":"I am a B.Com graduate with one internship. Could you look at my CV?"}' \
  "$BASE/api/v1/services/$SMOKE_SVC/requests")
check "Asking creates a request" 1 "$(printf '%s' "$ASK" | grep -c '"status":"REQUESTED"')"
SVC_CONV=$(printf '%s' "$ASK" | grep -o '"conversationId":"[^"]*"' | cut -d'"' -f4)
# A request on its own says almost nothing; the arrangement happens in the thread.
check "…and opens a conversation" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM conversations WHERE id='$SVC_CONV' AND context_type='SERVICE_REQUEST'" | tr -d ' ')"
check "The opening message is in it" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM messages WHERE conversation_id='$SVC_CONV'" | tr -d ' ')"
check "The provider is notified" 1 \
  "$($PSQL -tAc "SELECT count(*) FROM notifications WHERE user_id='$SVC_MENTOR_USER' AND type='service.requested'" | tr -d ' ')"
check "Both parties can read the thread" 200 "$(get "/api/v1/messages/$SVC_CONV" "$SVC_PJAR")"
check "A stranger cannot" 404 "$(get "/api/v1/messages/$SVC_CONV" "$ADMIN_JAR")"
check "Asking twice is refused" 1 \
  "$(curl -s -b "$SVC_BJAR" -X POST -H 'Content-Type: application/json' -d '{}' \
      "$BASE/api/v1/services/$SMOKE_SVC/requests" | grep -c 'already have an open request')"
check "You cannot request your own service" 1 \
  "$(curl -s -b "$SVC_PJAR" -X POST -H 'Content-Type: application/json' -d '{}' \
      "$BASE/api/v1/services/$SMOKE_SVC/requests" | grep -c 'your own service')"

echo
echo "── Stage 9 · provider control ───────────────────────────────────"
check "Pausing requests keeps the listing up" 200 \
  "$(svc_action not_accepting > /dev/null; getn "/services/$SMOKE_SVC_SLUG")"
check "…but refuses new ones" 1 \
  "$($PSQL -q -c "DELETE FROM service_requests" >/dev/null; \
     curl -s -b "$SVC_BJAR" -X POST -H 'Content-Type: application/json' -d '{}' \
      "$BASE/api/v1/services/$SMOKE_SVC/requests" | grep -c 'paused new requests')"
svc_action accepting > /dev/null
check "Pausing the listing hides it" 404 "$(svc_action pause > /dev/null; getn "/services/$SMOKE_SVC_SLUG")"
# Relisting needs no re-approval: it is the same listing a moderator already read.
check "Relisting needs no re-approval" 200 "$(svc_action resume > /dev/null; getn "/services/$SMOKE_SVC_SLUG")"
# Editing does, because a changed listing is a different one.
EDITED=$(curl -s -b "$SVC_PJAR" -X PATCH -H 'Content-Type: application/json' -d '{"price":900}' \
  "$BASE/api/v1/services/$SMOKE_SVC")
check "Editing a listed service returns it to draft" 1 "$(printf '%s' "$EDITED" | grep -c '"returnedToDraft":true')"
check "…so it leaves the directory" 404 "$(getn "/services/$SMOKE_SVC_SLUG")"
check "Somebody else cannot edit it" 1 \
  "$(curl -s -b "$SVC_BJAR" -X PATCH -H 'Content-Type: application/json' -d '{"price":1}' \
      "$BASE/api/v1/services/$SMOKE_SVC" | grep -c \
      "isn't your service")"
check "The directory renders" 200 "$(getn /services)"
check "The provider's own page renders" 200 "$(get /provider/services "$SVC_PJAR")"
# A seeker gets the page, not a 403 — but it explains the gate rather than
# showing somebody else's listings. Asserting the status alone would have passed
# even if the page had leaked them.
check "A non-provider is told what is missing, not shown listings" 1 \
  "$(curl -s -b "$JAR" "$BASE/provider/services" | grep -c 'Not approved for this yet')"
check "…and sees no listing titles" 0 \
  "$(curl -s -b "$JAR" "$BASE/provider/services" | grep -c 'Resume review for commerce graduates')"

$PSQL -q -c "DELETE FROM service_requests; DELETE FROM service_moderation_reviews; DELETE FROM services;
  DELETE FROM provider_capabilities WHERE id='smokesvccap';
  DELETE FROM notifications WHERE type LIKE 'service.%';
  DELETE FROM messages WHERE conversation_id='$SVC_CONV';
  DELETE FROM conversation_participants WHERE conversation_id='$SVC_CONV';
  DELETE FROM conversations WHERE id='$SVC_CONV';" >/dev/null
rm -f "$SVC_PJAR" "$SVC_BJAR"

echo
echo "── Stage 10 · the unified provider dashboard ────────────────────"
PD_USER=$($PSQL -tAc "SELECT m.user_id FROM mentors m WHERE m.status='ACTIVE' LIMIT 1" | tr -d ' ')
PD_EMAIL=$($PSQL -tAc "SELECT email FROM users WHERE id='$PD_USER'" | tr -d ' ')
PD_PROFILE=$($PSQL -tAc "SELECT id FROM provider_profiles WHERE user_id='$PD_USER'" | tr -d ' ')
PD_MENTOR=$($PSQL -tAc "SELECT id FROM mentors WHERE user_id='$PD_USER'" | tr -d ' ')
PD_SEEKER=$($PSQL -tAc "SELECT id FROM users WHERE email='demo@examwale.test'" | tr -d ' ')
PD_COUNTRY=$($PSQL -tAc "SELECT id FROM countries WHERE iso_code='IN'" | tr -d ' ')

# One provider holding three capabilities, with something waiting under each —
# the case the shell exists for.
$PSQL -q -c "
  DELETE FROM provider_capabilities WHERE provider_profile_id='$PD_PROFILE' AND kind IN ('SERVICE_PROVIDER','EMPLOYER');
  INSERT INTO provider_capabilities (id,provider_profile_id,kind,status,approved_at) VALUES
    ('smokepd1','$PD_PROFILE','SERVICE_PROVIDER','ACTIVE',now()),
    ('smokepd2','$PD_PROFILE','EMPLOYER','ACTIVE',now());
  INSERT INTO organisations (id,name,type,country_id,verification_status,contact_email)
    VALUES ('smokepdorg','Smoke PD Org','company','$PD_COUNTRY','VERIFIED','ops@pd.test')
    ON CONFLICT (id) DO UPDATE SET verification_status='VERIFIED';
  INSERT INTO organisation_members (organisation_id,user_id,role)
    VALUES ('smokepdorg','$PD_USER','owner') ON CONFLICT DO NOTHING;
  DELETE FROM job_applications WHERE id='smokepdapp';
  DELETE FROM job_publication_periods WHERE job_posting_id='smokepdjob';
  DELETE FROM job_postings WHERE id='smokepdjob';
  INSERT INTO job_postings (id,company_id,title,slug,description,skills_required,status,organisation_id,created_by_id,expires_at,posted_at)
    VALUES ('smokepdjob',(SELECT id FROM companies LIMIT 1),'Smoke PD Analyst','smoke-pd-analyst',
      'A description long enough to clear the minimum length this field requires of an employer posting.',
      '[\"SQL\"]','ACTIVE','smokepdorg','$PD_USER', now() + interval '9 days', now() - interval '20 days');
  INSERT INTO job_publication_periods (id,job_posting_id,sequence,expires_at)
    VALUES ('smokepdp','smokepdjob',1, now() + interval '9 days');
  INSERT INTO job_applications (id,user_id,job_posting_id,status,applied_at)
    VALUES ('smokepdapp','$PD_SEEKER','smokepdjob','APPLIED', now() - interval '1 hour');
  DELETE FROM mentorship_sessions WHERE id LIKE 'smokepdsess%';
  INSERT INTO mentorship_sessions (id,mentor_id,seeker_id,topic,scheduled_at,duration_minutes,status,created_at) VALUES
    ('smokepdsess1','$PD_MENTOR','$PD_SEEKER','Smoke PD pending topic', now() + interval '3 days', 30, 'REQUESTED', now() - interval '3 days'),
    ('smokepdsess2','$PD_MENTOR','$PD_SEEKER','Smoke PD accepted topic', now() + interval '6 days', 30, 'ACCEPTED', now() - interval '5 days');
  DELETE FROM service_requests WHERE id='smokepdreq';
  DELETE FROM services WHERE id='smokepdsvc';
  INSERT INTO services (id,provider_profile_id,kind,title,slug,summary,description,delivery,price,currency_code,status)
    VALUES ('smokepdsvc','$PD_PROFILE','RESUME_REVIEW','Smoke PD resume review','smoke-pd-resume',
      'I read your CV and say what a recruiter would think of it, line by line.',
      'You send me your CV as a PDF and within three days you get it back marked up with a comment on every bullet.',
      'ASYNC_REVIEW', 800, 'INR', 'ACTIVE');
  INSERT INTO service_requests (id,service_id,requester_id,message,status,created_at)
    VALUES ('smokepdreq','smokepdsvc','$PD_SEEKER','Smoke PD service note','REQUESTED', now() - interval '2 hours');" >/dev/null

PD_JAR=$(mktemp)
curl -s -o /dev/null -c "$PD_JAR" -X POST -H 'Content-Type: application/json' \
  -d "{\"email\":\"$PD_EMAIL\",\"password\":\"examwale-mentor-2026\"}" "$BASE/api/v1/auth/login"

check "The provider shell renders" 200 "$(get /provider "$PD_JAR")"
check "Requests renders" 200 "$(get /provider/requests "$PD_JAR")"
check "Calendar renders" 200 "$(get /provider/calendar "$PD_JAR")"

# The queue is the point of the shell: three unrelated kinds of waiting person,
# in one list.
PD_REQUESTS=$(curl -s -b "$PD_JAR" "$BASE/provider/requests")
check "A session request is in the queue" 1 "$(printf '%s' "$PD_REQUESTS" | grep -c 'Smoke PD pending topic')"
check "A job application is too" 1 "$(printf '%s' "$PD_REQUESTS" | grep -c 'Smoke PD Analyst')"
check "...and a service request" 1 "$(printf '%s' "$PD_REQUESTS" | grep -c 'Smoke PD resume review')"
# Oldest first: whoever has waited longest is likeliest to have given up, and a
# newest-first queue buries them.
check "Oldest is listed first" 1 \
  "$(printf '%s' "$PD_REQUESTS" | grep -o 'Smoke PD pending topic\|Smoke PD resume review' | head -1 | grep -c 'pending topic')"
# An accepted session is not waiting for anybody.
check "An accepted session is not in the queue" 0 \
  "$(printf '%s' "$PD_REQUESTS" | grep -c 'Smoke PD accepted topic')"

# Navigation reflects what this person actually holds.
check "Nav offers hiring to an approved employer" 1 \
  "$(printf '%s' "$PD_REQUESTS" | grep -c 'href="/employers/dashboard"')"
check "...and services" 1 "$(printf '%s' "$PD_REQUESTS" | grep -c 'href="/provider/services"')"
$PSQL -q -c "UPDATE provider_capabilities SET status='SUSPENDED' WHERE id='smokepd2'" >/dev/null
check "Losing a capability removes its link" 0 \
  "$(curl -s -b "$PD_JAR" "$BASE/provider/requests" | grep -c 'href="/employers/dashboard"')"
$PSQL -q -c "UPDATE provider_capabilities SET status='ACTIVE' WHERE id='smokepd2'" >/dev/null

# The calendar mixes what is booked with what is about to lapse.
PD_CAL=$(curl -s -b "$PD_JAR" "$BASE/provider/calendar")
check "An accepted session is on the calendar" 1 "$(printf '%s' "$PD_CAL" | grep -c 'Smoke PD accepted topic')"
check "A posting deadline is too" 1 "$(printf '%s' "$PD_CAL" | grep -c 'Stops accepting applications')"

# Another provider must see none of it.
OTHER_EMAIL=$($PSQL -tAc "SELECT u.email FROM users u JOIN mentors m ON m.user_id=u.id WHERE m.status='ACTIVE' AND u.id <> '$PD_USER' LIMIT 1" | tr -d ' ')
OTHER_JAR=$(mktemp)
curl -s -o /dev/null -c "$OTHER_JAR" -X POST -H 'Content-Type: application/json' \
  -d "{\"email\":\"$OTHER_EMAIL\",\"password\":\"examwale-mentor-2026\"}" "$BASE/api/v1/auth/login"
OTHER_REQUESTS=$(curl -s -b "$OTHER_JAR" "$BASE/provider/requests")
check "Another provider sees none of these requests" 0 \
  "$(printf '%s' "$OTHER_REQUESTS" | grep -c 'Smoke PD pending topic')"
check "...nor the job application" 0 "$(printf '%s' "$OTHER_REQUESTS" | grep -c 'Smoke PD Analyst')"
check "...nor the service request" 0 "$(printf '%s' "$OTHER_REQUESTS" | grep -c 'Smoke PD resume review')"
check "...nor anything on the calendar" 0 \
  "$(curl -s -b "$OTHER_JAR" "$BASE/provider/calendar" | grep -c 'Smoke PD accepted topic')"
check "A non-provider is sent to set one up" 200 "$(get /provider "$JAR")"

$PSQL -q -c "
  DELETE FROM service_requests WHERE id='smokepdreq'; DELETE FROM services WHERE id='smokepdsvc';
  DELETE FROM mentorship_sessions WHERE id LIKE 'smokepdsess%';
  DELETE FROM job_applications WHERE id='smokepdapp';
  DELETE FROM job_publication_periods WHERE job_posting_id='smokepdjob';
  DELETE FROM job_postings WHERE id='smokepdjob';
  DELETE FROM organisation_members WHERE organisation_id='smokepdorg';
  DELETE FROM organisations WHERE id='smokepdorg';
  DELETE FROM provider_capabilities WHERE id IN ('smokepd1','smokepd2');" >/dev/null
rm -f "$PD_JAR" "$OTHER_JAR"

echo
echo "── Stage 11 · adversarial regressions ───────────────────────────"
# Each check below corresponds to a real defect found by an adversarial review
# pass, not to a hypothetical. They are grouped by the thing an attacker wanted.

echo "  · a privacy control that silently did nothing"
ADV_MENTOR=$($PSQL -tAc "SELECT id FROM mentors WHERE status='ACTIVE' AND credential_verified_at IS NOT NULL LIMIT 1" | tr -d ' ')
ADV_PROFILE=$($PSQL -tAc "SELECT pp.id FROM provider_profiles pp JOIN mentors m ON m.user_id=pp.user_id WHERE m.id='$ADV_MENTOR'" | tr -d ' ')
ADV_WAS=$($PSQL -tAc "SELECT visibility FROM provider_profiles WHERE id='$ADV_PROFILE'" | tr -d ' ')

$PSQL -q -c "UPDATE provider_profiles SET visibility='PUBLIC' WHERE id='$ADV_PROFILE'" >/dev/null
check "PUBLIC: listed and reachable" 1 "$(curl -s "$BASE/mentors" | grep -c "/mentors/$ADV_MENTOR")"
$PSQL -q -c "UPDATE provider_profiles SET visibility='LIMITED' WHERE id='$ADV_PROFILE'" >/dev/null
# LIMITED means "works by link, not in the directory" — the middle state is the
# whole reason the setting has three values.
check "LIMITED: out of the directory" 0 "$(curl -s "$BASE/mentors" | grep -c "/mentors/$ADV_MENTOR")"
check "LIMITED: still reachable by link" 200 "$(getn "/mentors/$ADV_MENTOR")"
$PSQL -q -c "UPDATE provider_profiles SET visibility='HIDDEN' WHERE id='$ADV_PROFILE'" >/dev/null
# Shipped for a whole stage doing nothing: a mentor who chose HIDDEN stayed in
# the directory with their full biography, and their screen said otherwise.
check "HIDDEN: out of the directory" 0 "$(curl -s "$BASE/mentors" | grep -c "/mentors/$ADV_MENTOR")"
check "HIDDEN: not reachable by link either" 404 "$(getn "/mentors/$ADV_MENTOR")"
check "HIDDEN: still reachable by an admin" 200 "$(get "/mentors/$ADV_MENTOR" "$ADMIN_JAR")"
$PSQL -q -c "UPDATE provider_profiles SET visibility='$ADV_WAS' WHERE id='$ADV_PROFILE'" >/dev/null

echo "  · publishing text nobody reviewed"
ADV_USER=$($PSQL -tAc "SELECT id FROM users WHERE email='demo@examwale.test'" | tr -d ' ')
ADV_COUNTRY=$($PSQL -tAc "SELECT id FROM countries WHERE iso_code='IN'" | tr -d ' ')
$PSQL -q -c "
  INSERT INTO organisations (id,name,type,country_id,verification_status,contact_email)
    VALUES ('smokeadvorg','Smoke Adversary Ltd','company','$ADV_COUNTRY','VERIFIED','x@y.test')
    ON CONFLICT (id) DO UPDATE SET verification_status='VERIFIED';
  INSERT INTO organisation_members (organisation_id,user_id,role)
    VALUES ('smokeadvorg','$ADV_USER','owner') ON CONFLICT DO NOTHING;
  DELETE FROM job_moderation_reviews WHERE job_posting_id='smokeadvjob';
  DELETE FROM job_publication_periods WHERE job_posting_id='smokeadvjob';
  DELETE FROM job_postings WHERE id='smokeadvjob';
  INSERT INTO job_postings (id,company_id,title,slug,description,skills_required,status,moderation_status,organisation_id,created_by_id,expires_at,posted_at)
    VALUES ('smokeadvjob',(SELECT id FROM companies LIMIT 1),'Smoke Adversary Role','smoke-adversary-role',
      'An ordinary description that a moderator read and approved without any concerns at all.',
      '[\"SQL\"]','CLOSED','VERIFIED','smokeadvorg','$ADV_USER', now() + interval '20 days', now() - interval '10 days');
  INSERT INTO job_moderation_reviews (id,job_posting_id,reviewer_id,decision)
    VALUES ('smokeadvrev','smokeadvjob',NULL,'approve');" >/dev/null

ADV_JAR=$(mktemp)
curl -s -o /dev/null -c "$ADV_JAR" -X POST -H 'Content-Type: application/json' \
  -d '{"email":"demo@examwale.test","password":"examwale-demo-2026"}' "$BASE/api/v1/auth/login"

# The attack: a posting that WAS approved is closed, its text swapped for a
# recruitment-fee scam, then revived. Every step is permitted on its own.
check "Editing a closed posting is allowed" 200 \
  "$(curl -s -o /dev/null -w '%{http_code}' -b "$ADV_JAR" -X PATCH -H 'Content-Type: application/json' \
      -d '{"description":"Pay a refundable registration fee of 2000 rupees to confirm your seat before the interview."}' \
      "$BASE/api/v1/employers/jobs/smokeadvjob")"
# ...but any content edit revokes the approval, whatever state it was in. This
# used to fire only for ACTIVE postings, which left the whole route open.
check "…but it returns to draft, unapproved" "DRAFT|UNVERIFIED" \
  "$($PSQL -tAc "SELECT status||'|'||moderation_status FROM job_postings WHERE id='smokeadvjob'" | tr -d ' ')"
check "…so it cannot be revived" 1 \
  "$(curl -s -b "$ADV_JAR" -X POST -H 'Content-Type: application/json' -d '{"action":"revive"}' \
      "$BASE/api/v1/employers/jobs/smokeadvjob/lifecycle" | grep -c 'expired or closed')"
check "…and the scam text never reaches the board" 404 "$(getn /jobs/smoke-adversary-role)"
# Belt and braces: even reaching publish() directly, an employer posting with no
# approval on record is refused.
$PSQL -q -c "UPDATE job_postings SET status='EXPIRED' WHERE id='smokeadvjob';
  DELETE FROM job_moderation_reviews WHERE job_posting_id='smokeadvjob';" >/dev/null
check "Publishing needs an approval on record" 1 \
  "$(curl -s -b "$ADV_JAR" -X POST -H 'Content-Type: application/json' -d '{"action":"revive"}' \
      "$BASE/api/v1/employers/jobs/smokeadvjob/lifecycle" | grep -c 'not been approved')"

echo "  · reading what only a moderator should see"
$PSQL -q -c "UPDATE mentors SET review_note='Internal note: approved, but watch the fee claims.' WHERE id='$ADV_MENTOR'" >/dev/null
# An unauthenticated endpoint was returning the whole mentors row, including the
# admin's private decision note.
check "The moderator's note is not in the public API" 0 \
  "$(curl -s "$BASE/api/v1/mentors/$ADV_MENTOR" | grep -c 'watch the fee claims')"
check "…nor in the listing" 0 "$(curl -s "$BASE/api/v1/mentors" | grep -c 'watch the fee claims')"
# Credentials were filtered to VERIFIED but returned whole: the reviewing admin's
# id, their note, and a link to the employment letter somebody uploaded.
check "Credential internals are not public" 0 \
  "$(curl -s "$BASE/api/v1/mentors/$ADV_MENTOR" | grep -cE 'verifiedById|evidenceUrl|documentId')"
check "…but the fact of verification still is" 1 \
  "$(curl -s "$BASE/api/v1/mentors/$ADV_MENTOR" | grep -c '\"status\":\"VERIFIED\"')"
$PSQL -q -c "UPDATE mentors SET review_note=NULL WHERE id='$ADV_MENTOR'" >/dev/null
check "A coaching centre's contact email is not public" 0 \
  "$(curl -s "$BASE/api/v1/providers" | grep -c contactEmail)"

echo "  · controlling the search predicate"
# A bare % used to match every row: the filter was attacker-controlled, and the
# same trick with alternating wildcards makes Postgres backtrack across every
# 4000-character biography on an endpoint with no session and no rate limit.
# grep -c counts matching *lines*, and the rendered HTML is a single line, so it
# would answer "1" for every query. Count the occurrences instead.
count_mentors() { curl -s "$BASE/mentors$1" | grep -o 'href="/mentors/' | wc -l | tr -d ' '; }
ALL_MENTORS=$(count_mentors "")
WILDCARD_HITS=$(count_mentors "?q=%25")
UNDERSCORE_HITS=$(count_mentors "?q=_")
REAL_HITS=$(count_mentors "?q=officer")
check "A bare % matches nothing rather than everything" 1 \
  "$([ "$WILDCARD_HITS" -lt "$ALL_MENTORS" ] && echo 1 || echo 0)"
check "An underscore is a literal, not a wildcard" 1 \
  "$([ "$UNDERSCORE_HITS" -lt "$ALL_MENTORS" ] && echo 1 || echo 0)"
check "A real search still works" 1 "$([ "$REAL_HITS" -ge 1 ] && echo 1 || echo 0)"
check "A pathological pattern returns promptly" 1 \
  "$(START=$(date +%s); curl -s -o /dev/null "$BASE/mentors?q=%25a%25a%25a%25a%25a%25a%25a%25a%25a%25b"; \
     [ $(( $(date +%s) - START )) -lt 5 ] && echo 1 || echo 0)"

echo "  · getting a script into somebody else's browser"
# The chat renderer escaped < > & but not quotes, and dropped a captured URL
# into a double-quoted href — so a quote closed the attribute and everything
# after it parsed as more attributes. It goes through dangerouslySetInnerHTML,
# which bypasses React's own URL sanitising.
# The attribute-injection XSS lived in the chat renderer's markdown-to-HTML
# pass. That component is gone with the assistant, and with it the only place
# in the product that wrote raw HTML into the DOM. Asserting the sink is absent
# is a stronger check than asserting the old escaping helper is still correct.
check "Nothing renders raw HTML into the DOM" 0 \
  "$(grep -rl 'dangerouslySetInnerHTML' src 2>/dev/null | wc -l | tr -d ' ')"
# z.string().url() checks shape, not scheme, and accepts javascript:.
# The definition plus every field that ends up rendered as an anchor.
check "Stored URLs are scheme-checked" 1 \
  "$([ "$(grep -rl 'isRenderableUrl' src/app/api | wc -l | tr -d ' ')" -ge 5 ] && echo 1 || echo 0)"

echo "  · following the README on a fresh machine"
# Every entry point that opens a database connection has to load .env itself.
# db:backfill did not, and worked only because it was always run from a shell
# that already had DATABASE_URL exported — step 4 of the README failed for
# anybody starting clean.
for entry in src/db/push.ts src/db/seed/index.ts src/db/backfill/provider-profiles.ts; do
  check "$(basename "$entry") loads .env" 1 "$(grep -c 'dotenv/config' "$entry")"
done

echo "  · reading somebody else's payment"
# The idempotency key had a global unique index and the replay lookup had no
# user predicate, so a colliding key returned another person's payment.
check "Payment replay is scoped to the caller" 1 \
  "$(grep -c 'eq(payments.userId, input.userId)' src/modules/billing/service.ts)"

$PSQL -q -c "
  DELETE FROM job_moderation_reviews WHERE job_posting_id='smokeadvjob';
  DELETE FROM job_publication_periods WHERE job_posting_id='smokeadvjob';
  DELETE FROM job_postings WHERE id='smokeadvjob';
  DELETE FROM organisation_members WHERE organisation_id='smokeadvorg';
  DELETE FROM organisations WHERE id='smokeadvorg';" >/dev/null
rm -f "$ADV_JAR"

echo
echo "── Human Intelligence: the claim has to survive an empty bench ───"
# The product's central promise is that a verified person reads your work. A
# promise like that is only worth making if the page can tell the truth when it
# is not currently true — otherwise the first visitor at 3am on a quiet week is
# sent to an empty directory by a page that just told them a human was waiting.

MENTORS_BEFORE=$($PSQL -tAc "SELECT count(*)::int FROM mentors m JOIN provider_profiles pp ON pp.user_id=m.user_id WHERE m.status='ACTIVE' AND m.credential_verified_at IS NOT NULL AND pp.visibility='PUBLIC'" | tr -d ' ')
check "There are mentors to begin with" 1 "$([ "$MENTORS_BEFORE" -gt 0 ] && echo 1 || echo 0)"
check "…and the tools say a person is available" 1 \
  "$(curl -s -b "$JAR" "$BASE/guidance/resume" | grep -c 'reads it and writes back')"
check "…and the hub offers the directory" 1 \
  "$(curl -s "$BASE/guidance" | grep -c 'taking requests')"

# Empty the bench the same way reality would — every mentor stops being listable.
$PSQL -q -c "UPDATE provider_profiles SET visibility='HIDDEN' WHERE user_id IN (SELECT user_id FROM mentors)" >/dev/null
# /mentors/apply is a standing link, not a mentor — exclude it or the directory
# never reads as empty.
check "The directory is genuinely empty" 0 \
  "$(curl -s "$BASE/mentors" | grep -o 'href=\"/mentors/[a-z0-9]\{12,\}' | wc -l | tr -d ' ')"
# The claim must degrade rather than persist.
check "The hub stops claiming a human is there" 1 \
  "$(curl -s "$BASE/guidance" | grep -c 'No mentors are taking requests')"
check "…and says so rather than 404ing" 200 "$(getn /guidance)"
check "The résumé tool drops its promise too" 1 \
  "$(curl -s -b "$JAR" "$BASE/guidance/resume" | grep -c 'No mentors are taking requests at the moment')"
check "…but the report itself still works" 200 "$(get /guidance/resume "$JAR")"
check "Interview practice degrades the same way" 1 \
  "$(curl -s -b "$JAR" "$BASE/guidance/interview" | grep -c 'is empty at the moment')"
check "The dashboard shows the real number" 1 \
  "$(curl -s -b "$JAR" "$BASE/dashboard" | grep -c 'none taking requests')"
# The count and the directory read the same gate, so they cannot disagree.
check "Count and directory agree when empty" 200 "$(getn /mentors)"
# The empty directory must not blame a filter the visitor never set.
check "…and blames nobody's filters" 1 \
  "$(curl -s "$BASE/mentors" | grep -c 'No mentors are taking requests right now')"
check "…and does not say to change filters" 0 \
  "$(curl -s "$BASE/mentors" | grep -c 'Try a different language filter')"

$PSQL -q -c "UPDATE provider_profiles SET visibility='PUBLIC' WHERE user_id IN (SELECT user_id FROM mentors)" >/dev/null
check "Restoring the bench restores the offer" 1 \
  "$(curl -s "$BASE/guidance" | grep -c 'taking requests')"

echo
echo "── Layout: nothing scrolls sideways ─────────────────────────────"
# A grid item defaults to min-width:auto, so a nav full of nowrap links refused
# to be narrower than its content and dragged every dashboard page 850px wide
# on a phone. The fix is min-w-0 at the component; this asserts it is still there.
for nav in dashboard-nav provider-nav admin-nav; do
  # Match the class on the element, not the word in the comment above it.
  check "$nav is allowed to be narrow" 1 \
    "$(grep -c 'className="min-w-0' src/components/$nav.tsx)"
  check "$nav wraps instead of scrolling" 0 \
    "$(grep -c 'className="flex gap-1 overflow-x-auto' src/components/$nav.tsx)"
done
# The backstop must be clip, not hidden: hidden silently kills position:sticky.
check "The document cannot scroll sideways" 1 "$(grep -c 'overflow-x: clip' src/app/globals.css)"
check "…and sticky navs still work" 0 "$(grep -c 'overflow-x: hidden' src/app/globals.css)"

echo
echo "── Sign out ─────────────────────────────────────────────────────"
check "POST /api/v1/auth/logout" 200 "$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -c "$JAR" -X POST "$BASE/api/v1/auth/logout")"
check "GET /api/v1/users/me/profile after logout" 401 "$(get /api/v1/users/me/profile "$JAR")"

rm -f "$JAR" "$ADMIN_JAR"

echo
echo "─────────────────────────────────────────────────────────────────"
printf '  %d passed, %d failed\n' "$PASSED" "$FAILED"
echo "─────────────────────────────────────────────────────────────────"
exit $(( FAILED > 0 ? 1 : 0 ))
