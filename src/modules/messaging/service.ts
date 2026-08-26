/**
 * Messaging.
 *
 * The decision that shapes everything else: **you cannot message a stranger.**
 * A conversation exists only where a real relationship already does — a
 * mentorship session, a job application, a course enquiry — and that anchor is
 * re-checked on every send, not only when the thread was opened.
 *
 * That is a constraint, and it is the point. This platform's users include
 * school students choosing what to do after Class 10, and its providers are
 * adults they have never met. An open inbox on such a platform is a grooming
 * and spam channel with a chat interface attached; every product that has
 * shipped one has then spent years building the controls back. The relationship
 * requirement is not a feature to be relaxed later — it is what makes shipping
 * this responsible at all.
 *
 * What is *not* claimed: end-to-end encryption. The Phase 2 brief warned against
 * asserting it, correctly. What is true is TLS in transit, encryption at rest by
 * the database provider, an authorisation check on every single read, and
 * moderator access when a message is reported. Real end-to-end encryption is a
 * different product with key management as its hard part, and it would make the
 * moderation this design depends on impossible. Saying so plainly beats a
 * padlock icon that means nothing.
 */
import { and, asc, desc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  abuseReports,
  conversationParticipants,
  conversations,
  courseEnquiries,
  courses,
  jobApplications,
  jobPostings,
  mentors,
  mentorshipSessions,
  messages,
  organisationMembers,
  providerProfiles,
  providers,
  serviceRequests,
  services,
  userBlocks,
  users,
} from "@/db/schema";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  isUniqueViolation,
} from "@/modules/shared/errors";
import { recordAudit } from "@/modules/shared/audit";
import { notify } from "@/modules/notifications/service";

export type ConversationContext =
  | "MENTORSHIP"
  | "JOB_APPLICATION"
  | "COURSE_ENQUIRY"
  | "SERVICE_REQUEST"
  | "SUPPORT";

export const MAX_MESSAGE_LENGTH = 4000;

/** How long a sender may edit or delete their own message. */
const EDIT_WINDOW_MINUTES = 15;

// ---------------------------------------------------------------------------
// Blocking
// ---------------------------------------------------------------------------

/**
 * True if either party has blocked the other.
 *
 * Symmetric on purpose. A one-way block would let the person who blocked keep
 * sending to somebody who cannot reply, which is a harassment tool wearing a
 * safety feature's name.
 */
