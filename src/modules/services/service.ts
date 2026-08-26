/**
 * The services marketplace.
 *
 * The generic surface for what jobs, courses and mentoring are not: résumé
 * reviews, interview coaching, consulting, training. Those three kept their own
 * tables because they have real structure — a salary band, a batch, a bookable
 * slot — and flattening them into a generic "listing" would have lost the parts
 * that make each of them useful. This is for everything that does not have such
 * structure, and it stays deliberately thin.
 *
 * Two decisions worth stating before the code:
 *
 * **A request, not a purchase.** No money moves through this platform. A "Buy"
 * button that takes no payment and creates no obligation would misrepresent what
 * happens next, which is that two people start talking. Requesting a service
 * opens a conversation, and the arrangement gets made there.
 *
 * **The same moderation as jobs.** A listing somebody writes, submits, and can
 * have taken down is the same problem twice; giving it a second vocabulary would
 * mean two sets of states to reason about for no gain a user could see.
 */
import { and, asc, desc, eq, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import {
  countries,
  providerCapabilities,
  providerProfiles,
  serviceModerationReviews,
  serviceRequests,
  services,
  users,
} from "@/db/schema";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  isUniqueViolation,
} from "@/modules/shared/errors";
import { likePattern } from "@/modules/shared/params";
import { recordAudit } from "@/modules/shared/audit";
import { notify } from "@/modules/notifications/service";
import { requireCapability } from "@/modules/providers/service";
import { openConversation } from "@/modules/messaging/service";

export type ServiceKind =
  | "RESUME_REVIEW"
  | "INTERVIEW_COACHING"
  | "CAREER_COACHING"
  | "CONSULTING"
  | "TRAINING"
  | "PORTFOLIO_REVIEW"
  | "OTHER";

export type ServiceStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "ACTIVE"
  | "REJECTED"
  | "PAUSED"
  | "SUSPENDED"
  | "ARCHIVED";

export const SERVICE_KINDS: Record<ServiceKind, { label: string; blurb: string }> = {
  RESUME_REVIEW: {
    label: "Résumé review",
    blurb: "Somebody reads your CV and tells you what a recruiter would think.",
  },
  INTERVIEW_COACHING: {
    label: "Interview coaching",
    blurb: "Practice with someone who has sat on the other side of the table.",
  },
  CAREER_COACHING: {
    label: "Career coaching",
    blurb: "Working out what to aim at, and what it would take.",
  },
  CONSULTING: { label: "Consulting", blurb: "Advice on a specific problem, priced per engagement." },
  TRAINING: { label: "Training", blurb: "Structured teaching of a particular skill." },
  PORTFOLIO_REVIEW: {
    label: "Portfolio review",
    blurb: "Feedback on work you have produced, from somebody who hires for it.",
  },
  OTHER: { label: "Something else", blurb: "Professional help that does not fit the categories." },
};

export const SERVICE_DELIVERY: Record<string, string> = {
  LIVE_SESSION: "A live call at a booked time",
  ASYNC_REVIEW: "You send something, they send it back",
  WRITTEN_DELIVERABLE: "A written report or plan",
  PROGRAMME: "Several sessions over a period",
};

export const SERVICE_STATUS_META: Record<
  ServiceStatus,
  { label: string; tone: "good" | "warn" | "bad" | "neutral" | "brand"; blurb: string }
> = {
  DRAFT: { label: "Draft", tone: "neutral", blurb: "Only you can see this. Submit it when ready." },
  SUBMITTED: { label: "Submitted", tone: "brand", blurb: "Waiting for a moderator to pick it up." },
  UNDER_REVIEW: { label: "Under review", tone: "brand", blurb: "A moderator has it open now." },
  ACTIVE: { label: "Listed", tone: "good", blurb: "Visible in the directory and taking requests." },
  REJECTED: {
    label: "Not approved",
    tone: "bad",
    blurb: "See the reason below. Editing it moves it back to draft so you can resubmit.",
  },
  PAUSED: {
    label: "Paused",
    tone: "warn",
    blurb: "Hidden from the directory by you. Nothing is lost — list it again whenever.",
  },
  SUSPENDED: { label: "Suspended", tone: "bad", blurb: "Taken down by a moderator." },
  ARCHIVED: { label: "Archived", tone: "neutral", blurb: "Put away. Restorable." },
};

