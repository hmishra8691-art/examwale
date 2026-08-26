/**
 * Provider identity and capabilities.
 *
 * One person, one professional profile, and a set of things they offer. Before
 * this module a mentor and an employer were unrelated records with no way to be
 * the same human being: mentoring identity lived in `mentors`, coaching-centre
 * identity in `providers`, and an employer had no personal identity at all —
 * only an organisation. Somebody who mentors on Saturdays and posts jobs for
 * their employer on Tuesdays needed two accounts.
 *
 * The shape that fixes it is a profile plus capabilities, not a wider role enum.
 * `users.role` stays single-valued and answers "what may this account do to the
 * platform"; capabilities are multi-valued and answer "what does this person
 * offer". The Phase 2 brief asked for MENTOR and EMPLOYER as roles, which would
 * have forced the same false choice the brief exists to remove.
 *
 * Each capability is approved on its own terms, because the terms differ:
 * mentoring needs a verified credential, employing needs a verified
 * organisation, and holding one says nothing about the other.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  mentors,
  organisationMembers,
  providerCapabilities,
  providerProfiles,
  users,
} from "@/db/schema";
import { ForbiddenError, NotFoundError, ValidationError } from "@/modules/shared/errors";
import { recordAudit } from "@/modules/shared/audit";
import { notify } from "@/modules/notifications/service";
import { isValidTimeZone } from "@/modules/shared/timezone";

export type CapabilityKind = "MENTOR" | "EMPLOYER" | "COURSE_PROVIDER" | "SERVICE_PROVIDER";
export type CapabilityStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "REJECTED";

/**
 * What each capability is, and what it takes to be approved for it.
 *
 * The `gate` text is shown to the applicant before they apply and again while
 * they wait. A provider left guessing why they are still PENDING assumes they
 * have been forgotten, and emails to ask — which is a support cost created by
 * not writing one sentence down.
 */
export const CAPABILITIES: Record<
  CapabilityKind,
  {
    label: string;
    blurb: string;
    gate: string;
    /**
     * Where the work happens. Null when the capability can be granted but has no
     * management screen yet — better to say so than to link somebody to a 404
     * from their own dashboard.
     */
    href: string | null;
    applyHref: string;
  }
> = {
  MENTOR: {
    label: "Mentoring",
    blurb: "One-to-one sessions, booked against hours you publish.",
    gate: "A person checks at least one credential — an exam result, an employment record — before your profile is listed. Nothing you claim goes public unverified.",
    href: "/dashboard/mentor",
    applyHref: "/mentors/apply",
  },
  EMPLOYER: {
    label: "Hiring",
    blurb: "Post roles, review applicants, manage a team.",
    gate: "Your organisation must be verified before a posting can go live. Drafts work immediately.",
    href: "/employers/dashboard",
    applyHref: "/employers/register",
  },
  COURSE_PROVIDER: {
    label: "Courses",
    blurb: "List courses and batches, and receive enquiries.",
    gate: "Outcome claims are labelled by how well they are evidenced. A course with no evidence is still listed; it is just labelled honestly.",
    // Courses and batches exist and are seeded, but self-serve management for a
    // provider has not been built — the enquiry screens are read-only from the
    // provider side. Granting the capability is still meaningful: it is what a
    // later stage will check.
    href: null,
    applyHref: "/provider/apply?kind=COURSE_PROVIDER",
  },
  SERVICE_PROVIDER: {
    label: "Other services",
    blurb: "Résumé reviews, interview coaching, consulting.",
    gate: "Each listing is read by a person before it appears. Anything guaranteeing a job or a score is refused — nobody can promise that.",
    href: "/provider/services",
    applyHref: "/provider/apply?kind=SERVICE_PROVIDER",
  },
};

export const CAPABILITY_KINDS = Object.keys(CAPABILITIES) as CapabilityKind[];