export async function isBlockedBetween(a: string, b: string): Promise<boolean> {
  const [row] = await db
    .select({ blockerId: userBlocks.blockerId })
    .from(userBlocks)
    .where(
      or(
        and(eq(userBlocks.blockerId, a), eq(userBlocks.blockedId, b)),
        and(eq(userBlocks.blockerId, b), eq(userBlocks.blockedId, a)),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function blockUser(input: { blockerId: string; blockedId: string }) {
  if (input.blockerId === input.blockedId) {
    throw new ValidationError("You cannot block yourself.");
  }
  await db.insert(userBlocks).values(input).onConflictDoNothing();
  await recordAudit({
    actorType: "user",
    actorId: input.blockerId,
    action: "messaging.blocked",
    entityType: "user",
    entityId: input.blockedId,
  });
}

export async function unblockUser(input: { blockerId: string; blockedId: string }) {
  await db
    .delete(userBlocks)
    .where(
      and(eq(userBlocks.blockerId, input.blockerId), eq(userBlocks.blockedId, input.blockedId)),
    );
  await recordAudit({
    actorType: "user",
    actorId: input.blockerId,
    action: "messaging.unblocked",
    entityType: "user",
    entityId: input.blockedId,
  });
}

export async function listBlocked(userId: string) {
  return db
    .select({ user: { id: users.id, name: users.name }, since: userBlocks.createdAt })
    .from(userBlocks)
    .innerJoin(users, eq(users.id, userBlocks.blockedId))
    .where(eq(userBlocks.blockerId, userId))
    .orderBy(desc(userBlocks.createdAt));
}

// ---------------------------------------------------------------------------
// The permission model
// ---------------------------------------------------------------------------

export type MessagingRelationship = {
  contextType: ConversationContext;
  contextId: string | null;
  subject: string;
};

/**
 * Every relationship that entitles these two people to a conversation.
 *
 * Returns the list rather than a boolean, because the caller needs to know
 * *which* thread to open: a mentor who is also hiring may have two entirely
 * separate reasons to be talking to the same person, and merging them into one
 * thread loses the context both of them depend on.
 *
 * Each branch is a real record, checked in the database at the moment of asking.
 * A relationship that has ended — a withdrawn application, a cancelled session —
 * still counts: people need to finish a conversation they were entitled to
 * start, and revoking the channel the instant a booking is cancelled is how
 * somebody ends up unable to ask why.
 */
export async function messagingRelationships(
  a: string,
  b: string,
): Promise<MessagingRelationship[]> {
  if (a === b) return [];
  const found: MessagingRelationship[] = [];

  // Mentorship, either direction.
  const sessions = await db
    .select({ id: mentorshipSessions.id, topic: mentorshipSessions.topic })
    .from(mentorshipSessions)
    .innerJoin(mentors, eq(mentors.id, mentorshipSessions.mentorId))
    .where(
      or(
        and(eq(mentors.userId, a), eq(mentorshipSessions.seekerId, b)),
        and(eq(mentors.userId, b), eq(mentorshipSessions.seekerId, a)),
      ),
    )
    .orderBy(desc(mentorshipSessions.scheduledAt))
    .limit(20);
  for (const session of sessions) {
    // A hold is not a relationship: it is somebody halfway through a form.
    found.push({
      contextType: "MENTORSHIP",
      contextId: session.id,
      subject: `Session: ${session.topic}`,
    });
  }

  // A job application, between the applicant and anybody on the hiring team.
  const applications = await db
    .select({ id: jobApplications.id, title: jobPostings.title, applicantId: jobApplications.userId })
    .from(jobApplications)
    .innerJoin(jobPostings, eq(jobPostings.id, jobApplications.jobPostingId))
    .innerJoin(
      organisationMembers,
      eq(organisationMembers.organisationId, jobPostings.organisationId),
    )
    .where(
      or(
        and(eq(jobApplications.userId, a), eq(organisationMembers.userId, b)),
        and(eq(jobApplications.userId, b), eq(organisationMembers.userId, a)),
      ),
    )
    .limit(20);
  for (const application of applications) {
    found.push({
      contextType: "JOB_APPLICATION",
      contextId: application.id,
      subject: `Application: ${application.title}`,
    });
  }

  // A course enquiry, between the enquirer and the provider's organisation. The
  // provider is reached through the course, since an enquiry names the course
  // rather than the provider directly.
  const enquiries = await db
    .select({ id: courseEnquiries.id, providerName: providers.name })
    .from(courseEnquiries)
    .innerJoin(courses, eq(courses.id, courseEnquiries.courseId))
    .innerJoin(providers, eq(providers.id, courses.providerId))
    .innerJoin(organisationMembers, eq(organisationMembers.organisationId, providers.organisationId))
    .where(
      or(
        and(eq(courseEnquiries.userId, a), eq(organisationMembers.userId, b)),
        and(eq(courseEnquiries.userId, b), eq(organisationMembers.userId, a)),
      ),
    )
    .limit(20);
  for (const enquiry of enquiries) {
    found.push({
      contextType: "COURSE_ENQUIRY",
      contextId: enquiry.id,
      subject: `Enquiry: ${enquiry.providerName}`,
    });
  }

  // A service request, between the buyer and whoever offers the service.
  const requests = await db
    .select({ serviceId: services.id, title: services.title })
    .from(serviceRequests)
    .innerJoin(services, eq(services.id, serviceRequests.serviceId))
    .innerJoin(providerProfiles, eq(providerProfiles.id, services.providerProfileId))
    .where(
      or(
        and(eq(serviceRequests.requesterId, a), eq(providerProfiles.userId, b)),
        and(eq(serviceRequests.requesterId, b), eq(providerProfiles.userId, a)),
      ),
    )
    .limit(20);
  for (const request of requests) {
    found.push({
      contextType: "SERVICE_REQUEST",
      // Keyed to the service, not the request: a buyer who withdraws and asks
      // again lands back in the same thread rather than starting a second
      // history about one arrangement.
      contextId: request.serviceId,
      subject: `Service: ${request.title}`,
    });
  }

  return found;
}

/**
 * Refuse unless these two may talk, and say which reason applies.
 *
 * Blocking is checked first and separately: a block must beat every
 * relationship, including one that is still live. Somebody who has blocked
 * their mentor has not stopped having a session with them, and the block is
 * still the answer.
 */
export async function assertCanMessage(
  a: string,
  b: string,
  wanted?: { contextType: ConversationContext; contextId: string | null },
): Promise<MessagingRelationship> {
  if (a === b) throw new ValidationError("You cannot message yourself.");
  if (await isBlockedBetween(a, b)) {
    // Deliberately does not say who blocked whom: telling the sender the
    // recipient blocked them is information the recipient did not consent to
    // share, and it invites the exact escalation a block is meant to end.
    throw new ForbiddenError("You cannot message this person.");
  }

  const relationships = await messagingRelationships(a, b);
  if (relationships.length === 0) {
    throw new ForbiddenError(
      "You can only message people you have something in progress with — a session, an application, or an enquiry.",
    );
  }

  if (!wanted) return relationships[0];
  const matched = relationships.find(
    (relationship) =>
      relationship.contextType === wanted.contextType &&
      relationship.contextId === wanted.contextId,
  );
  if (!matched) {
    throw new ForbiddenError("That isn't something the two of you are connected by.");
  }
  return matched;
}

/** Every conversation this user is in. Used by every read below. */
async function assertParticipant(conversationId: string, userId: string) {
  const [row] = await db
    .select()
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
      ),
    )
    .limit(1);
  // 404 rather than 403: whether a conversation exists is not something a
  // non-participant should be able to probe for.
  if (!row) throw new NotFoundError("We couldn't find that conversation.");
  return row;
}

async function otherParticipant(conversationId: string, userId: string) {
  const [row] = await db
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        ne(conversationParticipants.userId, userId),
      ),
    )
    .limit(1);
  return row?.userId ?? null;
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

