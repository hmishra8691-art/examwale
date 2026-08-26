/**
 * What is waiting for one provider, across everything they offer.
 *
 * One query per capability rather than a single join: the tables have nothing in
 * common, and a six-way left join producing four numbers is harder to read and
 * no faster than four statements against indexed columns.
 *
 * The counts drive the navigation badges as well as the overview, so they are
 * gathered once per request and passed down rather than each screen asking
 * again.
 */
import { and, asc, count, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  conversationParticipants,
  jobApplications,
  jobPostings,
  mentors,
  mentorshipSessions,
  messages,
  organisationMembers,
  providerProfiles,
  serviceRequests,
  services,
  users,
} from "@/db/schema";
import type { CapabilityKind } from "@/modules/providers/service";

export type ProviderWorkload = {
  mentorRequests: number;
  upcomingSessions: number;
  jobApplicants: number;
  liveJobs: number;
  serviceRequests: number;
  liveServices: number;
  unreadMessages: number;
  /** Everything a person is expected to respond to. Drives the "Requests" badge. */
  waiting: number;
};

export async function providerWorkload(
  userId: string,
  active: CapabilityKind[],
): Promise<ProviderWorkload> {
  const zero: ProviderWorkload = {
    mentorRequests: 0,
    upcomingSessions: 0,
    jobApplicants: 0,
    liveJobs: 0,
    serviceRequests: 0,
    liveServices: 0,
    unreadMessages: 0,
    waiting: 0,
  };

  const [mentoring, hiring, servicing, unread] = await Promise.all([
    active.includes("MENTOR")
      ? db
          .execute<{ pending: number; upcoming: number }>(sql`
            SELECT
              count(*) FILTER (WHERE ms.status = 'REQUESTED')::int AS pending,
              count(*) FILTER (WHERE ms.status = 'ACCEPTED' AND ms.scheduled_at > now())::int AS upcoming
            FROM mentorship_sessions ms
            JOIN mentors m ON m.id = ms.mentor_id
            WHERE m.user_id = ${userId}
          `).then((r) => r.rows[0])
      : Promise.resolve(undefined),

    active.includes("EMPLOYER")
      ? db
          .execute<{ applicants: number; live: number }>(sql`
            SELECT
              count(DISTINCT ja.id) FILTER (WHERE ja.status = 'APPLIED')::int AS applicants,
              count(DISTINCT jp.id) FILTER (WHERE jp.status = 'ACTIVE')::int AS live
            FROM organisation_members om
            JOIN job_postings jp ON jp.organisation_id = om.organisation_id
            LEFT JOIN job_applications ja ON ja.job_posting_id = jp.id
            WHERE om.user_id = ${userId}
          `).then((r) => r.rows[0])
      : Promise.resolve(undefined),

    active.includes("SERVICE_PROVIDER")
      ? db
          .execute<{ requests: number; live: number }>(sql`
            SELECT
              count(DISTINCT sr.id) FILTER (WHERE sr.status = 'REQUESTED')::int AS requests,
              count(DISTINCT s.id) FILTER (WHERE s.status = 'ACTIVE')::int AS live
            FROM provider_profiles pp
            JOIN services s ON s.provider_profile_id = pp.id
            LEFT JOIN service_requests sr ON sr.service_id = s.id
            WHERE pp.user_id = ${userId}
          `).then((r) => r.rows[0])
      : Promise.resolve(undefined),

    db
      .execute<{ total: number }>(sql`
        SELECT count(*)::int AS total
        FROM messages m
        JOIN conversation_participants cp
          ON cp.conversation_id = m.conversation_id AND cp.user_id = ${userId}
        WHERE m.sender_id <> ${userId}
          AND m.deleted_at IS NULL
          AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
      `).then((r) => r.rows[0]),
  ]);

  const result: ProviderWorkload = {
    ...zero,
    mentorRequests: Number(mentoring?.pending ?? 0),
    upcomingSessions: Number(mentoring?.upcoming ?? 0),
    jobApplicants: Number(hiring?.applicants ?? 0),
    liveJobs: Number(hiring?.live ?? 0),
    serviceRequests: Number(servicing?.requests ?? 0),
    liveServices: Number(servicing?.live ?? 0),
    unreadMessages: Number(unread?.total ?? 0),
  };
  result.waiting = result.mentorRequests + result.jobApplicants + result.serviceRequests;
  return result;
}

export type WaitingItem = {
  id: string;
  kind: "MENTORSHIP" | "JOB_APPLICATION" | "SERVICE_REQUEST";
  personId: string;
  personName: string | null;
  avatarHash: string | null;
  /** What it is about. */
  subject: string;
  /** Their own words, when they wrote any. */
  note: string | null;
  at: Date;
  href: string;
};

/**
 * Everything waiting for a response, in one list, oldest first.
 *
 * Oldest first rather than newest: the person who has been waiting longest is
 * the one most likely to have given up, and a queue sorted the other way buries
 * them under everything that arrived since.
 */