const TRANSITIONS: Record<ServiceStatus, ServiceStatus[]> = {
  DRAFT: ["SUBMITTED", "ARCHIVED"],
  SUBMITTED: ["UNDER_REVIEW", "ACTIVE", "REJECTED", "DRAFT", "ARCHIVED"],
  UNDER_REVIEW: ["ACTIVE", "REJECTED", "DRAFT", "ARCHIVED"],
  ACTIVE: ["PAUSED", "SUSPENDED", "ARCHIVED"],
  REJECTED: ["DRAFT", "ARCHIVED"],
  PAUSED: ["ACTIVE", "ARCHIVED", "DRAFT"],
  // Only a moderator lifts a suspension, and it goes back through review.
  SUSPENDED: ["UNDER_REVIEW", "REJECTED", "ARCHIVED"],
  ARCHIVED: ["DRAFT"],
};

function assertTransition(from: ServiceStatus, to: ServiceStatus) {
  if (from === to) {
    throw new ConflictError(`That service is already ${SERVICE_STATUS_META[to].label.toLowerCase()}.`);
  }
  if (!TRANSITIONS[from]?.includes(to)) {
    throw new ConflictError(
      `A ${SERVICE_STATUS_META[from].label.toLowerCase()} service cannot become ${SERVICE_STATUS_META[to].label.toLowerCase()}.`,
    );
  }
}

/**
 * Listed, and offered by somebody who wants to be found.
 *
 * The visibility half was missing until an adversarial pass found the same gap
 * in the mentor listing: a provider who set their profile to HIDDEN still had
 * their services in the directory. The setting exists on the person, so it has
 * to be honoured everywhere the person is surfaced, not only on their own page.
 */
export function listableCondition(): SQL {
  return and(eq(services.status, "ACTIVE"), eq(providerProfiles.visibility, "PUBLIC"))!;
}

// ---------------------------------------------------------------------------
// Screening
// ---------------------------------------------------------------------------

/**
 * Automated flags, raised for a human to judge.
 *
 * The same approach as job screening: these are not rejections, and none of them
 * blocks submission. They are what a moderator sees first, so the ones that
 * matter get looked at first. A service marketplace attracts exactly two things
 * worth catching early — guaranteed-outcome claims, and attempts to move the
 * transaction somewhere with no record of it.
 */
export const SERVICE_FLAG_LABELS: Record<string, string> = {
  guarantees_outcome: "Guarantees a job, a score or a result",
  directs_off_platform: "Pushes contact to a personal number or address",
  asks_for_payment_upfront: "Asks for payment before any conversation",
  vague_deliverables: "No concrete deliverable — what the buyer gets is unclear",
};