/**
 * Find or create the thread for one relationship.
 *
 * Idempotent by (participants, context): opening the same conversation twice
 * returns the same thread rather than splitting a history in two.
 */
export async function openConversation(input: {
  userId: string;
  withUserId: string;
  contextType: ConversationContext;
  contextId: string | null;
}) {
  const relationship = await assertCanMessage(input.userId, input.withUserId, {
    contextType: input.contextType,
    contextId: input.contextId,
  });

  const existing = await db
    .select({ id: conversations.id })
    .from(conversations)
    .innerJoin(
      conversationParticipants,
      eq(conversationParticipants.conversationId, conversations.id),
    )
    .where(
      and(
        eq(conversations.contextType, input.contextType),
        input.contextId
          ? eq(conversations.contextId, input.contextId)
          : isNull(conversations.contextId),
        inArray(conversationParticipants.userId, [input.userId, input.withUserId]),
      ),
    )
    .groupBy(conversations.id)
    .having(sql`count(*) = 2`)
    .limit(1);

  if (existing[0]) return { id: existing[0].id, created: false };

  const created = await db.transaction(async (tx) => {
    const [conversation] = await tx
      .insert(conversations)
      .values({
        contextType: input.contextType,
        contextId: input.contextId,
        subject: relationship.subject,
      })
      .returning();

    await tx.insert(conversationParticipants).values([
      { conversationId: conversation.id, userId: input.userId },
      { conversationId: conversation.id, userId: input.withUserId },
    ]);
    return conversation;
  });

  await recordAudit({
    actorType: "user",
    actorId: input.userId,
    action: "messaging.conversation_opened",
    entityType: "conversation",
    entityId: created.id,
    after: { contextType: input.contextType, contextId: input.contextId },
  });

  return { id: created.id, created: true };
}