export async function waitingForProvider(
  userId: string,
  active: CapabilityKind[],
): Promise<WaitingItem[]> {
  const items: WaitingItem[] = [];

  if (active.includes("MENTOR")) {
    const rows = await db
      .select({
        id: mentorshipSessions.id,
        topic: mentorshipSessions.topic,
        question: mentorshipSessions.question,
        at: mentorshipSessions.createdAt,
        personId: users.id,
        personName: users.name,
        avatarHash: users.avatarHash,
      })
      .from(mentorshipSessions)
      .innerJoin(mentors, eq(mentors.id, mentorshipSessions.mentorId))
      .innerJoin(users, eq(users.id, mentorshipSessions.seekerId))
      .where(and(eq(mentors.userId, userId), eq(mentorshipSessions.status, "REQUESTED")))
      .orderBy(asc(mentorshipSessions.createdAt))
      .limit(50);

    for (const row of rows) {
      items.push({
        id: row.id,
        kind: "MENTORSHIP",
        personId: row.personId,
        personName: row.personName,
        avatarHash: row.avatarHash,
        subject: row.topic,
        note: row.question,
        at: row.at,
        href: "/dashboard/mentor",
      });
    }
  }

  if (active.includes("EMPLOYER")) {
    const rows = await db
      .select({
        id: jobApplications.id,
        title: jobPostings.title,
        jobId: jobPostings.id,
        letter: jobApplications.coverLetter,
        at: jobApplications.appliedAt,
        personId: users.id,
        personName: users.name,
        avatarHash: users.avatarHash,
      })
      .from(jobApplications)
      .innerJoin(jobPostings, eq(jobPostings.id, jobApplications.jobPostingId))
      .innerJoin(
        organisationMembers,
        eq(organisationMembers.organisationId, jobPostings.organisationId),
      )
      .innerJoin(users, eq(users.id, jobApplications.userId))
      .where(and(eq(organisationMembers.userId, userId), eq(jobApplications.status, "APPLIED")))
      .orderBy(asc(jobApplications.appliedAt))
      .limit(50);

    for (const row of rows) {
      items.push({
        id: row.id,
        kind: "JOB_APPLICATION",
        personId: row.personId,
        personName: row.personName,
        avatarHash: row.avatarHash,
        subject: row.title,
        note: row.letter,
        at: row.at,
        href: `/employers/dashboard/jobs/${row.jobId}`,
      });
    }
  }

  if (active.includes("SERVICE_PROVIDER")) {
    const rows = await db
      .select({
        id: serviceRequests.id,
        title: services.title,
        message: serviceRequests.message,
        at: serviceRequests.createdAt,
        personId: users.id,
        personName: users.name,
        avatarHash: users.avatarHash,
      })
      .from(serviceRequests)
      .innerJoin(services, eq(services.id, serviceRequests.serviceId))
      .innerJoin(providerProfiles, eq(providerProfiles.id, services.providerProfileId))
      .innerJoin(users, eq(users.id, serviceRequests.requesterId))
      .where(and(eq(providerProfiles.userId, userId), eq(serviceRequests.status, "REQUESTED")))
      .orderBy(asc(serviceRequests.createdAt))
      .limit(50);

    for (const row of rows) {
      items.push({
        id: row.id,
        kind: "SERVICE_REQUEST",
        personId: row.personId,
        personName: row.personName,
        avatarHash: row.avatarHash,
        subject: row.title,
        note: row.message,
        at: row.at,
        href: "/messages",
      });
    }
  }

  return items.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export type CalendarEntry = {
  id: string;
  kind: "SESSION" | "DEADLINE";
  at: Date;
  title: string;
  detail: string | null;
  href: string;
};

/**
 * The next few weeks, across everything with a date attached.
 *
 * Mentorship sessions are the obvious entries. Job postings' deadlines are here
 * too, because "this closes on Thursday" is a thing a provider needs to see
 * coming — it is the difference between extending a posting and losing the
 * applicants who would have arrived on Friday.
 */
export async function providerCalendar(
  userId: string,
  active: CapabilityKind[],
  horizonDays = 42,
): Promise<CalendarEntry[]> {
  const now = new Date();
  const until = new Date(now.getTime() + horizonDays * 86_400_000);
  const entries: CalendarEntry[] = [];

  if (active.includes("MENTOR")) {
    const rows = await db
      .select({
        id: mentorshipSessions.id,
        at: mentorshipSessions.scheduledAt,
        topic: mentorshipSessions.topic,
        status: mentorshipSessions.status,
        name: users.name,
      })
      .from(mentorshipSessions)
      .innerJoin(mentors, eq(mentors.id, mentorshipSessions.mentorId))
      .innerJoin(users, eq(users.id, mentorshipSessions.seekerId))
      .where(
        and(
          eq(mentors.userId, userId),
          inArray(mentorshipSessions.status, ["REQUESTED", "ACCEPTED"]),
          gt(mentorshipSessions.scheduledAt, now),
        ),
      )
      .orderBy(asc(mentorshipSessions.scheduledAt))
      .limit(60);

    for (const row of rows) {
      entries.push({
        id: row.id,
        kind: "SESSION",
        at: row.at,
        title: row.topic,
        detail: `${row.name ?? "Someone"} · ${row.status === "REQUESTED" ? "not yet accepted" : "confirmed"}`,
        href: "/dashboard/mentor",
      });
    }
  }

  if (active.includes("EMPLOYER")) {
    const rows = await db
      .select({
        id: jobPostings.id,
        title: jobPostings.title,
        expiresAt: jobPostings.expiresAt,
      })
      .from(jobPostings)
      .innerJoin(
        organisationMembers,
        eq(organisationMembers.organisationId, jobPostings.organisationId),
      )
      .where(
        and(
          eq(organisationMembers.userId, userId),
          eq(jobPostings.status, "ACTIVE"),
          gt(jobPostings.expiresAt, now),
        ),
      )
      .orderBy(asc(jobPostings.expiresAt))
      .limit(60);

    for (const row of rows) {
      if (!row.expiresAt || row.expiresAt > until) continue;
      entries.push({
        id: row.id,
        kind: "DEADLINE",
        at: row.expiresAt,
        title: row.title,
        detail: "Stops accepting applications",
        href: `/employers/dashboard/jobs/${row.id}`,
      });
    }
  }

  return entries.filter((entry) => entry.at <= until).sort((a, b) => a.at.getTime() - b.at.getTime());
}
