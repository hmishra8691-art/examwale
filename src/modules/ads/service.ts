/**
 * Advertising.
 *
 * A guidance product that takes advertising money has an obvious conflict, and
 * the only honest response is to make the conflict impossible to hide rather
 * than to promise it will be managed well. Four structural decisions:
 *
 *  1. **Adverts never enter ranking.** There is no "promoted" slot inside a
 *     careers list, a job search or an exam page's recommendations. Ads are
 *     served to named slots that sit outside result sets entirely. Nothing in
 *     this module can change the order of anything.
 *  2. **Disclosure is not optional.** `disclosureLabel` is NOT NULL, and the
 *     single component that renders a creative prints it. There is no code
 *     path that puts an advert on a page unlabelled.
 *  3. **Targeting is by subject, never by person.** A campaign may target an
 *     occupation group or an exam — the topic of the page. It cannot target a
 *     user's assessment results, salary expectations, documents, or anything
 *     else we know about them. `selectAds` does not take a user id.
 *  4. **Counting is aggregate.** Impressions and clicks are per creative per
 *     day. There is no row anywhere that says a person saw an advert.
 *
 * Paid plans switch adverts off entirely, which is checked by the caller
 * through `entitlements.adFree`.
 */
import { and, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { adCampaigns, adCreatives, adEvents, organisations } from "@/db/schema";
import { ForbiddenError, NotFoundError, ValidationError } from "@/modules/shared/errors";
import { recordAudit } from "@/modules/shared/audit";

/**
 * Named slots.
 *
 * Deliberately a closed list, and deliberately all outside result sets: a
 * sidebar, a footer strip, and the foot of an article. Adding a slot means
 * editing this constant, which is a change someone has to justify in review —
 * as opposed to a slot name being a free-form string an advertiser could aim
 * at anything.
 */
export const AD_SLOTS = {
  "careers-sidebar": "Careers pages — sidebar, below the content",
  "exams-sidebar": "Exam pages — sidebar, below the content",
  "jobs-footer": "Jobs list — below the results",
  "courses-footer": "Courses list — below the results",
  "dashboard-aside": "Dashboard — aside panel",
} as const;

export type AdSlot = keyof typeof AD_SLOTS;

export function isAdSlot(value: string): value is AdSlot {
  return value in AD_SLOTS;
}

export type ServedCreative = {
  id: string;
  headline: string;
  body: string;
  imageUrl: string | null;
  targetUrl: string;
  ctaLabel: string;
  disclosureLabel: string;
  advertiserName: string;
};

/**
 * Chooses adverts for a slot.
 *
 * Note what this function does NOT accept: a user id, a session, a profile.
 * Targeting inputs are properties of the *page* — which occupation group or
 * exam it is about — so the most this can know is what the reader is currently
 * looking at, which they can see too.
 */
export async function selectAds(input: {
  slot: AdSlot;
  countryId: string;
  occupationGroupId?: string | null;
  examId?: string | null;
  limit?: number;
}): Promise<ServedCreative[]> {
  const now = new Date();
  const limit = Math.min(3, Math.max(1, input.limit ?? 1));

  const rows = await db
    .select({
      creative: adCreatives,
      campaignId: adCampaigns.id,
      dailyImpressionCap: adCampaigns.dailyImpressionCap,
    })
    .from(adCreatives)
    .innerJoin(adCampaigns, eq(adCampaigns.id, adCreatives.campaignId))
    .where(
      and(
        eq(adCreatives.slot, input.slot),
        eq(adCreatives.isActive, true),
        eq(adCampaigns.status, "ACTIVE"),
        eq(adCampaigns.countryId, input.countryId),
        or(isNull(adCampaigns.startsOn), lte(adCampaigns.startsOn, now))!,
        or(isNull(adCampaigns.endsOn), gte(adCampaigns.endsOn, now))!,
        // Untargeted campaigns match every page; targeted ones must match this
        // page's subject.
        or(
          isNull(adCampaigns.targetOccupationGroupIds),
          input.occupationGroupId
            ? sql`${adCampaigns.targetOccupationGroupIds} @> ${JSON.stringify([input.occupationGroupId])}::jsonb`
            : sql`false`,
        )!,
        or(
          isNull(adCampaigns.targetExamIds),
          input.examId
            ? sql`${adCampaigns.targetExamIds} @> ${JSON.stringify([input.examId])}::jsonb`
            : sql`false`,
        )!,
      ),
    )
    .limit(limit * 3);

  if (!rows.length) return [];

  // Respect the daily impression cap, checked against today's aggregate count.
  const today = todayKey();
  const eligible: typeof rows = [];

  for (const row of rows) {
    if (row.dailyImpressionCap == null) {
      eligible.push(row);
      continue;
    }
    const [served] = await db
      .select({ count: adEvents.count })
      .from(adEvents)
      .where(
        and(
          eq(adEvents.creativeId, row.creative.id),
          eq(adEvents.type, "IMPRESSION"),
          eq(adEvents.day, today),
        ),
      )
      .limit(1);
    if ((served?.count ?? 0) < row.dailyImpressionCap) eligible.push(row);
  }

  return eligible.slice(0, limit).map((row) => ({
    id: row.creative.id,
    headline: row.creative.headline,
    body: row.creative.body,
    imageUrl: row.creative.imageUrl,
    targetUrl: row.creative.targetUrl,
    ctaLabel: row.creative.ctaLabel,
    // Never allowed to be blank; the DB column is NOT NULL with a default, and
    // this fallback exists so a future migration mistake cannot strip a label.
    disclosureLabel: row.creative.disclosureLabel || "Paid promotion",
    advertiserName: row.creative.advertiserName,
  }));
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Records an impression or click.
 *
 * An upsert onto a (creative, type, day) row. No user, no session, no
 * timestamp finer than the day — an advertiser gets the number they are billed
 * on, and the database never accumulates a record of who looked at what.
 */
export async function recordAdEvent(input: {
  creativeId: string;
  type: "IMPRESSION" | "CLICK";
}): Promise<void> {
  try {
    await db
      .insert(adEvents)
      .values({ creativeId: input.creativeId, type: input.type, day: todayKey(), count: 1 })
      .onConflictDoUpdate({
        target: [adEvents.creativeId, adEvents.type, adEvents.day],
        set: { count: sql`${adEvents.count} + 1` },
      });
  } catch (error) {
    // Counting must never break a page render or a click-through.
    console.error("[ads] failed to record event", input, error);
  }
}

/** Resolves a creative's destination for the click redirect. */
export async function getCreativeTarget(creativeId: string): Promise<string | null> {
  const [row] = await db
    .select({ targetUrl: adCreatives.targetUrl, isActive: adCreatives.isActive })
    .from(adCreatives)
    .where(eq(adCreatives.id, creativeId))
    .limit(1);
  if (!row || !row.isActive) return null;
  return row.targetUrl;
}

// ---------------------------------------------------------------------------
// Advertiser side
// ---------------------------------------------------------------------------

async function requireCampaignAccess(campaignId: string, userId: string) {
  const { organisationMembers } = await import("@/db/schema");

  const [row] = await db
    .select({ campaign: adCampaigns })
    .from(adCampaigns)
    .innerJoin(
      organisationMembers,
      eq(organisationMembers.organisationId, adCampaigns.organisationId),
    )
    .where(and(eq(adCampaigns.id, campaignId), eq(organisationMembers.userId, userId)))
    .limit(1);

  if (!row) throw new ForbiddenError("You don't have access to that campaign.");
  return row.campaign;
}

export async function listCampaigns(organisationId: string, userId: string) {
  const { organisationMembers } = await import("@/db/schema");

  const [member] = await db
    .select({ userId: organisationMembers.userId })
    .from(organisationMembers)
    .where(
      and(
        eq(organisationMembers.userId, userId),
        eq(organisationMembers.organisationId, organisationId),
      ),
    )
    .limit(1);
  if (!member) throw new ForbiddenError("You don't have access to that organisation.");

  return db
    .select({
      campaign: adCampaigns,
      creativeCount: sql<number>`(
        SELECT count(*)::int FROM ${adCreatives}
        WHERE ${adCreatives.campaignId} = ${adCampaigns.id}
      )`,
      impressions: sql<number>`(
        SELECT coalesce(sum(${adEvents.count}), 0)::int FROM ${adEvents}
        JOIN ${adCreatives} ON ${adCreatives.id} = ${adEvents.creativeId}
        WHERE ${adCreatives.campaignId} = ${adCampaigns.id} AND ${adEvents.type} = 'IMPRESSION'
      )`,
      clicks: sql<number>`(
        SELECT coalesce(sum(${adEvents.count}), 0)::int FROM ${adEvents}
        JOIN ${adCreatives} ON ${adCreatives.id} = ${adEvents.creativeId}
        WHERE ${adCreatives.campaignId} = ${adCampaigns.id} AND ${adEvents.type} = 'CLICK'
      )`,
    })
    .from(adCampaigns)
    .where(eq(adCampaigns.organisationId, organisationId))
    .orderBy(desc(adCampaigns.createdAt));
}

export async function createCampaign(input: {
  organisationId: string;
  userId: string;
  name: string;
  countryId: string;
  targetOccupationGroupIds?: string[] | null;
  targetExamIds?: string[] | null;
  dailyImpressionCap?: number | null;
  startsOn?: Date | null;
  endsOn?: Date | null;
}) {
  const { organisationMembers } = await import("@/db/schema");

  const [member] = await db
    .select({ userId: organisationMembers.userId })
    .from(organisationMembers)
    .where(
      and(
        eq(organisationMembers.userId, input.userId),
        eq(organisationMembers.organisationId, input.organisationId),
      ),
    )
    .limit(1);
  if (!member) throw new ForbiddenError("You don't have access to that organisation.");

  const [campaign] = await db
    .insert(adCampaigns)
    .values({
      organisationId: input.organisationId,
      name: input.name,
      countryId: input.countryId,
      targetOccupationGroupIds: input.targetOccupationGroupIds ?? null,
      targetExamIds: input.targetExamIds ?? null,
      dailyImpressionCap: input.dailyImpressionCap ?? null,
      startsOn: input.startsOn ?? null,
      endsOn: input.endsOn ?? null,
      createdById: input.userId,
      status: "DRAFT",
    })
    .returning();

  await recordAudit({
    actorType: "user",
    actorId: input.userId,
    action: "ad_campaign.created",
    entityType: "ad_campaign",
    entityId: campaign.id,
    after: { name: campaign.name },
  });

  return campaign;
}

export async function addCreative(input: {
  campaignId: string;
  userId: string;
  slot: string;
  headline: string;
  body: string;
  targetUrl: string;
  imageUrl?: string | null;
  ctaLabel?: string;
  advertiserName: string;
}) {
  await requireCampaignAccess(input.campaignId, input.userId);

  if (!isAdSlot(input.slot)) {
    throw new ValidationError("That isn't a slot adverts can be placed in.");
  }

  const [creative] = await db
    .insert(adCreatives)
    .values({
      campaignId: input.campaignId,
      slot: input.slot,
      headline: input.headline,
      body: input.body,
      imageUrl: input.imageUrl ?? null,
      targetUrl: input.targetUrl,
      ctaLabel: input.ctaLabel ?? "Learn more",
      advertiserName: input.advertiserName,
      // The label is never taken from advertiser input.
      disclosureLabel: "Paid promotion",
    })
    .returning();

  return creative;
}

export async function submitCampaignForReview(campaignId: string, userId: string) {
  const campaign = await requireCampaignAccess(campaignId, userId);

  const [{ creatives }] = await db
    .select({ creatives: sql<number>`count(*)::int` })
    .from(adCreatives)
    .where(eq(adCreatives.campaignId, campaignId));

  if (creatives === 0) {
    throw new ValidationError("Add at least one creative before submitting.");
  }

  const [updated] = await db
    .update(adCampaigns)
    .set({ status: "PENDING_REVIEW" })
    .where(eq(adCampaigns.id, campaign.id))
    .returning();

  await recordAudit({
    actorType: "user",
    actorId: userId,
    action: "ad_campaign.submitted",
    entityType: "ad_campaign",
    entityId: campaignId,
  });

  return updated;
}

export async function campaignPerformance(campaignId: string, userId: string) {
  await requireCampaignAccess(campaignId, userId);

  return db
    .select({
      creativeId: adEvents.creativeId,
      headline: adCreatives.headline,
      type: adEvents.type,
      day: adEvents.day,
      count: adEvents.count,
    })
    .from(adEvents)
    .innerJoin(adCreatives, eq(adCreatives.id, adEvents.creativeId))
    .where(eq(adCreatives.campaignId, campaignId))
    .orderBy(desc(adEvents.day))
    .limit(500);
}

// ---------------------------------------------------------------------------
// Admin review
// ---------------------------------------------------------------------------

export async function listCampaignsForReview() {
  return db
    .select({
      campaign: adCampaigns,
      organisation: organisations,
      creatives: sql<number>`(
        SELECT count(*)::int FROM ${adCreatives}
        WHERE ${adCreatives.campaignId} = ${adCampaigns.id}
      )`,
    })
    .from(adCampaigns)
    .innerJoin(organisations, eq(organisations.id, adCampaigns.organisationId))
    .where(eq(adCampaigns.status, "PENDING_REVIEW"))
    .orderBy(desc(adCampaigns.createdAt));
}

export async function listCreatives(campaignId: string) {
  return db.select().from(adCreatives).where(eq(adCreatives.campaignId, campaignId));
}

export async function reviewCampaign(input: {
  campaignId: string;
  adminId: string;
  decision: "ACTIVE" | "REJECTED";
  note?: string;
}) {
  const [campaign] = await db
    .select()
    .from(adCampaigns)
    .where(eq(adCampaigns.id, input.campaignId))
    .limit(1);
  if (!campaign) throw new NotFoundError("That campaign doesn't exist.");

  if (input.decision === "ACTIVE") {
    // An advertiser whose organisation we have not verified does not get to
    // buy attention from job-seekers.
    const [org] = await db
      .select({ verificationStatus: organisations.verificationStatus })
      .from(organisations)
      .where(eq(organisations.id, campaign.organisationId))
      .limit(1);

    if (!org || org.verificationStatus !== "VERIFIED") {
      throw new ValidationError(
        "The advertiser's organisation isn't verified. Verify it before running their campaign.",
      );
    }
  }

  const [updated] = await db
    .update(adCampaigns)
    .set({
      status: input.decision,
      reviewerId: input.adminId,
      reviewNote: input.note ?? null,
      reviewedAt: new Date(),
    })
    .where(eq(adCampaigns.id, input.campaignId))
    .returning();

  await recordAudit({
    actorType: "admin",
    actorId: input.adminId,
    action: "ad_campaign.reviewed",
    entityType: "ad_campaign",
    entityId: input.campaignId,
    after: { decision: input.decision, note: input.note },
  });

  return updated;
}