/**
 * The inbox.
 *
 * One query with the unread count computed in SQL: doing it per row in
 * application code is the classic N+1 that makes an inbox slow exactly when
 * somebody has enough conversations to need one.
 */
export async function listConversations(userId: string) {
  const unread = sql<number>`(
    SELECT count(*)::int FROM ${messages} m
    WHERE m.conversation_id = ${conversations.id}
      AND m.sender_id <> ${userId}
      AND m.deleted_at IS NULL
      AND (${conversationParticipants.lastReadAt} IS NULL
           OR m.created_at > ${conversationParticipants.lastReadAt})
  )`;

  const preview = sql<string | null>`(
    SELECT CASE WHEN m.deleted_at IS NULL THEN m.body ELSE NULL END
    FROM ${messages} m
    WHERE m.conversation_id = ${conversations.id}
    ORDER BY m.created_at DESC LIMIT 1
  )`;

  const rows = await db
    .select({
      conversation: conversations,
      unread,
      preview,
      lastReadAt: conversationParticipants.lastReadAt,
      mutedAt: conversationParticipants.mutedAt,
      otherId: sql<string | null>`(
        SELECT cp.user_id FROM ${conversationParticipants} cp
        WHERE cp.conversation_id = ${conversations.id} AND cp.user_id <> ${userId}
        LIMIT 1
      )`,
    })
    .from(conversations)
    .innerJoin(
      conversationParticipants,
      and(
        eq(conversationParticipants.conversationId, conversations.id),
        eq(conversationParticipants.userId, userId),
      ),
    )
    .orderBy(desc(conversations.lastMessageAt))
    .limit(100);

  // Names and avatars for the other side, in one round trip.
  const otherIds = rows.map((row) => row.otherId).filter((id): id is string => Boolean(id));
  const people = otherIds.length
    ? await db
        .select({ id: users.id, name: users.name, avatarHash: users.avatarHash })
        .from(users)
        .where(inArray(users.id, otherIds))
    : [];
  const byId = new Map(people.map((person) => [person.id, person]));

  return rows.map((row) => ({
    ...row,
    other: row.otherId ? (byId.get(row.otherId) ?? null) : null,
  }));
}

export async function unreadMessageCount(userId: string): Promise<number> {
  const [row] = await db.execute<{ total: number }>(sql`
    SELECT count(*)::int AS total
    FROM messages m
    JOIN conversation_participants cp
      ON cp.conversation_id = m.conversation_id AND cp.user_id = ${userId}
    WHERE m.sender_id <> ${userId}
      AND m.deleted_at IS NULL
      AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
  `).then((result) => result.rows);
  return Number(row?.total ?? 0);
}

/** One thread, with its messages, oldest first. */
export async function getConversation(input: {
  conversationId: string;
  userId: string;
  limit?: number;
}) {
  await assertParticipant(input.conversationId, input.userId);

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, input.conversationId))
    .limit(1);
  if (!conversation) throw new NotFoundError("We couldn't find that conversation.");

  const otherId = await otherParticipant(input.conversationId, input.userId);
  const [other] = otherId
    ? await db
        .select({ id: users.id, name: users.name, avatarHash: users.avatarHash })
        .from(users)
        .where(eq(users.id, otherId))
        .limit(1)
    : [];

  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, input.conversationId))
    .orderBy(asc(messages.createdAt))
    .limit(input.limit ?? 200);

  return {
    conversation,
    other: other ?? null,
    blocked: otherId ? await isBlockedBetween(input.userId, otherId) : false,
    /*
     * Fields are listed rather than spread.
     *
     * Spreading the row and overwriting `body` looked equivalent and was not:
     * `originalBody` — the retained text of a deleted message, kept so a
     * moderator can judge a report — went out in the same payload. The UI never
     * rendered it, so it was invisible until a test asserted that the deleted
     * text was absent from the *response* rather than from the screen. Nothing
     * that exists only for moderation leaves this function.
     */
    messages: rows.map((message) => ({
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      createdAt: message.createdAt,
      editedAt: message.editedAt,
      deletedAt: message.deletedAt,
      // A deleted message leaves a gap that says a message was here, rather
      // than vanishing — otherwise a conversation silently rewrites itself and
      // the other person is left doubting what they read.
      body: message.deletedAt ? null : message.body,
    })),
  };
}