export function isCapabilityKind(value: string): value is CapabilityKind {
  return Object.prototype.hasOwnProperty.call(CAPABILITIES, value);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type ProviderProfile = typeof providerProfiles.$inferSelect;
export type ProviderCapability = typeof providerCapabilities.$inferSelect;

export async function getProviderProfile(userId: string): Promise<ProviderProfile | null> {
  const [row] = await db
    .select()
    .from(providerProfiles)
    .where(eq(providerProfiles.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function getProviderProfileById(id: string): Promise<ProviderProfile | null> {
  const [row] = await db
    .select()
    .from(providerProfiles)
    .where(eq(providerProfiles.id, id))
    .limit(1);
  return row ?? null;
}

export async function listCapabilities(profileId: string): Promise<ProviderCapability[]> {
  return db
    .select()
    .from(providerCapabilities)
    .where(eq(providerCapabilities.providerProfileId, profileId))
    .orderBy(asc(providerCapabilities.kind));
}

/**
 * Everything the provider surfaces need in one call.
 *
 * Returns a null profile rather than throwing, because "not a provider" is the
 * normal state for most accounts and the caller usually wants to offer a signup
 * rather than handle an error.
 */
export async function getProviderContext(userId: string): Promise<{
  profile: ProviderProfile | null;
  capabilities: ProviderCapability[];
  active: CapabilityKind[];
}> {
  const profile = await getProviderProfile(userId);
  if (!profile) return { profile: null, capabilities: [], active: [] };

  const capabilities = await listCapabilities(profile.id);
  return {
    profile,
    capabilities,
    active: capabilities
      .filter((c) => c.status === "ACTIVE")
      .map((c) => c.kind as CapabilityKind),
  };
}

/**
 * Whether this account is a provider at all.
 *
 * Keyed on the profile existing, not on holding an approved capability. A first
 * version used `activeCapabilities` for the navigation link, which meant
 * somebody with an application under review had no way back to the page showing
 * them it was under review — the one place they wanted to look.
 */
export async function isProviderAccount(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: providerProfiles.id })
    .from(providerProfiles)
    .where(eq(providerProfiles.userId, userId))
    .limit(1);
  return Boolean(row);
}

/** Which capabilities this user actively holds. Cheap enough for navigation. */
export async function activeCapabilities(userId: string): Promise<CapabilityKind[]> {
  const rows = await db
    .select({ kind: providerCapabilities.kind })
    .from(providerCapabilities)
    .innerJoin(providerProfiles, eq(providerProfiles.id, providerCapabilities.providerProfileId))
    .where(and(eq(providerProfiles.userId, userId), eq(providerCapabilities.status, "ACTIVE")));
  return rows.map((r) => r.kind as CapabilityKind);
}

// ---------------------------------------------------------------------------
// Authorisation
// ---------------------------------------------------------------------------

/**
 * Assert that a user actively holds a capability.
 *
 * Server-side, and the only correct place for this check. A provider dashboard
 * that hides a panel is a convenience; this is what stops the corresponding
 * endpoint from being called directly.
 */
export async function requireCapability(
  userId: string,
  kind: CapabilityKind,
): Promise<ProviderProfile> {
  const profile = await getProviderProfile(userId);
  if (!profile) {
    throw new ForbiddenError(
      `You haven't set up a provider profile yet. ${CAPABILITIES[kind].applyHref} is where that starts.`,
    );
  }

  const [capability] = await db
    .select()
    .from(providerCapabilities)
    .where(
      and(
        eq(providerCapabilities.providerProfileId, profile.id),
        eq(providerCapabilities.kind, kind),
      ),
    )
    .limit(1);

  if (!capability) {
    throw new ForbiddenError(`You haven't applied for ${CAPABILITIES[kind].label.toLowerCase()}.`);
  }
  // Each refusal says which state the applicant is actually in. "Forbidden" on
  // its own sends people to support to find out whether they were rejected or
  // merely have not been looked at yet.
  if (capability.status === "PENDING") {
    throw new ForbiddenError(
      `Your ${CAPABILITIES[kind].label.toLowerCase()} application is still being reviewed. ${CAPABILITIES[kind].gate}`,
    );
  }
  if (capability.status === "REJECTED") {
    throw new ForbiddenError(
      capability.reviewNote
        ? `That application was not approved. The reason given was: ${capability.reviewNote}`
        : "That application was not approved.",
    );
  }
  if (capability.status === "SUSPENDED") {
    throw new ForbiddenError(
      capability.reviewNote
        ? `That capability is suspended. The reason given was: ${capability.reviewNote}`
        : "That capability is currently suspended.",
    );
  }

  return profile;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type ProfileInput = {
  displayName: string;
  headline: string;
  bio: string;
  professionalTitle?: string | null;
  currentRole?: string | null;
  currentOrganisation?: string | null;
  yearsExperience?: number;
  languages: string[];
  city?: string | null;
  countryId?: string | null;
  timezone?: string | null;
  links?: { label: string; url: string }[] | null;
  certifications?: { title: string; issuer?: string; year?: number }[] | null;
  visibility?: "PUBLIC" | "LIMITED" | "HIDDEN";
};

const MAX_LINKS = 8;
const MAX_CERTIFICATIONS = 20;

function validateProfile(input: ProfileInput) {
  if (input.displayName.trim().length < 2) {
    throw new ValidationError("A display name needs at least two characters.");
  }
  if (input.headline.trim().length < 10) {
    throw new ValidationError("A headline needs to say something — at least ten characters.");
  }
  if (input.bio.trim().length < 40) {
    throw new ValidationError(
      "A bio under forty characters tells a seeker nothing. Say what you actually help with.",
    );
  }
  if (!Array.isArray(input.languages) || input.languages.length === 0) {
    throw new ValidationError("List at least one language you can work in.");
  }
  if (input.timezone && !isValidTimeZone(input.timezone)) {
    throw new ValidationError(
      `'${input.timezone}' isn't a timezone we recognise. Use an IANA name like Asia/Kolkata.`,
    );
  }
  if (input.yearsExperience != null && (input.yearsExperience < 0 || input.yearsExperience > 70)) {
    throw new ValidationError("Years of experience should be between 0 and 70.");
  }

  for (const link of input.links ?? []) {
    if (!link.label?.trim()) throw new ValidationError("Every link needs a label.");
    let parsed: URL;
    try {
      parsed = new URL(link.url);
    } catch {
      throw new ValidationError(`"${link.url}" isn't a valid URL.`);
    }
    // Rendered as anchors on a public page, so the scheme is restricted rather
    // than sanitised at render time — javascript: and data: URLs are how a
    // profile field becomes a script injection.
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new ValidationError("Links must be http or https.");
    }
  }
  if ((input.links?.length ?? 0) > MAX_LINKS) {
    throw new ValidationError(`At most ${MAX_LINKS} links.`);
  }
  if ((input.certifications?.length ?? 0) > MAX_CERTIFICATIONS) {
    throw new ValidationError(`At most ${MAX_CERTIFICATIONS} certifications.`);
  }
}

/**
 * Create or update a provider profile.
 *
 * Upsert on user id: a person has exactly one professional identity here, and
 * the alternative — a profile per capability — is how the same bio ends up
 * maintained in three places and different in each.
 */
export async function saveProviderProfile(
  userId: string,
  input: ProfileInput,
): Promise<ProviderProfile> {
  validateProfile(input);

  const values = {
    userId,
    displayName: input.displayName.trim(),
    headline: input.headline.trim(),
    bio: input.bio.trim(),
    professionalTitle: input.professionalTitle?.trim() || null,
    currentRole: input.currentRole?.trim() || null,
    currentOrganisation: input.currentOrganisation?.trim() || null,
    yearsExperience: input.yearsExperience ?? 0,
    languages: input.languages,
    city: input.city?.trim() || null,
    countryId: input.countryId ?? null,
    timezone: input.timezone || null,
    links: input.links ?? null,
    certifications: input.certifications ?? null,
    visibility: input.visibility ?? ("PUBLIC" as const),
    updatedAt: new Date(),
  };

  const [saved] = await db
    .insert(providerProfiles)
    .values(values)
    .onConflictDoUpdate({
      target: providerProfiles.userId,
      set: { ...values, userId: undefined as never },
    })
    .returning();

  await recordAudit({
    actorType: "user",
    actorId: userId,
    action: "provider.profile_saved",
    entityType: "provider_profile",
    entityId: saved.id,
    after: { headline: saved.headline, visibility: saved.visibility },
  });

  return saved;
}

/**
 * Apply for a capability.
 *
 * Idempotent by design: re-applying for something already held returns it
 * rather than erroring, and re-applying after a rejection reopens the
 * application instead of being refused forever — a rejection is usually
 * "not with this evidence", not "never".
 */
export async function requestCapability(input: {
  userId: string;
  kind: CapabilityKind;
  /** Approved immediately, for capabilities whose gate is enforced elsewhere. */
  autoApprove?: boolean;
}): Promise<ProviderCapability> {
  const profile = await getProviderProfile(input.userId);
  if (!profile) {
    throw new ValidationError("Set up your provider profile before applying for a capability.");
  }

  const [existing] = await db
    .select()
    .from(providerCapabilities)
    .where(
      and(
        eq(providerCapabilities.providerProfileId, profile.id),
        eq(providerCapabilities.kind, input.kind),
      ),
    )
    .limit(1);

  if (existing) {
    if (existing.status === "ACTIVE" || existing.status === "PENDING") return existing;
    // SUSPENDED is a moderation decision and is not self-reversible; REJECTED is.
    // The state is always named alongside the reason: a bare note leaves the
    // applicant knowing why somebody was unhappy but not what has happened to
    // their listing or what to do next.
    if (existing.status === "SUSPENDED") {
      throw new ForbiddenError(
        existing.reviewNote
          ? `That capability is suspended and cannot be reopened by re-applying. The reason given was: ${existing.reviewNote}`
          : "That capability is suspended. Contact support to have it reviewed.",
      );
    }
    const [reopened] = await db
      .update(providerCapabilities)
      .set({ status: "PENDING", reviewNote: null, approvedAt: null, approvedById: null })
      .where(eq(providerCapabilities.id, existing.id))
      .returning();
    return reopened;
  }

  const [created] = await db
    .insert(providerCapabilities)
    .values({
      providerProfileId: profile.id,
      kind: input.kind,
      status: input.autoApprove ? "ACTIVE" : "PENDING",
      approvedAt: input.autoApprove ? new Date() : null,
    })
    .returning();

  await recordAudit({
    actorType: "user",
    actorId: input.userId,
    action: "provider.capability_requested",
    entityType: "provider_capability",
    entityId: created.id,
    after: { kind: created.kind, status: created.status },
  });

  return created;
}

/** Admin decision on one capability. */
export async function decideCapability(input: {
  capabilityId: string;
  adminId: string;
  status: Extract<CapabilityStatus, "ACTIVE" | "REJECTED" | "SUSPENDED">;
  note?: string | null;
}): Promise<ProviderCapability> {
  const [capability] = await db
    .select()
    .from(providerCapabilities)
    .where(eq(providerCapabilities.id, input.capabilityId))
    .limit(1);
  if (!capability) throw new NotFoundError("No such capability application.");

  if (input.status !== "ACTIVE" && !input.note?.trim()) {
    // A refusal with no reason is the single most common complaint about
    // marketplace moderation, and it is entirely avoidable.
    throw new ValidationError("Say why. A refusal without a reason is not reviewable.");
  }

  const [updated] = await db
    .update(providerCapabilities)
    .set({
      status: input.status,
      reviewNote: input.note?.trim() || null,
      approvedAt: input.status === "ACTIVE" ? new Date() : null,
      approvedById: input.adminId,
    })
    .where(eq(providerCapabilities.id, input.capabilityId))
    .returning();

  const profile = await getProviderProfileById(updated.providerProfileId);
  if (profile) {
    await notify({
      userId: profile.userId,
      type: "mentor.application_reviewed",
      title:
        input.status === "ACTIVE"
          ? `${CAPABILITIES[updated.kind as CapabilityKind].label} approved`
          : `${CAPABILITIES[updated.kind as CapabilityKind].label} application reviewed`,
      body:
        input.status === "ACTIVE"
          ? `You can now use the ${CAPABILITIES[updated.kind as CapabilityKind].label.toLowerCase()} tools in your provider dashboard.`
          : (updated.reviewNote ?? "See your provider dashboard for details."),
      href: "/provider",
      dedupeKey: `provider.capability:${updated.id}:${input.status}`,
    });
  }

  await recordAudit({
    actorType: "admin",
    actorId: input.adminId,
    action: "provider.capability_decided",
    entityType: "provider_capability",
    entityId: updated.id,
    before: { status: capability.status },
    after: { status: updated.status, note: updated.reviewNote },
  });

  return updated;
}

/** The moderation queue: capabilities awaiting a decision, oldest first. */
export async function pendingCapabilities() {
  return db
    .select({
      capability: providerCapabilities,
      profile: providerProfiles,
      email: users.email,
    })
    .from(providerCapabilities)
    .innerJoin(providerProfiles, eq(providerProfiles.id, providerCapabilities.providerProfileId))
    .innerJoin(users, eq(users.id, providerProfiles.userId))
    .where(eq(providerCapabilities.status, "PENDING"))
    .orderBy(asc(providerCapabilities.createdAt));
}

/**
 * Capabilities this user could apply for, given what already exists elsewhere.
 *
 * Reads the concrete tables rather than only the capability rows, so a mentor
 * who existed before this module — or an org member who joined through an
 * invite — is told they already have the thing rather than invited to apply for
 * it again.
 */
export async function suggestedCapabilities(userId: string): Promise<
  { kind: CapabilityKind; held: boolean; status: CapabilityStatus | null; impliedBy: string | null }[]
> {
  const profile = await getProviderProfile(userId);
  const held = profile ? await listCapabilities(profile.id) : [];
  const byKind = new Map(held.map((c) => [c.kind as CapabilityKind, c]));

  const [mentorRow, orgRows] = await Promise.all([
    db.select({ id: mentors.id }).from(mentors).where(eq(mentors.userId, userId)).limit(1),
    db
      .select({ organisationId: organisationMembers.organisationId })
      .from(organisationMembers)
      .where(eq(organisationMembers.userId, userId)),
  ]);

  const implied: Partial<Record<CapabilityKind, string>> = {};
  if (mentorRow.length) implied.MENTOR = "you already have a mentor profile";
  if (orgRows.length) implied.EMPLOYER = "you already belong to an organisation";

  return CAPABILITY_KINDS.map((kind) => {
    const capability = byKind.get(kind);
    return {
      kind,
      held: Boolean(capability),
      status: (capability?.status as CapabilityStatus) ?? null,
      impliedBy: implied[kind] ?? null,
    };
  });
}

/**
 * Count of things a provider might want to see on landing.
 *
 * One query per capability rather than a single join, because the tables have
 * nothing in common and a five-way left join to produce four numbers is harder
 * to read than four statements.
 */
export async function providerSummary(userId: string, active: CapabilityKind[]) {
  const summary: Record<string, number> = {};

  if (active.includes("MENTOR")) {
    const [row] = await db.execute<{ pending: number; upcoming: number }>(sql`
      SELECT
        count(*) FILTER (WHERE ms.status = 'REQUESTED')::int AS pending,
        count(*) FILTER (WHERE ms.status = 'ACCEPTED' AND ms.scheduled_at > now())::int AS upcoming
      FROM mentorship_sessions ms
      JOIN mentors m ON m.id = ms.mentor_id
      WHERE m.user_id = ${userId}
    `).then((r) => r.rows);
    summary.pendingRequests = Number(row?.pending ?? 0);
    summary.upcomingSessions = Number(row?.upcoming ?? 0);
  }

  if (active.includes("EMPLOYER")) {
    const [row] = await db.execute<{ active_jobs: number; applicants: number }>(sql`
      SELECT
        count(DISTINCT jp.id) FILTER (WHERE jp.status = 'ACTIVE')::int AS active_jobs,
        count(ja.id)::int AS applicants
      FROM organisation_members om
      JOIN job_postings jp ON jp.organisation_id = om.organisation_id
      LEFT JOIN job_applications ja ON ja.job_posting_id = jp.id
      WHERE om.user_id = ${userId}
    `).then((r) => r.rows);
    summary.activeJobs = Number(row?.active_jobs ?? 0);
    summary.applicants = Number(row?.applicants ?? 0);
  }

  return summary;
}
