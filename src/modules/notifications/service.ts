/**
 * Notification service.
 *
 * `notify()` is the single entry point. It writes the in-app record first and
 * fans out to other channels afterwards, in that order and never the reverse:
 * the bell is the durable record, and an email provider being down must not
 * mean the user never learns their exam date changed.
 *
 * Nothing in here throws into its caller. A notification is a side effect of
 * something the user asked for — booking a session, publishing a job — and a
 * failure to announce that thing must not undo the thing itself.
 */
import { and, count, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  notificationDeliveries,
  notificationPreferences,
  notifications,
  users,
} from "@/db/schema";
import { NotFoundError } from "@/modules/shared/errors";
import { configuredChannels, getChannel } from "@/modules/notifications/channels";

export type NotificationChannelName = "IN_APP" | "EMAIL" | "PUSH";

/**
 * Notification types, and which channels each may use by default.
 *
 * Declared rather than free-form so the preferences screen can list every type
 * a user might receive without waiting for one to arrive first, and so a typo
 * in a call site fails a type check instead of creating an unmutable category.
 */
export const NOTIFICATION_TYPES = {
  "billing.activated": { label: "Plan activated", defaults: ["IN_APP", "EMAIL"] },
  "billing.cancelled": { label: "Plan cancelled", defaults: ["IN_APP", "EMAIL"] },
  "billing.expiring": { label: "Plan expiring soon", defaults: ["IN_APP", "EMAIL"] },
  "job.application_update": { label: "Application status changed", defaults: ["IN_APP", "EMAIL"] },
  "job.posting_approved": { label: "Your job posting was reviewed", defaults: ["IN_APP", "EMAIL"] },
  "job.new_applicant": { label: "New applicant", defaults: ["IN_APP"] },
  "job.expiring_soon": { label: "Your job posting is closing", defaults: ["IN_APP", "EMAIL"] },
  "exam.date_verified": { label: "Exam date verified", defaults: ["IN_APP", "EMAIL"] },
  "exam.deadline_soon": { label: "Application deadline approaching", defaults: ["IN_APP", "EMAIL"] },
  "mentor.session_requested": { label: "New mentorship request", defaults: ["IN_APP", "EMAIL"] },
  "mentor.session_accepted": { label: "Mentorship request accepted", defaults: ["IN_APP", "EMAIL"] },
  "mentor.session_declined": { label: "Mentorship request declined", defaults: ["IN_APP"] },
  "mentor.session_reminder": { label: "Session starting soon", defaults: ["IN_APP", "PUSH"] },
  "mentor.application_reviewed": { label: "Mentor application reviewed", defaults: ["IN_APP", "EMAIL"] },
  "course.enquiry_received": { label: "New course enquiry", defaults: ["IN_APP", "EMAIL"] },
  "cohort.invited": { label: "Invited to a cohort", defaults: ["IN_APP", "EMAIL"] },
  "roadmap.step_due": { label: "Roadmap step due", defaults: ["IN_APP"] },
  "admin.verification_due": { label: "Records need re-verification", defaults: ["IN_APP"] },
  /*
   * The message body is deliberately never in the notification. These go to
   * email and push, and a private message is not something to copy into either —
   * the notification says a message arrived and where to read it.
   */
  "messaging.new_message": { label: "New message", defaults: ["IN_APP", "EMAIL"] },
  "service.requested": { label: "Service request", defaults: ["IN_APP", "EMAIL"] },
  "service.reviewed": { label: "Your service was reviewed", defaults: ["IN_APP", "EMAIL"] },
  "messaging.report_reviewed": { label: "Your report was reviewed", defaults: ["IN_APP", "EMAIL"] },
} as const;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;

export function notificationTypeList() {
  return (Object.keys(NOTIFICATION_TYPES) as NotificationType[]).map((type) => ({
    type,
    label: NOTIFICATION_TYPES[type].label,
    defaults: NOTIFICATION_TYPES[type].defaults as readonly NotificationChannelName[],
  }));
}

export type NotifyInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  href?: string | null;
  /**
   * Collapses repeats. When supplied and a notification with the same key
   * already exists for this user, nothing new is created.
   */
  dedupeKey?: string | null;
  /** Overrides the type's default channels. */
  channels?: NotificationChannelName[];
};

/**
 * Which channels this user actually wants for this type.
 *
 * An explicit preference row wins. Absent a row, the type's declared default
 * applies — so a new notification type reaches people sensibly without needing
 * a backfill, and switching one off is remembered.
 */
async function resolveChannels(
  userId: string,
  type: NotificationType,
  override?: NotificationChannelName[],
): Promise<NotificationChannelName[]> {
  const defaults = (override ?? NOTIFICATION_TYPES[type].defaults) as NotificationChannelName[];

  const prefs = await db
    .select()
    .from(notificationPreferences)
    .where(and(eq(notificationPreferences.userId, userId), eq(notificationPreferences.type, type)));

  if (!prefs.length) return defaults;

  const byChannel = new Map(prefs.map((p) => [p.channel as NotificationChannelName, p.enabled]));
  const candidates = new Set<NotificationChannelName>([
    ...defaults,
    ...prefs.filter((p) => p.enabled).map((p) => p.channel as NotificationChannelName),
  ]);

  return [...candidates].filter((channel) => byChannel.get(channel) ?? defaults.includes(channel));
}