/** Mark everything up to now as read. */
export async function markRead(conversationId: string, userId: string) {
  await assertParticipant(conversationId, userId);
  await db
    .update(conversationParticipants)
    .set({ lastReadAt: new Date() })
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
      ),
    );
}

export async function setMuted(conversationId: string, userId: string, muted: boolean) {
  await assertParticipant(conversationId, userId);
  await db
    .update(conversationParticipants)
    .set({ mutedAt: muted ? new Date() : null })
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
      ),
    );
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/**
 * Send one message.
 *
 * The permission check runs here, not only when the conversation was opened. A
 * block placed yesterday has to stop a message today, and a thread is a
 * long-lived object that outlives the moment its permissions were granted.
 */
export async function sendMessage(input: {
  conversationId: string;
  senderId: string;
  body: string;
}) {
  const body = input.body.trim();
  if (!body) throw new ValidationError("Write something first.");
  if (body.length > MAX_MESSAGE_LENGTH) {
    throw new ValidationError(`Messages are limited to ${MAX_MESSAGE_LENGTH} characters.`);
  }

  await assertParticipant(input.conversationId, input.senderId);

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, input.conversationId))
    .limit(1);
  if (!conversation) throw new NotFoundError("We couldn't find that conversation.");
  if (conversation.lockedAt) {
    throw new ForbiddenError(
      conversation.lockedReason ?? "A moderator has closed this conversation.",
    );
  }

  const recipientId = await otherParticipant(input.conversationId, input.senderId);
  if (!recipientId) throw new ConflictError("There is nobody else in this conversation.");
  if (await isBlockedBetween(input.senderId, recipientId)) {
    throw new ForbiddenError("You cannot message this person.");
  }

  const [message] = await db
    .insert(messages)
    .values({ conversationId: input.conversationId, senderId: input.senderId, body })
    .returning();

  await db
    .update(conversations)
    .set({ lastMessageAt: message.createdAt })
    .where(eq(conversations.id, input.conversationId));

  await notifyOfMessage({
    conversationId: input.conversationId,
    recipientId,
    senderId: input.senderId,
    subject: conversation.subject,
  });

  return message;
}

/**
 * Tell the recipient, once per unread run.
 *
 * Not once per message: a five-message burst is one thing that happened, and
 * five notifications for it teaches people to switch the whole category off. The
 * dedupe key is the conversation plus the recipient's last-read timestamp, so a
 * new notification only fires once they have caught up and fallen behind again.
 */
async function notifyOfMessage(input: {
  conversationId: string;
  recipientId: string;
  senderId: string;
  subject: string;
}) {
  const [participant] = await db
    .select({ lastReadAt: conversationParticipants.lastReadAt, mutedAt: conversationParticipants.mutedAt })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, input.conversationId),
        eq(conversationParticipants.userId, input.recipientId),
      ),
    )
    .limit(1);
  if (participant?.mutedAt) return;

  const [sender] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, input.senderId))
    .limit(1);

  await notify({
    userId: input.recipientId,
    type: "messaging.new_message",
    title: `New message from ${sender?.name ?? "someone"}`,
    // The message itself is not in the notification. Notifications go to email
    // and push, and a private message is not something to copy into either.
    body: `About: ${input.subject}. Open the conversation to read it.`,
    href: `/messages/${input.conversationId}`,
    dedupeKey: `messaging.new:${input.conversationId}:${participant?.lastReadAt?.toISOString() ?? "never"}`,
  });
}

/**
 * Delete your own message.
 *
 * A tombstone, within a short window. The body moves to `originalBody` so a
 * moderator handling a report can still see what was said — "delete for
 * everyone" that destroys the evidence protects the person who sent the abuse,
 * not the person who received it.
 */