export function screenService(input: {
  title: string;
  summary: string;
  description: string;
  deliverables?: string[] | null;
}): string[] {
  const text = `${input.title} ${input.summary} ${input.description}`.toLowerCase();
  const flags: string[] = [];

  if (/\b(guarantee[ds]?|assured|100%\s*(job|placement|selection)|sure\s*shot)\b/.test(text)) {
    flags.push("guarantees_outcome");
  }
  if (/\b(whatsapp|telegram|dm me|direct message|my personal|\+91[\s-]?\d{10}|\b\d{10}\b)\b/.test(text)) {
    flags.push("directs_off_platform");
  }
  if (/\b(advance payment|pay first|upfront fee|registration fee|deposit)\b/.test(text)) {
    flags.push("asks_for_payment_upfront");
  }
  if ((input.deliverables?.length ?? 0) === 0 && input.description.trim().length < 200) {
    flags.push("vague_deliverables");
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type ServiceFilters = {
  kind?: ServiceKind;
  delivery?: string;
  freeOnly?: boolean;
  maxPrice?: number;
  search?: string;
  countryIso?: string;
  page?: number;
  perPage?: number;
};

export async function listServices(filters: ServiceFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.min(48, Math.max(6, filters.perPage ?? 18));

  const conditions: SQL[] = [listableCondition()];
  if (filters.kind) conditions.push(eq(services.kind, filters.kind));
  if (filters.delivery) conditions.push(eq(services.delivery, filters.delivery as never));
  if (filters.freeOnly) conditions.push(eq(services.price, 0));
  if (filters.maxPrice != null) {
    conditions.push(sql`${services.price} IS NOT NULL AND ${services.price} <= ${filters.maxPrice}`);
  }
  if (filters.countryIso) {
    // A service with no country is offered everywhere — remote work has no
    // reason to be hidden from a neighbouring market.
    conditions.push(
      or(isNull(services.countryId), eq(countries.isoCode, filters.countryIso))!,
    );
  }
  if (filters.search?.trim()) {
    const term = likePattern(filters.search);
    conditions.push(
      or(
        sql`lower(${services.title}) LIKE ${term}`,
        sql`lower(${services.summary}) LIKE ${term}`,
        sql`lower(${providerProfiles.displayName}) LIKE ${term}`,
      )!,
    );
  }

  const where = and(...conditions);

  const rows = await db
    .select({
      service: services,
      provider: {
        id: providerProfiles.id,
        displayName: providerProfiles.displayName,
        headline: providerProfiles.headline,
        userId: providerProfiles.userId,
      },
      avatarHash: users.avatarHash,
    })
    .from(services)
    .innerJoin(providerProfiles, eq(providerProfiles.id, services.providerProfileId))
    .innerJoin(users, eq(users.id, providerProfiles.userId))
    .leftJoin(countries, eq(countries.id, services.countryId))
    .where(where)
    .orderBy(desc(services.updatedAt))
    .limit(perPage)
    .offset((page - 1) * perPage);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(services)
    .innerJoin(providerProfiles, eq(providerProfiles.id, services.providerProfileId))
    .innerJoin(users, eq(users.id, providerProfiles.userId))
    .leftJoin(countries, eq(countries.id, services.countryId))
    .where(where);

  return { items: rows, total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}

/**
 * One service by slug.
 *
 * `canSeeUnlisted` lets its own provider and moderators open a draft. Everyone
 * else gets the listed rule — and a 404, not a 403, so the existence of an
 * unpublished listing is not something to probe for.
 */
export async function getServiceBySlug(
  slug: string,
  viewer?: { userId?: string | null; canSeeUnlisted?: boolean },
) {
  const [row] = await db
    .select({
      service: services,
      provider: providerProfiles,
      avatarHash: users.avatarHash,
      providerUserId: users.id,
    })
    .from(services)
    .innerJoin(providerProfiles, eq(providerProfiles.id, services.providerProfileId))
    .innerJoin(users, eq(users.id, providerProfiles.userId))
    .where(eq(services.slug, slug))
    .limit(1);

  if (!row) throw new NotFoundError("That service isn't available.");

  const isOwner = viewer?.userId && viewer.userId === row.providerUserId;
  if (row.service.status !== "ACTIVE" && !isOwner && !viewer?.canSeeUnlisted) {
    throw new NotFoundError("That service isn't available.");
  }
  // LIMITED still resolves by direct link — that is what the setting means.
  // HIDDEN does not, for anybody but its owner and a moderator.
  if (row.provider.visibility === "HIDDEN" && !isOwner && !viewer?.canSeeUnlisted) {
    throw new NotFoundError("That service isn't available.");
  }
  return { ...row, isOwner: Boolean(isOwner) };
}

/** Everything one provider offers, whatever its state. */
export async function listOwnServices(userId: string) {
  const rows = await db
    .select({
      service: services,
      openRequests: sql<number>`(
        SELECT count(*)::int FROM ${serviceRequests} sr
        WHERE sr.service_id = ${services.id} AND sr.status = 'REQUESTED'
      )`,
    })
    .from(services)
    .innerJoin(providerProfiles, eq(providerProfiles.id, services.providerProfileId))
    .where(eq(providerProfiles.userId, userId))
    .orderBy(desc(services.updatedAt));
  return rows;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type ServiceInput = {
  kind: ServiceKind;
  title: string;
  summary: string;
  description: string;
  deliverables?: string[] | null;
  delivery: "LIVE_SESSION" | "ASYNC_REVIEW" | "WRITTEN_DELIVERABLE" | "PROGRAMME";
  price?: number | null;
  priceOnRequest?: boolean;
  currencyCode?: string;
  durationMinutes?: number | null;
  turnaroundDays?: number | null;
  countryId?: string | null;
  languages?: string[] | null;
};

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function validate(input: ServiceInput) {
  if (input.title.trim().length < 6) {
    throw new ValidationError("Give the service a title of at least six characters.");
  }
  if (input.summary.trim().length < 20) {
    throw new ValidationError("The summary is the line people read in a list. Say what they get.");
  }
  if (input.description.trim().length < 100) {
    throw new ValidationError(
      "A description under a hundred characters tells a buyer nothing. Say what happens, and what they end up with.",
    );
  }
  /*
   * Price is required unless explicitly on request.
   *
   * Leaving it blank is how a directory fills with listings whose cost you can
   * only learn by asking, which wastes the buyer's time and the provider's. "On
   * request" is a legitimate answer for consulting and is offered as one — but
   * it has to be chosen rather than defaulted into.
   */
  if (!input.priceOnRequest && (input.price == null || input.price < 0)) {
    throw new ValidationError(
      "Give a price, or tick 'priced per engagement' if it genuinely depends on the work.",
    );
  }
  if (input.price != null && input.price > 10_000_000) {
    throw new ValidationError("That price looks like a mistake.");
  }
  if (input.durationMinutes != null && (input.durationMinutes < 5 || input.durationMinutes > 2400)) {
    throw new ValidationError("Duration should be between 5 minutes and 40 hours.");
  }
  if (input.turnaroundDays != null && (input.turnaroundDays < 0 || input.turnaroundDays > 180)) {
    throw new ValidationError("Turnaround should be between 0 and 180 days.");
  }
  for (const deliverable of input.deliverables ?? []) {
    if (deliverable.trim().length < 3) {
      throw new ValidationError("Each deliverable needs to say something.");
    }
  }
}

/**
 * Create a service. Starts as a draft — nothing is public until it is submitted
 * and approved.
 */
export async function createService(input: { userId: string; data: ServiceInput }) {
  const profile = await requireCapability(input.userId, "SERVICE_PROVIDER");
  validate(input.data);

  // Slug collisions are resolved with a short suffix rather than refused: two
  // people may legitimately both offer "Résumé review for freshers".
  const base = slugify(input.data.title);
  let slug = base;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const [clash] = await db
      .select({ id: services.id })
      .from(services)
      .where(eq(services.slug, slug))
      .limit(1);
    if (!clash) break;
    slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const [created] = await db
    .insert(services)
    .values({
      providerProfileId: profile.id,
      kind: input.data.kind,
      title: input.data.title.trim(),
      slug,
      summary: input.data.summary.trim(),
      description: input.data.description.trim(),
      deliverables: input.data.deliverables?.filter((d) => d.trim()) ?? null,
      delivery: input.data.delivery,
      price: input.data.priceOnRequest ? null : (input.data.price ?? 0),
      priceOnRequest: input.data.priceOnRequest ?? false,
      currencyCode: input.data.currencyCode ?? "INR",
      durationMinutes: input.data.durationMinutes ?? null,
      turnaroundDays: input.data.turnaroundDays ?? null,
      countryId: input.data.countryId ?? profile.countryId ?? null,
      languages: input.data.languages ?? (profile.languages as string[] | null),
      status: "DRAFT",
    })
    .returning();

  await recordAudit({
    actorType: "user",
    actorId: input.userId,
    action: "service.created",
    entityType: "service",
    entityId: created.id,
    after: { title: created.title, kind: created.kind },
  });

  return created;
}

async function assertOwned(serviceId: string, userId: string) {
  const [row] = await db
    .select({ service: services, providerUserId: providerProfiles.userId })
    .from(services)
    .innerJoin(providerProfiles, eq(providerProfiles.id, services.providerProfileId))
    .where(eq(services.id, serviceId))
    .limit(1);
  if (!row) throw new NotFoundError("That service doesn't exist.");
  if (row.providerUserId !== userId) throw new ForbiddenError("That isn't your service.");
  return row.service;
}

/**
 * Edit a service.
 *
 * A listed service returns to DRAFT when edited, for the same reason a job
 * posting does: what a moderator approved is not what would then be public.
 */
export async function updateService(input: {
  serviceId: string;
  userId: string;
  data: Partial<ServiceInput>;
}) {
  const existing = await assertOwned(input.serviceId, input.userId);
  const merged = { ...existing, ...input.data } as ServiceInput;
  validate(merged);

  const returnsToDraft = existing.status === "ACTIVE" || existing.status === "PAUSED";

  const [updated] = await db
    .update(services)
    .set({
      ...(input.data.kind ? { kind: input.data.kind } : {}),
      ...(input.data.title ? { title: input.data.title.trim() } : {}),
      ...(input.data.summary ? { summary: input.data.summary.trim() } : {}),
      ...(input.data.description ? { description: input.data.description.trim() } : {}),
      ...(input.data.deliverables !== undefined
        ? { deliverables: input.data.deliverables?.filter((d) => d.trim()) ?? null }
        : {}),
      ...(input.data.delivery ? { delivery: input.data.delivery } : {}),
      ...(input.data.priceOnRequest !== undefined
        ? { priceOnRequest: input.data.priceOnRequest, price: input.data.priceOnRequest ? null : (input.data.price ?? 0) }
        : input.data.price !== undefined
          ? { price: input.data.price }
          : {}),
      ...(input.data.durationMinutes !== undefined
        ? { durationMinutes: input.data.durationMinutes }
        : {}),
      ...(input.data.turnaroundDays !== undefined
        ? { turnaroundDays: input.data.turnaroundDays }
        : {}),
      ...(input.data.languages !== undefined ? { languages: input.data.languages } : {}),
      ...(returnsToDraft ? { status: "DRAFT" as const } : {}),
      updatedAt: new Date(),
    })
    .where(eq(services.id, input.serviceId))
    .returning();

  return { service: updated, returnedToDraft: returnsToDraft };
}

export async function submitService(serviceId: string, userId: string) {
  const existing = await assertOwned(serviceId, userId);
  assertTransition(existing.status as ServiceStatus, "SUBMITTED");

  const flags = screenService(existing);
  await db.update(services).set({ status: "SUBMITTED" }).where(eq(services.id, serviceId));
  await db.insert(serviceModerationReviews).values({
    serviceId,
    decision: "submitted",
    automatedFlags: flags.length ? flags : null,
  });

  await recordAudit({
    actorType: "user",
    actorId: userId,
    action: "service.submitted",
    entityType: "service",
    entityId: serviceId,
    after: { flags },
  });

  return { flags };
}

/** Provider-side pause, resume, archive, restore. */
export async function setServiceState(input: {
  serviceId: string;
  userId: string;
  to: "PAUSED" | "ACTIVE" | "ARCHIVED" | "DRAFT";
}) {
  const existing = await assertOwned(input.serviceId, input.userId);

  // Resuming a paused service does not need re-approval: it is the same listing
  // a moderator already read, unchanged.
  assertTransition(existing.status as ServiceStatus, input.to);

  await db.update(services).set({ status: input.to, updatedAt: new Date() }).where(eq(services.id, input.serviceId));
  await recordAudit({
    actorType: "user",
    actorId: input.userId,
    action: `service.${input.to.toLowerCase()}`,
    entityType: "service",
    entityId: input.serviceId,
    before: { status: existing.status },
    after: { status: input.to },
  });
  return { status: input.to };
}

export async function setAcceptingRequests(input: {
  serviceId: string;
  userId: string;
  accepting: boolean;
}) {
  await assertOwned(input.serviceId, input.userId);
  await db
    .update(services)
    .set({ acceptingRequests: input.accepting, updatedAt: new Date() })
    .where(eq(services.id, input.serviceId));
}

// ---------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------

export async function pendingServices() {
  return db
    .select({
      service: services,
      provider: providerProfiles,
      email: users.email,
      flags: sql<string[] | null>`(
        SELECT smr.automated_flags FROM ${serviceModerationReviews} smr
        WHERE smr.service_id = ${services.id} AND smr.automated_flags IS NOT NULL
        ORDER BY smr.created_at DESC LIMIT 1
      )`,
    })
    .from(services)
    .innerJoin(providerProfiles, eq(providerProfiles.id, services.providerProfileId))
    .innerJoin(users, eq(users.id, providerProfiles.userId))
    .where(inArray(services.status, ["SUBMITTED", "UNDER_REVIEW"]))
    .orderBy(asc(services.updatedAt));
}

export async function moderateService(input: {
  serviceId: string;
  moderatorId: string;
  decision: "start_review" | "approve" | "request_changes" | "reject" | "suspend";
  reason?: string | null;
}) {
  const [row] = await db
    .select({ service: services, providerUserId: providerProfiles.userId })
    .from(services)
    .innerJoin(providerProfiles, eq(providerProfiles.id, services.providerProfileId))
    .where(eq(services.id, input.serviceId))
    .limit(1);
  if (!row) throw new NotFoundError("That service doesn't exist.");

  const needsReason =
    input.decision === "reject" ||
    input.decision === "request_changes" ||
    input.decision === "suspend";
  if (needsReason && !input.reason?.trim()) {
    throw new ValidationError("Say why. A refusal without a reason is not actionable.");
  }

  const target: ServiceStatus =
    input.decision === "start_review"
      ? "UNDER_REVIEW"
      : input.decision === "approve"
        ? "ACTIVE"
        : input.decision === "request_changes"
          ? "DRAFT"
          : input.decision === "reject"
            ? "REJECTED"
            : "SUSPENDED";

  assertTransition(row.service.status as ServiceStatus, target);

  await db.insert(serviceModerationReviews).values({
    serviceId: input.serviceId,
    reviewerId: input.moderatorId,
    decision: input.decision,
    reason: input.reason?.trim() || null,
  });
  await db
    .update(services)
    .set({ status: target, updatedAt: new Date() })
    .where(eq(services.id, input.serviceId));

  await recordAudit({
    actorType: "admin",
    actorId: input.moderatorId,
    action: `service.${input.decision}`,
    entityType: "service",
    entityId: input.serviceId,
    before: { status: row.service.status },
    after: { status: target, reason: input.reason },
  });

  if (input.decision !== "start_review") {
    await notify({
      userId: row.providerUserId,
      type: "service.reviewed",
      title:
        target === "ACTIVE"
          ? `"${row.service.title}" is listed`
          : `"${row.service.title}" was reviewed`,
      body:
        target === "ACTIVE"
          ? "It is visible in the services directory and can take requests."
          : (input.reason?.trim() ?? "See your provider dashboard."),
      href: "/provider/services",
      dedupeKey: `service.reviewed:${input.serviceId}:${target}`,
    });
  }

  return { status: target };
}

export async function serviceModerationTrail(serviceId: string) {
  return db
    .select()
    .from(serviceModerationReviews)
    .where(eq(serviceModerationReviews.serviceId, serviceId))
    .orderBy(desc(serviceModerationReviews.createdAt))
    .limit(10);
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/**
 * Ask a provider for a service.
 *
 * Opens a conversation as well as a request row, because the request on its own
 * says almost nothing — what the buyer needs and what the provider can actually
 * do are worked out in the thread, and every arrangement made there stays on the
 * platform where it can be moderated.
 */
export async function requestService(input: {
  serviceId: string;
  requesterId: string;
  message?: string | null;
}) {
  const [row] = await db
    .select({ service: services, providerUserId: providerProfiles.userId })
    .from(services)
    .innerJoin(providerProfiles, eq(providerProfiles.id, services.providerProfileId))
    .where(eq(services.id, input.serviceId))
    .limit(1);
  if (!row) throw new NotFoundError("That service isn't available.");
  if (row.service.status !== "ACTIVE") {
    throw new NotFoundError("That service isn't available.");
  }
  if (!row.service.acceptingRequests) {
    throw new ConflictError(
      "This provider has paused new requests. The listing stays up so you can come back to it.",
    );
  }
  if (row.providerUserId === input.requesterId) {
    throw new ValidationError("That is your own service.");
  }

  let request;
  try {
    [request] = await db
      .insert(serviceRequests)
      .values({
        serviceId: input.serviceId,
        requesterId: input.requesterId,
        message: input.message?.trim() || null,
      })
      .returning();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(
        "You already have an open request for this. Continue it in your messages rather than starting another.",
      );
    }
    throw error;
  }

  /*
   * The conversation is opened by the *service*, not the request.
   *
   * A buyer who cancels and asks again should land back in the same thread —
   * keying it to the request id would leave two histories about one arrangement
   * and lose whatever was already agreed.
   */
  const conversation = await openConversation({
    userId: input.requesterId,
    withUserId: row.providerUserId,
    contextType: "SERVICE_REQUEST",
    contextId: input.serviceId,
  });

  if (input.message?.trim()) {
    const { sendMessage } = await import("@/modules/messaging/service");
    await sendMessage({
      conversationId: conversation.id,
      senderId: input.requesterId,
      body: input.message.trim(),
    });
  }

  await notify({
    userId: row.providerUserId,
    type: "service.requested",
    title: `Someone asked about "${row.service.title}"`,
    body: "Open the conversation to reply.",
    href: `/messages/${conversation.id}`,
    dedupeKey: `service.requested:${request.id}`,
  });

  await recordAudit({
    actorType: "user",
    actorId: input.requesterId,
    action: "service.requested",
    entityType: "service",
    entityId: input.serviceId,
    after: { requestId: request.id },
  });

  return { request, conversationId: conversation.id };
}

export async function listServiceRequests(userId: string) {
  return db
    .select({
      request: serviceRequests,
      service: { id: services.id, title: services.title, slug: services.slug },
      requesterName: users.name,
      requesterId: users.id,
      avatarHash: users.avatarHash,
    })
    .from(serviceRequests)
    .innerJoin(services, eq(services.id, serviceRequests.serviceId))
    .innerJoin(providerProfiles, eq(providerProfiles.id, services.providerProfileId))
    .innerJoin(users, eq(users.id, serviceRequests.requesterId))
    .where(eq(providerProfiles.userId, userId))
    .orderBy(desc(serviceRequests.createdAt))
    .limit(100);
}

export async function decideServiceRequest(input: {
  requestId: string;
  userId: string;
  status: "ACCEPTED" | "DECLINED" | "COMPLETED" | "CANCELLED";
  note?: string | null;
}) {
  const [row] = await db
    .select({
      request: serviceRequests,
      providerUserId: providerProfiles.userId,
      title: services.title,
      serviceId: services.id,
    })
    .from(serviceRequests)
    .innerJoin(services, eq(services.id, serviceRequests.serviceId))
    .innerJoin(providerProfiles, eq(providerProfiles.id, services.providerProfileId))
    .where(eq(serviceRequests.id, input.requestId))
    .limit(1);
  if (!row) throw new NotFoundError("No such request.");

  const isProvider = row.providerUserId === input.userId;
  const isRequester = row.request.requesterId === input.userId;
  if (!isProvider && !isRequester) throw new ForbiddenError("That isn't your request.");
  // A buyer may withdraw; only the provider accepts, declines or completes.
  if (!isProvider && input.status !== "CANCELLED") {
    throw new ForbiddenError("Only the provider can respond to a request.");
  }

  await db
    .update(serviceRequests)
    .set({ status: input.status, providerNote: input.note?.trim() || null, updatedAt: new Date() })
    .where(eq(serviceRequests.id, input.requestId));

  const recipientId = isProvider ? row.request.requesterId : row.providerUserId;
  await notify({
    userId: recipientId,
    type: "service.requested",
    title: `"${row.title}" — request ${input.status.toLowerCase()}`,
    body: input.note?.trim() ?? "Open your messages for the detail.",
    href: "/messages",
    dedupeKey: `service.request_decided:${input.requestId}:${input.status}`,
  });

  return { status: input.status };
}
