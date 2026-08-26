# Scheduled tasks

One endpoint, `/api/cron/tick`, runs whatever is due. It needs `CRON_SECRET` set
on the deployment; without it the route returns 503 and no reminder ever sends.

```bash
openssl rand -base64 32     # then set CRON_SECRET to the output
```

## Why one endpoint instead of one cron entry per task

Vercel's Hobby plan allows **two cron entries per project, each firing at most
once a day**. A design with one entry per task would not fit on it, and would
have to be rewritten to move hosts. So the cadence lives in
`src/modules/scheduler/tasks.ts` — each task declares `everyMinutes`, and a task
is due when its last successful run is older than that. The tick just asks.

The practical consequence: **the tick's frequency is a ceiling on every task's
frequency.** A task set to run hourly cannot run more often than the tick does.

## Choosing a trigger

| Trigger | Frequency | Session reminders arrive |
|---|---|---|
| `vercel.json` as shipped (Hobby) | daily, 02:00 UTC | up to 24h late — see below |
| `vercel.json` changed to `0 * * * *` (Pro) | hourly | within the hour |
| An external caller (cron-job.org, GitHub Actions, a home server) | whatever you set | within that interval |

**Daily is not good enough for session reminders.** The reminder is meant to
arrive 24 hours before a session; a daily tick means it can arrive anywhere
between 24 and 48 hours ahead, or not at all if the session was booked inside
the window. Everything else in the list — job expiry warnings, exam deadlines,
roadmap nudges, billing, housekeeping — is measured in days and is fine daily.

If you are on Hobby and want the reminders to work, point an external scheduler
at the endpoint hourly. Any of these is enough:

```bash
# curl, from anywhere on a timer
curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.vercel.app/api/cron/tick
```

```yaml
# .github/workflows/tick.yml
on:
  schedule: [{ cron: "0 * * * *" }]
jobs:
  tick:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -fsS -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            https://your-app.vercel.app/api/cron/tick
```

Calling it more often than needed is harmless: a task that is not due is
skipped, and the response says so.

## Watching it

`/admin/scheduler` lists every registered task with its interval, when it last
ran, how many rows it touched and what it said. A task that has never run shows
as "never" rather than being absent, because that is the state most worth
noticing. Each task also has a **Run now** button, which bypasses the due check.

The tick returns 200 even when a task fails, with the failures in the body.
A non-2xx would make most cron providers retry the whole tick, which is the
wrong response to one sweep of eight having a bug. Failures are recorded in
`scheduled_task_runs` and shown in the admin panel — that is where they surface.

## Adding a task

Add an entry to `TASKS` in `src/modules/scheduler/tasks.ts`. It must be:

- **Idempotent.** It will run twice. Notifications get a `dedupeKey`, and the
  unique index on `(user_id, dedupe_key)` makes the second send a no-op in the
  database rather than a decision in application code.
- **Bounded.** Take the `limit` and use it. A first run against a large backlog
  must not exceed the function timeout; what it does not finish, the next tick
  picks up.
- **Reportable.** Return a count and one line of prose. Silence is
  indistinguishable from failure.