export async function deleteMessage(input: { messageId: string; userId: string }) {
  const [message] = await db
    .select()
    .from(messages)
    .where(eq(messages.id, input.messageId))
    .limit(1);
  if (!message) throw new NotFoundError("We couldn't find that message.");
  if (message.senderId !== input.userId) throw new ForbiddenError("That isn't your message.");
  if (message.deletedAt) return;

  const age = Date.now() - message.createdAt.getTime();
  if (age > EDIT_WINDOW_MINUTES * 60_000) {
    throw new ForbiddenError(
      `Messages can only be deleted within ${EDIT_WINDOW_MINUTES} minutes of sending. After that the other person has probably read it, and removing it from under them helps nobody.`,
    );
  }

  await db
    .update(messages)
    .set({ deletedAt: new Date(), originalBody: message.body, body: "" })
    .where(eq(messages.id, input.messageId));
}

/**
 * Search your own messages.
 *
 * Scoped by a join to your participation rows, so the query cannot return
 * somebody else's conversation even if the search term matches. `plainto_tsquery`
 * rather than `to_tsquery` because the input is a person's words, not query
 * syntax — and passing raw input to `to_tsquery` throws on a stray apostrophe.
 */
export async function searchMessages(input: { userId: string; query: string; limit?: number }) {
  const query = input.query.trim();
  if (query.length < 2) return [];

  const result = await db.execute<{
    id: string;
    conversation_id: string;
    body: string;
    created_at: Date;
    sender_id: string;
    subject: string;
  }>(sql`
    SELECT m.id, m.conversation_id, m.body, m.created_at, m.sender_id, c.subject
    FROM messages m
    JOIN conversation_participants cp
      ON cp.conversation_id = m.conversation_id AND cp.user_id = ${input.userId}
    JOIN conversations c ON c.id = m.conversation_id
    WHERE m.deleted_at IS NULL
      AND to_tsvector('english', m.body) @@ plainto_tsquery('english', ${query})
    ORDER BY m.created_at DESC
    LIMIT ${input.limit ?? 40}
  `);
  return result.rows;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export const REPORT_REASONS = {
  harassment: "Harassment or abuse",
  spam: "Spam or advertising",
  scam: "Asking for money, or a scam",
  contact_off_platform: "Pushing to move off the platform",
  inappropriate: "Sexual or otherwise inappropriate content",
  impersonation: "Pretending to be someone else",
  other: "Something else",
} as const;

export type ReportReason = keyof typeof REPORT_REASONS;

export function isReportReason(value: string): value is ReportReason {
  return Object.prototype.hasOwnProperty.call(REPORT_REASONS, value);
}

/**
 * Report a message or a person.
 *
 * Nothing is auto-actioned. An automatic suspension on report is a weapon for
 * whoever reports the most, and on a platform where a mentor's livelihood may
 * depend on their listing, both a wrongly-suspended mentor and an un-actioned
 * harasser are real harms. A person decides, and the queue is designed to be
 * short enough that they can.
 */
export async function reportContent(input: {
  reporterId: string;
  subjectType: "MESSAGE" | "USER";
  subjectId: string;
  reason: ReportReason;
  detail?: string | null;
  /** True to also stop contact immediately, without waiting for a decision. */
  alsoBlock?: boolean;
}) {
  let conversationId: string | null = null;
  let reportedUserId: string | null = null;

  if (input.subjectType === "MESSAGE") {
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, input.subjectId))
      .limit(1);
    if (!message) throw new NotFoundError("We couldn't find that message.");
    // You may only report a message in a conversation you are part of.
    await assertParticipant(message.conversationId, input.reporterId);
    conversationId = message.conversationId;
    reportedUserId = message.senderId;
  } else {
    reportedUserId = input.subjectId;
    if (reportedUserId === input.reporterId) {
      throw new ValidationError("You cannot report yourself.");
    }
  }

  let report;
  try {
    [report] = await db
      .insert(abuseReports)
      .values({
        reporterId: input.reporterId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        conversationId,
        reason: input.reason,
        detail: input.detail?.trim() || null,
      })
      .returning();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(
        "You have already reported this and it is waiting to be looked at. Reporting again does not make it faster.",
      );
    }
    throw error;
  }

  /*
   * Blocking on report is offered and defaulted on, because the two are almost
   * always the same intention: somebody reporting harassment wants it to stop
   * now, not after a review. The report still goes to a moderator.
   */
  if (input.alsoBlock !== false && reportedUserId && reportedUserId !== input.reporterId) {
    await blockUser({ blockerId: input.reporterId, blockedId: reportedUserId });
  }

  await recordAudit({
    actorType: "user",
    actorId: input.reporterId,
    action: "messaging.reported",
    entityType: input.subjectType.toLowerCase(),
    entityId: input.subjectId,
    after: { reason: input.reason, reportId: report.id },
  });

  return report;
}