export async function notify(input: NotifyInput): Promise<{ id: string; deduped: boolean } | null> {
  try {
    if (input.dedupeKey) {
      const [existing] = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(eq(notifications.userId, input.userId), eq(notifications.dedupeKey, input.dedupeKey)),
        )
        .limit(1);
      if (existing) return { id: existing.id, deduped: true };
    }

    const [record] = await db
      .insert(notifications)
      .values({
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        href: input.href ?? null,
        dedupeKey: input.dedupeKey ?? null,
      })
      .onConflictDoNothing()
      .returning();

    // A concurrent call won the dedupe race. That is the correct outcome.
    if (!record) return { id: "", deduped: true };

    const channels = await resolveChannels(input.userId, input.type, input.channels);
    const outbound = channels.filter((channel) => channel !== "IN_APP");
    if (outbound.length) {
      // Deliberately not awaited against the request: the in-app row is
      // already durable, and the user should not wait on an SMTP round trip.
      void deliver(record.id, outbound).catch((error) =>
        console.error("[notify] delivery failed", record.id, error),
      );
    }

    return { id: record.id, deduped: false };
  } catch (error) {
    console.error("[notify] could not record notification", input.type, error);
    return null;
  }
}

/** Sends one notification down the given channels, recording each attempt. */
export async function deliver(
  notificationId: string,
  channels: NotificationChannelName[],
): Promise<void> {
  const [row] = await db
    .select({
      id: notifications.id,
      userId: notifications.userId,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      href: notifications.href,
      email: users.email,
      name: users.name,
    })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.userId))
    .where(eq(notifications.id, notificationId))
    .limit(1);

  if (!row) return;

  for (const channelName of channels) {
    const channel = getChannel(channelName);
    const [delivery] = await db
      .insert(notificationDeliveries)
      .values({ notificationId, channel: channelName, status: "PENDING", attempts: 1 })
      .returning();

    const outcome = await channel.send({
      notificationId: row.id,
      userId: row.userId,
      email: row.email,
      name: row.name,
      type: row.type,
      title: row.title,
      body: row.body,
      href: row.href,
    });

    await db
      .update(notificationDeliveries)
      .set({
        status: outcome.status,
        lastError: outcome.error ?? null,
        sentAt: outcome.status === "SENT" ? new Date() : null,
      })
      .where(eq(notificationDeliveries.id, delivery.id));
  }
}

/** Fan-out helper for events that concern several people at once. */
export async function notifyMany(
  userIds: string[],
  input: Omit<NotifyInput, "userId"> & { dedupeKeyFor?: (userId: string) => string },
): Promise<void> {
  const unique = [...new Set(userIds)].filter(Boolean);
  for (const userId of unique) {
    await notify({
      ...input,
      userId,
      dedupeKey: input.dedupeKeyFor ? input.dedupeKeyFor(userId) : input.dedupeKey,
    });
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listNotifications(
  userId: string,
  options: { unreadOnly?: boolean; limit?: number } = {},
) {
  const limit = Math.min(100, Math.max(1, options.limit ?? 30));
  const conditions = [eq(notifications.userId, userId)];
  if (options.unreadOnly) conditions.push(isNull(notifications.readAt));

  return db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function unreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.value ?? 0;
}

/** Scoped by userId in the same statement — no read-then-write ownership gap. */
export async function markRead(userId: string, notificationId: string): Promise<void> {
  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
    .returning({ id: notifications.id });
  if (!updated.length) throw new NotFoundError("We couldn't find that notification.");
}

export async function markAllRead(userId: string): Promise<number> {
  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return updated.length;
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

export async function getPreferences(userId: string) {
  const rows = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));

  const explicit = new Map(rows.map((r) => [`${r.type}:${r.channel}`, r.enabled]));
  const available = configuredChannels();

  return notificationTypeList().map((entry) => ({
    ...entry,
    channels: (["IN_APP", "EMAIL", "PUSH"] as NotificationChannelName[]).map((channel) => ({
      channel,
      enabled: explicit.get(`${entry.type}:${channel}`) ?? entry.defaults.includes(channel),
      /** False when the deployment has no provider for it — shown as unavailable. */
      available: available.includes(channel),
      isDefault: entry.defaults.includes(channel),
    })),
  }));
}

export async function setPreference(input: {
  userId: string;
  type: string;
  channel: NotificationChannelName;
  enabled: boolean;
}): Promise<void> {
  if (!(input.type in NOTIFICATION_TYPES)) {
    throw new NotFoundError("That notification type doesn't exist.");
  }

  await db
    .insert(notificationPreferences)
    .values({
      userId: input.userId,
      type: input.type,
      channel: input.channel,
      enabled: input.enabled,
    })
    .onConflictDoUpdate({
      target: [
        notificationPreferences.userId,
        notificationPreferences.type,
        notificationPreferences.channel,
      ],
      set: { enabled: input.enabled },
    });
}

/**
 * Deletes read notifications older than the retention window.
 *
 * Notifications are a log of things that already happened elsewhere in the
 * database; keeping them forever accumulates a behavioural profile with no
 * remaining purpose.
 */
export async function pruneOldNotifications(days = 120): Promise<number> {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const removed = await db
    .delete(notifications)
    .where(and(lt(notifications.createdAt, cutoff), sql`${notifications.readAt} IS NOT NULL`))
    .returning({ id: notifications.id });

  if (removed.length) {
    await db.delete(notificationDeliveries).where(
      inArray(
        notificationDeliveries.notificationId,
        removed.map((r) => r.id),
      ),
    );
  }
  return removed.length;
}