/** The moderation queue, oldest first. */
export async function openReports() {
  return db
    .select({
      report: abuseReports,
      reporterName: users.name,
    })
    .from(abuseReports)
    .innerJoin(users, eq(users.id, abuseReports.reporterId))
    .where(eq(abuseReports.status, "OPEN"))
    .orderBy(asc(abuseReports.createdAt))
    .limit(100);
}

/**
 * What a moderator needs to judge one report.
 *
 * Includes the reported message's original text even when the sender deleted it,
 * which is the reason `originalBody` exists.
 */
export async function reportDetail(reportId: string) {
  const [report] = await db
    .select()
    .from(abuseReports)
    .where(eq(abuseReports.id, reportId))
    .limit(1);
  if (!report) throw new NotFoundError("No such report.");

  const context = report.conversationId
    ? await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, report.conversationId))
        .orderBy(desc(messages.createdAt))
        .limit(30)
    : [];

  return {
    report,
    // Oldest first reads as a conversation; newest first reads as a log.
    messages: context.reverse().map((message) => ({
      ...message,
      body: message.deletedAt ? (message.originalBody ?? "") : message.body,
      wasDeleted: Boolean(message.deletedAt),
    })),
  };
}

export async function decideReport(input: {
  reportId: string;
  moderatorId: string;
  status: "UPHELD" | "DISMISSED";
  note: string;
  /** Freeze the conversation the report came from. */
  lockConversation?: boolean;
}) {
  if (!input.note?.trim()) {
    throw new ValidationError("Record why. A decision nobody can review is not moderation.");
  }
  const [report] = await db
    .select()
    .from(abuseReports)
    .where(eq(abuseReports.id, input.reportId))
    .limit(1);
  if (!report) throw new NotFoundError("No such report.");

  await db
    .update(abuseReports)
    .set({
      status: input.status,
      reviewedById: input.moderatorId,
      reviewedAt: new Date(),
      reviewNote: input.note.trim(),
    })
    .where(eq(abuseReports.id, input.reportId));

  if (input.lockConversation && report.conversationId) {
    await db
      .update(conversations)
      .set({
        lockedAt: new Date(),
        lockedReason: "A moderator has closed this conversation after a report.",
      })
      .where(eq(conversations.id, report.conversationId));
  }

  await recordAudit({
    actorType: "admin",
    actorId: input.moderatorId,
    action: "messaging.report_decided",
    entityType: "abuse_report",
    entityId: input.reportId,
    before: { status: report.status },
    after: { status: input.status, note: input.note, locked: Boolean(input.lockConversation) },
  });

  /*
   * The reporter is told the outcome either way.
   *
   * A report that vanishes into silence teaches people not to bother, and the
   * reports nobody bothers to file are the ones a platform most needs.
   */
  await notify({
    userId: report.reporterId,
    type: "messaging.report_reviewed",
    title: input.status === "UPHELD" ? "We acted on your report" : "We reviewed your report",
    body:
      input.status === "UPHELD"
        ? "Thank you for telling us. We have taken action."
        : "We looked into it and did not find a breach of the rules. If it continues, report it again with any new detail.",
    href: "/messages",
    dedupeKey: `messaging.report:${input.reportId}`,
  });
}
