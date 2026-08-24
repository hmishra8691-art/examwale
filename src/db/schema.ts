/**
 * ExamWale data model.
 *
 * The spine of this schema is the split described in the architecture doc:
 * a country-agnostic taxonomy (`occupations`, `skills`) and country-scoped
 * instances of it (`careerProfiles`, `exams`, `businessModelTemplates`).
 * Adding a country is a data operation; it is never a code branch.
 *
 * Every time-sensitive fact carries `sourceId` + `lastVerifiedAt`, and no
 * high-stakes record may be published without them (see modules/admin/publish).
 */
import {
  pgTable,
  pgEnum,
  text,
  varchar,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
  doublePrecision,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createId } from "@/db/id";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => createId());

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const sourceTypeEnum = pgEnum("source_type", [
  "OFFICIAL_GOVERNMENT",
  "OFFICIAL_INSTITUTION",
  "AGGREGATOR",
  "EDITORIAL",
  "AI_GENERATED",
]);

export const reliabilityTierEnum = pgEnum("reliability_tier", [
  "PRIMARY",
  "SECONDARY",
  "TERTIARY",
]);

/** How a claim reaches the user. Rendered as a visible badge everywhere. */
export const confidenceLabelEnum = pgEnum("confidence_label", [
  "VERIFIED",
  "ESTIMATED",
  "AI_JUDGEMENT",
  "UNVERIFIED",
]);

export const publishStatusEnum = pgEnum("publish_status", [
  "DRAFT",
  "NEEDS_REVIEW",
  "PUBLISHED",
  "ARCHIVED",
]);

/**
 * How well a country covers one section.
 *
 * NOT_APPLICABLE is the load-bearing value: it lets a country say "this does
 * not exist here" instead of an empty list implying we have not got round to
 * it. See `modules/geo/config.ts`.
 */
export const coverageStateEnum = pgEnum("coverage_state", [
  "COVERED",
  "PARTIAL",
  "PLANNED",
  "NOT_APPLICABLE",
]);

export const verificationStatusEnum = pgEnum("verification_status", [
  "VERIFIED",
  "STALE",
  "DISPUTED",
]);

export const levelEnum = pgEnum("level", [
  "VERY_LOW",
  "LOW",
  "MEDIUM",
  "HIGH",
  "VERY_HIGH",
]);

export const employmentTypeEnum = pgEnum("employment_type", [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "INTERNSHIP",
  "APPRENTICESHIP",
  "FREELANCE",
]);

export const remoteTypeEnum = pgEnum("remote_type", ["ONSITE", "HYBRID", "REMOTE"]);

export const jobStatusEnum = pgEnum("job_status", ["DRAFT", "ACTIVE", "CLOSED"]);

export const applicationStatusEnum = pgEnum("application_status", [
  "SAVED",
  "APPLIED",
  "IN_REVIEW",
  "REJECTED",
  "OFFER",
  "WITHDRAWN",
]);

export const orgVerificationStatusEnum = pgEnum("org_verification_status", [
  "UNVERIFIED",
  "PENDING",
  "VERIFIED",
  "REJECTED",
]);

export const userRoleEnum = pgEnum("user_role", [
  "SEEKER",
  "ORG_MEMBER",
  "ADMIN",
  "SUPER_ADMIN",
]);

export const subscriptionPlanEnum = pgEnum("subscription_plan", [
  "FREE",
  "PREMIUM",
  "B2B",
]);

export const documentTypeEnum = pgEnum("document_type", [
  "RESUME",
  "MARKSHEET",
  "CERTIFICATE",
  "JOB_DESCRIPTION",
  "EXAM_NOTIFICATION",
  "BUSINESS_PLAN",
  "OTHER",
]);

export const extractionStatusEnum = pgEnum("extraction_status", [
  "PENDING",
  "PROCESSING",
  "EXTRACTED",
  "CONFIRMED",
  "FAILED",
]);

export const roadmapStepStatusEnum = pgEnum("roadmap_step_status", [
  "NOT_STARTED",
  "IN_PROGRESS",
  "DONE",
]);

export const aiModeEnum = pgEnum("ai_mode", [
  "CAREER",
  "EXAM",
  "JOB",
  "BUSINESS",
  "EDUCATION",
  "RESUME",
  "INTERVIEW",
  "GENERAL",
]);

// ---------------------------------------------------------------------------
// Governance
// ---------------------------------------------------------------------------

export const sources = pgTable(
  "sources",
  {
    id: id(),
    name: text("name").notNull(),
    url: text("url"),
    type: sourceTypeEnum("type").notNull(),
    reliabilityTier: reliabilityTierEnum("reliability_tier").notNull().default("SECONDARY"),
    countryId: text("country_id"),
    regionId: text("region_id"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sources_type_idx").on(t.type)],
);

export const verificationRecords = pgTable(
  "verification_records",
  {
    id: id(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    sourceId: text("source_id").notNull(),
    verifiedById: text("verified_by_id"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    status: verificationStatusEnum("status").notNull().default("VERIFIED"),
    note: text("note"),
  },
  (t) => [
    index("verification_entity_idx").on(t.entityType, t.entityId),
    index("verification_status_idx").on(t.status, t.expiresAt),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_entity_idx").on(t.entityType, t.entityId),
    index("audit_actor_idx").on(t.actorId, t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Geography & education systems
// ---------------------------------------------------------------------------

export const countries = pgTable("countries", {
  id: id(),
  isoCode: varchar("iso_code", { length: 2 }).notNull().unique(),
  name: text("name").notNull(),
  currencyCode: varchar("currency_code", { length: 3 }).notNull(),
  currencySymbol: text("currency_symbol").notNull().default(""),
  defaultLocale: text("default_locale").notNull().default("en"),
  isActive: boolean("is_active").notNull().default(false),
});

export const regions = pgTable(
  "regions",
  {
    id: id(),
    countryId: text("country_id").notNull(),
    name: text("name").notNull(),
    code: text("code"),
    type: text("type").notNull().default("state"),
  },
  (t) => [
    uniqueIndex("regions_country_name_uq").on(t.countryId, t.name),
    index("regions_country_idx").on(t.countryId),
  ],
);

/**
 * What each country actually covers, declared rather than inferred.
 *
 * A row count cannot distinguish "we track exams here and there are none right
 * now" from "this country has no such thing as a government exam". Those look
 * identical to a query and completely different to a reader, so the answer is
 * stated per country per section and shown in the UI.
 *
 * `note` carries the human explanation — the UAE's exams row says why the
 * concept does not transfer, rather than leaving a reader to guess whether the
 * page is broken.
 */
export const countryCoverage = pgTable(
  "country_coverage",
  {
    id: id(),
    countryId: text("country_id").notNull(),
    section: text("section").notNull(),
    state: coverageStateEnum("state").notNull().default("PLANNED"),
    note: text("note"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("country_coverage_uq").on(t.countryId, t.section),
    index("country_coverage_country_idx").on(t.countryId),
  ],
);

export const educationSystems = pgTable("education_systems", {
  id: id(),
  countryId: text("country_id").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
});

export const educationStages = pgTable(
  "education_stages",
  {
    id: id(),
    educationSystemId: text("education_system_id").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    sequence: integer("sequence").notNull(),
    description: text("description"),
  },
  (t) => [uniqueIndex("edu_stage_uq").on(t.educationSystemId, t.slug)],
);

export const qualifications = pgTable("qualifications", {
  id: id(),
  educationSystemId: text("education_system_id").notNull(),
  stageId: text("stage_id"),
  name: text("name").notNull(),
  level: text("level").notNull(),
  typicalYears: real("typical_years"),
});

/**
 * "After Class 10, what are my options?" — branching held as data so a second
 * education system can describe a completely different set of forks.
 */
export const careerPathways = pgTable(
  "career_pathways",
  {
    id: id(),
    fromStageId: text("from_stage_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    options: jsonb("options").notNull().$type<PathwayOption[]>(),
  },
  (t) => [index("pathway_stage_idx").on(t.fromStageId)],
);

export type PathwayOption = {
  label: string;
  slug: string;
  summary: string;
  leadsToCareerSlugs: string[];
  note?: string;
};

// ---------------------------------------------------------------------------
// Taxonomy (global)
// ---------------------------------------------------------------------------

export const occupationGroups = pgTable("occupation_groups", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  parentId: text("parent_id"),
  icon: text("icon"),
  sequence: integer("sequence").notNull().default(0),
});

export const occupations = pgTable(
  "occupations",
  {
    id: id(),
    globalCode: text("global_code").notNull().unique(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description").notNull(),
    groupId: text("group_id").notNull(),
  },
  (t) => [index("occupations_group_idx").on(t.groupId)],
);

export const skills = pgTable("skills", {
  id: id(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  category: text("category").notNull().default("general"),
});

export const occupationSkills = pgTable(
  "occupation_skills",
  {
    occupationId: text("occupation_id").notNull(),
    skillId: text("skill_id").notNull(),
    importance: integer("importance").notNull().default(3),
  },
  (t) => [primaryKey({ columns: [t.occupationId, t.skillId] })],
);

// ---------------------------------------------------------------------------
// Career content (country-scoped)
// ---------------------------------------------------------------------------

export type LabelledDetail = { label: string; detail: string; mandatory?: boolean };
export type CostAlternative = { label: string; detail: string; approxCost?: number };
export type ProgressionStage = { stage: string; typicalYears: string; note?: string };

export const careerProfiles = pgTable(
  "career_profiles",
  {
    id: id(),
    occupationId: text("occupation_id").notNull(),
    countryId: text("country_id").notNull(),
    regionId: text("region_id"),
    slug: text("slug").notNull().unique(),

    summary: text("summary").notNull(),
    dayToDay: text("day_to_day").notNull(),
    workEnvironment: text("work_environment").notNull(),

    educationRequired: jsonb("education_required").notNull().$type<LabelledDetail[]>(),
    eligibility: jsonb("eligibility").notNull().$type<LabelledDetail[]>(),

    timeRequiredMonthsMin: integer("time_required_months_min"),
    timeRequiredMonthsMax: integer("time_required_months_max"),

    costMin: integer("cost_min"),
    costMax: integer("cost_max"),
    currencyCode: varchar("currency_code", { length: 3 }).notNull().default("INR"),
    lowCostAlternatives: jsonb("low_cost_alternatives").$type<CostAlternative[]>(),

    salaryEntryMin: integer("salary_entry_min"),
    salaryEntryMax: integer("salary_entry_max"),
    salaryMidMin: integer("salary_mid_min"),
    salaryMidMax: integer("salary_mid_max"),
    salarySeniorMin: integer("salary_senior_min"),
    salarySeniorMax: integer("salary_senior_max"),
    salaryConfidence: confidenceLabelEnum("salary_confidence").notNull().default("ESTIMATED"),

    selfEmploymentPossible: boolean("self_employment_possible").notNull().default(false),
    freelancingPossible: boolean("freelancing_possible").notNull().default(false),
    remotePossible: boolean("remote_possible").notNull().default(false),
    internationalNote: text("international_note"),

    automationRiskLevel: levelEnum("automation_risk_level").notNull().default("MEDIUM"),
    futureDemandLevel: levelEnum("future_demand_level").notNull().default("MEDIUM"),
    competitionLevel: levelEnum("competition_level").notNull().default("MEDIUM"),
    difficultyLevel: levelEnum("difficulty_level").notNull().default("MEDIUM"),

    advantages: jsonb("advantages").notNull().$type<string[]>(),
    disadvantages: jsonb("disadvantages").notNull().$type<string[]>(),
    progression: jsonb("progression").notNull().$type<ProgressionStage[]>(),
    nextSteps: jsonb("next_steps").notNull().$type<string[]>(),

    licensingNote: text("licensing_note"),
    isRegulated: boolean("is_regulated").notNull().default(false),

    status: publishStatusEnum("status").notNull().default("DRAFT"),
    sourceId: text("source_id"),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("career_country_status_idx").on(t.countryId, t.status),
    index("career_status_idx").on(t.status),
    index("career_occupation_idx").on(t.occupationId),
  ],
);

export const careerRelations = pgTable(
  "career_relations",
  {
    fromId: text("from_id").notNull(),
    toId: text("to_id").notNull(),
    relationType: text("relation_type").notNull().default("adjacent"),
  },
  (t) => [primaryKey({ columns: [t.fromId, t.toId] })],
);

export const careerCertifications = pgTable("career_certifications", {
  id: id(),
  careerProfileId: text("career_profile_id").notNull(),
  name: text("name").notNull(),
  provider: text("provider"),
  approxCost: integer("approx_cost"),
  currencyCode: varchar("currency_code", { length: 3 }).notNull().default("INR"),
  isFree: boolean("is_free").notNull().default(false),
  url: text("url"),
});

export const careerEntranceExams = pgTable(
  "career_entrance_exams",
  {
    careerProfileId: text("career_profile_id").notNull(),
    examId: text("exam_id").notNull(),
    note: text("note"),
  },
  (t) => [primaryKey({ columns: [t.careerProfileId, t.examId] })],
);

export const scholarships = pgTable("scholarships", {
  id: id(),
  name: text("name").notNull(),
  countryId: text("country_id").notNull(),
  provider: text("provider").notNull(),
  type: text("type").notNull(),
  summary: text("summary").notNull(),
  eligibility: text("eligibility").notNull(),
  approxValue: text("approx_value"),
  officialUrl: text("official_url"),
  sourceId: text("source_id"),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  status: publishStatusEnum("status").notNull().default("DRAFT"),
});

export const careerScholarships = pgTable(
  "career_scholarships",
  {
    careerProfileId: text("career_profile_id").notNull(),
    scholarshipId: text("scholarship_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.careerProfileId, t.scholarshipId] })],
);

// ---------------------------------------------------------------------------
// Government exams
// ---------------------------------------------------------------------------

export const govOrganisations = pgTable(
  "gov_organisations",
  {
    id: id(),
    name: text("name").notNull(),
    shortName: text("short_name").notNull(),
    countryId: text("country_id").notNull(),
    type: text("type").notNull(),
    website: text("website"),
  },
  (t) => [uniqueIndex("gov_org_uq").on(t.countryId, t.shortName)],
);

export type AgeLimit = {
  min?: number;
  max?: number;
  relaxations?: { group: string; years: number }[];
  note?: string;
};

export const exams = pgTable(
  "exams",
  {
    id: id(),
    name: text("name").notNull(),
    shortName: text("short_name").notNull(),
    slug: text("slug").notNull().unique(),
    organisationId: text("organisation_id").notNull(),
    countryId: text("country_id").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull(),

    eligibility: jsonb("eligibility").notNull().$type<LabelledDetail[]>(),
    ageLimit: jsonb("age_limit").notNull().$type<AgeLimit>(),
    nationalityRequirement: text("nationality_requirement"),
    educationRequirement: text("education_requirement").notNull(),

    applicationProcess: text("application_process").notNull(),
    officialWebsite: text("official_website").notNull(),
    preparationMonthsTypical: integer("preparation_months_typical"),
    difficultyLevel: levelEnum("difficulty_level").notNull().default("HIGH"),
    competitionNote: text("competition_note"),

    status: publishStatusEnum("status").notNull().default("DRAFT"),
    sourceId: text("source_id"),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("exam_country_status_idx").on(t.countryId, t.status),
    index("exam_category_idx").on(t.category),
  ],
);

export type ExamPaper = {
  paper: string;
  marks?: number;
  questions?: number;
  durationMinutes?: number;
  note?: string;
};

export const examStages = pgTable(
  "exam_stages",
  {
    id: id(),
    examId: text("exam_id").notNull(),
    name: text("name").notNull(),
    sequence: integer("sequence").notNull(),
    pattern: jsonb("pattern").notNull().$type<ExamPaper[]>(),
    durationMinutes: integer("duration_minutes"),
    marksTotal: integer("marks_total"),
    negativeMarking: boolean("negative_marking").notNull().default(false),
    negativeMarkingRatio: text("negative_marking_ratio"),
    isQualifyingOnly: boolean("is_qualifying_only").notNull().default(false),
  },
  (t) => [uniqueIndex("exam_stage_uq").on(t.examId, t.sequence)],
);

export const examSyllabusTopics = pgTable(
  "exam_syllabus_topics",
  {
    id: id(),
    examId: text("exam_id").notNull(),
    stageId: text("stage_id"),
    subject: text("subject").notNull(),
    topic: text("topic").notNull(),
    weightEstimate: integer("weight_estimate").notNull().default(1),
    sequence: integer("sequence").notNull().default(0),
  },
  (t) => [index("syllabus_exam_subject_idx").on(t.examId, t.subject)],
);

export const examSelectionSteps = pgTable(
  "exam_selection_steps",
  {
    id: id(),
    examId: text("exam_id").notNull(),
    sequence: integer("sequence").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
  },
  (t) => [uniqueIndex("exam_selection_uq").on(t.examId, t.sequence)],
);

export const examPayStructures = pgTable("exam_pay_structures", {
  id: id(),
  examId: text("exam_id").notNull(),
  postName: text("post_name").notNull(),
  payLevel: text("pay_level"),
  grossRangeMin: integer("gross_range_min"),
  grossRangeMax: integer("gross_range_max"),
  currencyCode: varchar("currency_code", { length: 3 }).notNull().default("INR"),
  note: text("note"),
});

export const examEditions = pgTable(
  "exam_editions",
  {
    id: id(),
    examId: text("exam_id").notNull(),
    year: integer("year").notNull(),
    notificationDate: timestamp("notification_date", { withTimezone: true }),
    applicationStart: timestamp("application_start", { withTimezone: true }),
    applicationEnd: timestamp("application_end", { withTimezone: true }),
    examDates: jsonb("exam_dates").$type<{ stage: string; date?: string; note?: string }[]>(),
    officialNotificationUrl: text("official_notification_url"),
    vacancyCount: integer("vacancy_count"),
    applicationFee: jsonb("application_fee").$type<{ category: string; amount: number }[]>(),
    status: publishStatusEnum("status").notNull().default("DRAFT"),
    sourceId: text("source_id"),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("exam_edition_uq").on(t.examId, t.year),
    index("exam_edition_year_idx").on(t.year),
  ],
);

// ---------------------------------------------------------------------------
// Learning resources
// ---------------------------------------------------------------------------

export const providers = pgTable("providers", {
  id: id(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  countryId: text("country_id"),
  website: text("website"),
  verificationStatus: text("verification_status").notNull().default("unverified"),

  /**
   * Phase 2 — marketplace fields.
   *
   * `organisationId` is what makes a provider *answerable*: it is the link
   * from a listing to the account whose members may read its enquiries and
   * edit its courses. A provider without one is directory data we hold about
   * a coaching centre, not a seller with a login — and the enquiry screens
   * refuse access rather than guessing.
   */
  organisationId: text("organisation_id"),
  slug: text("slug").unique(),
  about: text("about"),
  contactEmail: text("contact_email"),
  city: text("city"),
  logoUrl: text("logo_url"),
});

export const courses = pgTable("courses", {
  id: id(),
  providerId: text("provider_id"),
  title: text("title").notNull(),
  format: text("format").notNull().default("online"),
  cost: integer("cost"),
  currencyCode: varchar("currency_code", { length: 3 }).notNull().default("INR"),
  isFree: boolean("is_free").notNull().default(false),
  duration: text("duration"),
  url: text("url"),
  summary: text("summary"),
  status: publishStatusEnum("status").notNull().default("DRAFT"),
  sourceId: text("source_id"),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
});

/**
 * `costNote` is deliberately a string, never a stored "current price".
 * Prices move; the product must not present a stale number as a current fact.
 */
export const learningResources = pgTable(
  "learning_resources",
  {
    id: id(),
    examId: text("exam_id"),
    careerSlug: text("career_slug"),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    author: text("author"),
    publisher: text("publisher"),
    url: text("url"),
    budgetTier: text("budget_tier").notNull().default("free"),
    costNote: text("cost_note"),
    note: text("note"),
    sequence: integer("sequence").notNull().default(0),
  },
  (t) => [
    index("resource_exam_tier_idx").on(t.examId, t.budgetTier),
    index("resource_career_idx").on(t.careerSlug),
  ],
);

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export const companies = pgTable("companies", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  countryId: text("country_id").notNull(),
  industry: text("industry"),
  sizeBand: text("size_band"),
  website: text("website"),
  about: text("about"),
  verificationStatus: text("verification_status").notNull().default("unverified"),
});

export const jobPostings = pgTable(
  "job_postings",
  {
    id: id(),
    companyId: text("company_id").notNull(),
    occupationId: text("occupation_id"),
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description").notNull(),
    responsibilities: jsonb("responsibilities").$type<string[]>(),

    employmentType: employmentTypeEnum("employment_type").notNull().default("FULL_TIME"),
    remoteType: remoteTypeEnum("remote_type").notNull().default("ONSITE"),
    regionId: text("region_id"),
    city: text("city"),

    experienceMinYears: integer("experience_min_years").notNull().default(0),
    experienceMaxYears: integer("experience_max_years"),
    educationRequired: text("education_required"),
    skillsRequired: jsonb("skills_required").notNull().$type<string[]>(),
    skillsPreferred: jsonb("skills_preferred").$type<string[]>(),

    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    currencyCode: varchar("currency_code", { length: 3 }).notNull().default("INR"),
    isSalaryDisclosed: boolean("is_salary_disclosed").notNull().default(false),

    status: jobStatusEnum("status").notNull().default("ACTIVE"),
    source: text("source").notNull().default("direct"),
    sourceId: text("source_id"),
    applyUrl: text("apply_url"),

    /**
     * Phase 2 — employer self-serve.
     *
     * Set when a posting came in through the employer dashboard rather than
     * the seed or an admin. Such a posting starts DRAFT and needs both a
     * VERIFIED organisation and a moderation pass before it can go ACTIVE;
     * see modules/employers/service.ts.
     */
    organisationId: text("organisation_id"),
    createdById: text("created_by_id"),
    moderationStatus: orgVerificationStatusEnum("moderation_status").notNull().default("UNVERIFIED"),
    /** Employers pay to feature a posting; featured rows are labelled in the UI. */
    isFeatured: boolean("is_featured").notNull().default(false),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("job_status_posted_idx").on(t.status, t.postedAt),
    index("job_region_idx").on(t.regionId),
    index("job_type_idx").on(t.employmentType),
  ],
);

export const jobApplications = pgTable(
  "job_applications",
  {
    id: id(),
    userId: text("user_id").notNull(),
    jobPostingId: text("job_posting_id").notNull(),
    resumeDocumentId: text("resume_document_id"),
    coverLetter: text("cover_letter"),
    status: applicationStatusEnum("status").notNull().default("APPLIED"),
    matchScore: integer("match_score"),
    matchExplanation: jsonb("match_explanation"),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("application_uq").on(t.userId, t.jobPostingId),
    index("application_user_idx").on(t.userId, t.status),
  ],
);

// ---------------------------------------------------------------------------
// Business / entrepreneurship
// ---------------------------------------------------------------------------

export const businessCategories = pgTable("business_categories", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  parentId: text("parent_id"),
});

export const businessModelTemplates = pgTable(
  "business_model_templates",
  {
    id: id(),
    categoryId: text("category_id").notNull(),
    countryId: text("country_id").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    targetCustomer: text("target_customer").notNull(),
    summary: text("summary").notNull(),

    startupCostMin: integer("startup_cost_min").notNull(),
    startupCostMax: integer("startup_cost_max").notNull(),
    currencyCode: varchar("currency_code", { length: 3 }).notNull().default("INR"),

    fixedCosts: jsonb("fixed_costs").notNull().$type<{ label: string; approxMonthly: number }[]>(),
    variableCosts: jsonb("variable_costs").notNull().$type<{ label: string; note: string }[]>(),
    equipment: jsonb("equipment").notNull().$type<string[]>(),
    licenses: jsonb("licenses").notNull().$type<{ name: string; authority: string; note?: string }[]>(),
    skills: jsonb("skills").notNull().$type<string[]>(),
    suppliersNote: text("suppliers_note"),
    marketingPlan: jsonb("marketing_plan").notNull().$type<string[]>(),
    pricingModel: text("pricing_model").notNull(),
    revenueModel: text("revenue_model").notNull(),
    breakEven: jsonb("break_even").notNull().$type<{ assumptions: string[]; formula: string; note: string }>(),
    risks: jsonb("risks").notNull().$type<string[]>(),
    competition: text("competition").notNull(),
    growth: jsonb("growth").notNull().$type<string[]>(),
    aiOpportunities: jsonb("ai_opportunities").notNull().$type<string[]>(),
    launchPlan: jsonb("launch_plan").notNull().$type<{ window: string; tasks: string[] }[]>(),

    status: publishStatusEnum("status").notNull().default("DRAFT"),
    sourceId: text("source_id"),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  },
  (t) => [index("business_country_status_idx").on(t.countryId, t.status)],
);

// ---------------------------------------------------------------------------
// Organisations (opportunity providers)
// ---------------------------------------------------------------------------

export const organisations = pgTable(
  "organisations",
  {
    id: id(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    countryId: text("country_id").notNull(),
    contactEmail: text("contact_email").notNull(),
    website: text("website"),
    about: text("about"),
    verificationStatus: orgVerificationStatusEnum("verification_status").notNull().default("UNVERIFIED"),
    verificationDocs: jsonb("verification_docs"),
    reviewNote: text("review_note"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("org_verification_idx").on(t.verificationStatus)],
);

export const organisationMembers = pgTable(
  "organisation_members",
  {
    organisationId: text("organisation_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role").notNull().default("owner"),
  },
  (t) => [primaryKey({ columns: [t.organisationId, t.userId] })],
);

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull().unique(),
    name: text("name"),
    passwordHash: text("password_hash"),
    authProvider: text("auth_provider").notNull().default("password"),
    providerId: text("provider_id"),
    emailVerified: boolean("email_verified").notNull().default(false),
    role: userRoleEnum("role").notNull().default("SEEKER"),
    plan: subscriptionPlanEnum("plan").notNull().default("FREE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => [index("users_role_idx").on(t.role)],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: id(),
    userId: text("user_id").notNull(),
    refreshTokenHash: text("refresh_token_hash").notNull().unique(),
    userAgent: text("user_agent"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: id(),
  userId: text("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

export const userProfiles = pgTable("user_profiles", {
  userId: text("user_id").primaryKey(),
  age: integer("age"),
  countryId: text("country_id"),
  regionId: text("region_id"),
  city: text("city"),
  preferredLanguage: text("preferred_language").notNull().default("en"),

  educationStageId: text("education_stage_id"),
  degree: text("degree"),
  major: text("major"),
  institution: text("institution"),
  academicPerformance: text("academic_performance"),

  employmentStatus: text("employment_status"),
  yearsExperience: integer("years_experience"),

  availableBudget: integer("available_budget"),
  availableHoursPerDay: real("available_hours_per_day"),
  preferredRegionId: text("preferred_region_id"),
  willingnessToRelocate: boolean("willingness_to_relocate").notNull().default(false),
  onlineOfflinePreference: text("online_offline_preference").notNull().default("either"),
  riskTolerance: text("risk_tolerance").notNull().default("medium"),
  desiredIncomeMin: integer("desired_income_min"),

  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userInterests = pgTable(
  "user_interests",
  {
    userId: text("user_id").notNull(),
    tag: text("tag").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tag] })],
);

export const userSkills = pgTable(
  "user_skills",
  {
    userId: text("user_id").notNull(),
    skillId: text("skill_id").notNull(),
    proficiency: integer("proficiency").notNull().default(3),
    source: text("source").notNull().default("self_reported"),
    confirmed: boolean("confirmed").notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.userId, t.skillId] })],
);

export const userGoals = pgTable(
  "user_goals",
  {
    id: id(),
    userId: text("user_id").notNull(),
    goalType: text("goal_type").notNull(),
    targetCareerProfileId: text("target_career_profile_id"),
    targetExamId: text("target_exam_id"),
    targetDate: timestamp("target_date", { withTimezone: true }),
    note: text("note"),
    priority: integer("priority").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("goal_user_idx").on(t.userId)],
);

export const savedItems = pgTable(
  "saved_items",
  {
    id: id(),
    userId: text("user_id").notNull(),
    itemType: text("item_type").notNull(),
    itemId: text("item_id").notNull(),
    label: text("label"),
    note: text("note"),
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("saved_uq").on(t.userId, t.itemType, t.itemId),
    index("saved_user_type_idx").on(t.userId, t.itemType),
  ],
);

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const userDocuments = pgTable(
  "user_documents",
  {
    id: id(),
    userId: text("user_id").notNull(),
    type: documentTypeEnum("type").notNull().default("OTHER"),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key").notNull(),
    textExcerpt: text("text_excerpt"),
    status: extractionStatusEnum("status").notNull().default("PENDING"),
    failureReason: text("failure_reason"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("doc_user_type_idx").on(t.userId, t.type)],
);

export type ExtractedResume = {
  fullName?: string;
  email?: string;
  phone?: string;
  skills: string[];
  education: { qualification: string; institution?: string; year?: string }[];
  experience: { title: string; organisation?: string; duration?: string; summary?: string }[];
  certifications: string[];
  totalYearsExperience?: number;
  issues: string[];
};

export const documentExtractions = pgTable("document_extractions", {
  documentId: text("document_id").primaryKey(),
  extracted: jsonb("extracted").notNull(),
  confidence: jsonb("confidence").notNull().$type<Record<string, number>>(),
  modelVersion: text("model_version").notNull(),
  providerUsed: text("provider_used").notNull(),
  reviewedByUser: boolean("reviewed_by_user").notNull().default(false),
  extractedAt: timestamp("extracted_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Roadmaps, assessments, study plans
// ---------------------------------------------------------------------------

export type RoadmapTemplateStep = {
  title: string;
  description: string;
  kind: string;
  typicalMonths?: number;
  refType?: string;
  refSlug?: string;
};

export const roadmapTemplates = pgTable("roadmap_templates", {
  id: id(),
  careerProfileId: text("career_profile_id").notNull(),
  title: text("title").notNull(),
  steps: jsonb("steps").notNull().$type<RoadmapTemplateStep[]>(),
});

export type RealityCheck = {
  verdict: "ACHIEVABLE" | "DIFFICULT" | "HIGHLY_UNLIKELY" | "NEEDS_ADJUSTMENT";
  headline: string;
  reasoning: string[];
  impliedHoursPerWeek?: number;
  typicalHoursPerWeek?: number;
  alternative?: string;
};

export const roadmaps = pgTable(
  "roadmaps",
  {
    id: id(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    goalDescription: text("goal_description").notNull(),
    generatedBy: text("generated_by").notNull().default("template"),
    targetCareerSlug: text("target_career_slug"),
    targetExamSlug: text("target_exam_slug"),
    realityCheck: jsonb("reality_check").$type<RealityCheck>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("roadmap_user_idx").on(t.userId)],
);

export const roadmapSteps = pgTable(
  "roadmap_steps",
  {
    id: id(),
    roadmapId: text("roadmap_id").notNull(),
    sequence: integer("sequence").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    kind: text("kind").notNull().default("milestone"),
    refType: text("ref_type"),
    refSlug: text("ref_slug"),
    status: roadmapStepStatusEnum("status").notNull().default("NOT_STARTED"),
    targetDate: timestamp("target_date", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("roadmap_step_uq").on(t.roadmapId, t.sequence)],
);

export type AssessmentResult = {
  careerSlug: string;
  name: string;
  score: number;
  reasons: string[];
  gaps: string[];
  groupName: string;
  salaryEntryMin: number | null;
  salaryEntryMax: number | null;
  currencyCode: string;
};

export const assessments = pgTable(
  "assessments",
  {
    id: id(),
    userId: text("user_id").notNull(),
    answers: jsonb("answers").notNull(),
    results: jsonb("results").notNull().$type<AssessmentResult[]>(),
    method: text("method").notNull().default("rules+ai"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("assessment_user_idx").on(t.userId, t.createdAt)],
);

export type StudyPlanShape = {
  months: { index: number; label: string; topics: string[]; hours: number }[];
  weekly: { day: string; focus: string; hours: number }[];
  revision: string[];
  mocks: string[];
  totalTopics: number;
  totalHours: number;
  /**
   * Optional model-written commentary layered over the plan.
   *
   * Deliberately additive and deliberately separate. The month buckets, the
   * hour arithmetic and the feasibility verdict above are computed and are the
   * authority; this only explains and sequences them. If the model is
   * unavailable the plan is complete without it, and nothing here can change a
   * number a user might budget their year against.
   */
  narrative?: {
    provider: string;
    /** One paragraph on how to approach this specific plan. */
    approach: string;
    /** Per-month guidance, aligned to `months` by index. */
    months: { index: number; focus: string; watchFor: string }[];
    /** What tends to go wrong with this syllabus at this pace. */
    pitfalls: string[];
  };
};

export type Feasibility = {
  verdict: "ACHIEVABLE" | "DIFFICULT" | "HIGHLY_UNLIKELY" | "NEEDS_ADJUSTMENT";
  impliedHoursPerWeek: number;
  availableHoursPerWeek: number;
  note: string;
};

export const studyPlans = pgTable(
  "study_plans",
  {
    id: id(),
    userId: text("user_id").notNull(),
    examId: text("exam_id").notNull(),
    hoursPerDay: real("hours_per_day").notNull(),
    targetDate: timestamp("target_date", { withTimezone: true }).notNull(),
    plan: jsonb("plan").notNull().$type<StudyPlanShape>(),
    feasibility: jsonb("feasibility").notNull().$type<Feasibility>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("study_plan_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: id(),
    userId: text("user_id"),
    mode: aiModeEnum("mode").notNull().default("GENERAL"),
    title: text("title").notNull().default("New conversation"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("conversation_user_idx").on(t.userId, t.updatedAt)],
);

export type Citation = {
  label: string;
  kind: "career" | "exam" | "business" | "resource" | "job";
  slug: string;
  sourceName?: string;
  sourceUrl?: string;
  lastVerifiedAt?: string;
};

export const aiMessages = pgTable(
  "ai_messages",
  {
    id: id(),
    conversationId: text("conversation_id").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    citations: jsonb("citations").$type<Citation[]>(),
    confidenceLabel: confidenceLabelEnum("confidence_label").notNull().default("AI_JUDGEMENT"),
    providerUsed: text("provider_used"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("message_conversation_idx").on(t.conversationId, t.createdAt)],
);

export const aiUsageLogs = pgTable(
  "ai_usage_logs",
  {
    id: id(),
    userId: text("user_id"),
    mode: aiModeEnum("mode").notNull(),
    provider: text("provider").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    costEstimate: doublePrecision("cost_estimate").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("usage_user_idx").on(t.userId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// AI tools — résumé review and interview practice
//
// These are stored rather than computed-and-forgotten for one reason: a user
// should be able to see whether their résumé actually improved between two
// reviews. A score with nothing to compare it against is a vanity number.
// ---------------------------------------------------------------------------

export type ResumeReviewShape = {
  /** 0–100. Derived from the section scores, never asserted independently. */
  overall: number;
  sections: {
    key: "contact" | "structure" | "impact" | "skills" | "relevance" | "length";
    label: string;
    score: number;
    verdict: string;
  }[];
  /** Concrete rewrites. `before` must be a line that exists in the résumé. */
  rewrites: { before: string; after: string; why: string }[];
  /** Skills the target role's profile lists that the résumé never mentions. */
  missingForTarget: string[];
  /** Skills present in the résumé that the target role actually asks for. */
  matchedForTarget: string[];
  strengths: string[];
  fixes: { priority: "HIGH" | "MEDIUM" | "LOW"; issue: string; action: string }[];
  /** Stated in the output so a reader knows what the score is not measuring. */
  limitations: string[];
};

export const resumeReviews = pgTable(
  "resume_reviews",
  {
    id: id(),
    userId: text("user_id").notNull(),
    /** Null when the user pasted text instead of using a stored document. */
    documentId: text("document_id"),
    targetKind: text("target_kind").notNull().default("general"),
    targetSlug: text("target_slug"),
    targetLabel: text("target_label"),
    review: jsonb("review").notNull().$type<ResumeReviewShape>(),
    provider: text("provider").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("resume_review_user_idx").on(t.userId, t.createdAt)],
);

export type InterviewQuestion = {
  index: number;
  question: string;
  /** What the interviewer is actually testing. Not the answer. */
  probing: string;
  category: "OPENER" | "TECHNICAL" | "BEHAVIOURAL" | "SITUATIONAL" | "MOTIVATION" | "CLOSING";
  difficulty: "WARM_UP" | "STANDARD" | "STRETCH";
  /** Structure to hang an answer on — deliberately not a scripted answer. */
  skeleton: string[];
};

export type InterviewFeedback = {
  /** 0–100, from the rubric below rather than an overall impression. */
  score: number;
  rubric: { key: string; label: string; score: number; comment: string }[];
  strengths: string[];
  gaps: string[];
  /** A rewritten version of the user's own answer, not a generic model answer. */
  improvedAnswer: string;
  followUps: string[];
};

export const interviewSessions = pgTable(
  "interview_sessions",
  {
    id: id(),
    userId: text("user_id").notNull(),
    targetKind: text("target_kind").notNull().default("career"),
    targetSlug: text("target_slug"),
    targetLabel: text("target_label").notNull(),
    round: text("round").notNull().default("MIXED"),
    questions: jsonb("questions").notNull().$type<InterviewQuestion[]>(),
    citations: jsonb("citations").$type<Citation[]>(),
    provider: text("provider").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("interview_session_user_idx").on(t.userId, t.createdAt)],
);

export const interviewAnswers = pgTable(
  "interview_answers",
  {
    id: id(),
    sessionId: text("session_id").notNull(),
    userId: text("user_id").notNull(),
    questionIndex: integer("question_index").notNull(),
    answer: text("answer").notNull(),
    feedback: jsonb("feedback").notNull().$type<InterviewFeedback>(),
    provider: text("provider").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("interview_answer_session_idx").on(t.sessionId, t.questionIndex),
    // One answer per question per session: re-answering replaces the previous
    // attempt rather than stacking, so "your score" is unambiguous.
    uniqueIndex("interview_answer_uq").on(t.sessionId, t.questionIndex),
  ],
);

/**
 * Retrieval corpus. Kept as plain text + a lexical index so retrieval always
 * works; an embedding column is added by the migration when pgvector exists.
 */
export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: id(),
    entityType: text("entity_type").notNull(),
    entitySlug: text("entity_slug").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    countryIso: varchar("country_iso", { length: 2 }).notNull().default("IN"),
    metadata: jsonb("metadata"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("chunk_uq").on(t.entityType, t.entitySlug),
    index("chunk_type_country_idx").on(t.entityType, t.countryIso),
  ],
);

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: text("user_id").notNull(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    href: text("href"),
    /**
     * Collapses repeats. "Your exam date was verified" fired by three separate
     * admin edits in an hour is one thing that happened, not three.
     */
    dedupeKey: text("dedupe_key"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notification_user_idx").on(t.userId, t.readAt),
    uniqueIndex("notification_dedupe_uq").on(t.userId, t.dedupeKey),
  ],
);

// ===========================================================================
// PHASE 2
// ===========================================================================
// Everything below was added in Phase 2. The rules from Phase 1 still hold:
// any claim a person might act on carries a confidence label and a source,
// and anything a third party pays us to show is labelled as paid.
// ---------------------------------------------------------------------------

export const courseModeEnum = pgEnum("course_mode", [
  "ONLINE_LIVE",
  "ONLINE_SELF_PACED",
  "CLASSROOM",
  "HYBRID",
  "CORRESPONDENCE",
]);

export const enquiryStatusEnum = pgEnum("enquiry_status", [
  "NEW",
  "CONTACTED",
  "CLOSED",
  "SPAM",
]);

export const mentorStatusEnum = pgEnum("mentor_status", [
  "PENDING",
  "ACTIVE",
  "PAUSED",
  "REJECTED",
]);

export const mentorshipStatusEnum = pgEnum("mentorship_status", [
  "REQUESTED",
  "ACCEPTED",
  "DECLINED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
]);

export const billingIntervalEnum = pgEnum("billing_interval", ["MONTHLY", "YEARLY"]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "CANCELLED",
  "EXPIRED",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "PENDING",
  "SUCCEEDED",
  "FAILED",
  "REFUNDED",
]);

export const notificationChannelEnum = pgEnum("notification_channel", [
  "IN_APP",
  "EMAIL",
  "PUSH",
]);

export const deliveryStatusEnum = pgEnum("delivery_status", [
  "PENDING",
  "SENT",
  "FAILED",
  "SUPPRESSED",
]);

export const localeEnum = pgEnum("locale", ["en", "hi"]);

export const translationSourceEnum = pgEnum("translation_source", [
  "HUMAN",
  "MACHINE",
  "MACHINE_REVIEWED",
]);

export const cohortMemberStatusEnum = pgEnum("cohort_member_status", [
  "INVITED",
  "ACTIVE",
  "REMOVED",
]);

export const campaignStatusEnum = pgEnum("campaign_status", [
  "DRAFT",
  "PENDING_REVIEW",
  "ACTIVE",
  "PAUSED",
  "REJECTED",
  "COMPLETED",
]);

export const adEventTypeEnum = pgEnum("ad_event_type", ["IMPRESSION", "CLICK"]);

// ---------------------------------------------------------------------------
// Phase 2 · Employer self-serve job posting
// ---------------------------------------------------------------------------

/**
 * Invitations to join an organisation's hiring team.
 *
 * Token is stored hashed for the same reason password-reset tokens are: a
 * leaked database row must not be a usable invite.
 */
export const organisationInvites = pgTable(
  "organisation_invites",
  {
    id: id(),
    organisationId: text("organisation_id").notNull(),
    email: text("email").notNull(),
    role: text("role").notNull().default("recruiter"),
    tokenHash: text("token_hash").notNull(),
    invitedById: text("invited_by_id").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("org_invite_org_idx").on(t.organisationId),
    uniqueIndex("org_invite_token_uq").on(t.tokenHash),
  ],
);

/**
 * Moderation trail for employer-submitted postings.
 *
 * Employer postings do not go live on submit. An unverified organisation
 * publishing a job advert is the single highest-risk path in the product —
 * it is how a jobs board becomes a fee-fraud channel — so the gate is a row
 * here, not a convention.
 */
export const jobModerationReviews = pgTable(
  "job_moderation_reviews",
  {
    id: id(),
    jobPostingId: text("job_posting_id").notNull(),
    reviewerId: text("reviewer_id"),
    decision: text("decision").notNull(),
    reason: text("reason"),
    automatedFlags: jsonb("automated_flags").$type<string[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("job_moderation_job_idx").on(t.jobPostingId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Phase 2 · Courses and coaching marketplace
// ---------------------------------------------------------------------------

/**
 * A claim a provider makes about outcomes — "98% selection rate", "average
 * package 12 LPA".
 *
 * Deliberately a separate, confidence-labelled table rather than columns on
 * `courses`. A coaching centre's success figure is a *claim* until someone
 * checks it, and storing it as a plain number on the course row would let the
 * UI render marketing copy in the same visual register as a verified fact.
 * Unverified claims render behind a label saying who claimed it.
 */
export const courseOutcomeClaims = pgTable(
  "course_outcome_claims",
  {
    id: id(),
    courseId: text("course_id").notNull(),
    metric: text("metric").notNull(),
    claimedValue: text("claimed_value").notNull(),
    claimedPeriod: text("claimed_period"),
    confidence: confidenceLabelEnum("confidence").notNull().default("UNVERIFIED"),
    sourceId: text("source_id"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("course_claim_course_idx").on(t.courseId, t.confidence)],
);

/** Which exam or career a course actually prepares you for. */
export const courseTargets = pgTable(
  "course_targets",
  {
    id: id(),
    courseId: text("course_id").notNull(),
    examId: text("exam_id"),
    careerSlug: text("career_slug"),
  },
  (t) => [
    index("course_target_course_idx").on(t.courseId),
    index("course_target_exam_idx").on(t.examId),
    index("course_target_career_idx").on(t.careerSlug),
  ],
);

/**
 * Batches — a specific run of a course with its own dates, fee and seats.
 *
 * Fee lives here rather than on `courses` because it is the thing that
 * actually moves, and a stale fee on a course page is a lie with a price tag.
 */
export const courseBatches = pgTable(
  "course_batches",
  {
    id: id(),
    courseId: text("course_id").notNull(),
    label: text("label").notNull(),
    mode: courseModeEnum("mode").notNull().default("ONLINE_LIVE"),
    startsOn: timestamp("starts_on", { withTimezone: true }),
    endsOn: timestamp("ends_on", { withTimezone: true }),
    seatsTotal: integer("seats_total"),
    seatsLeft: integer("seats_left"),
    feeAmount: integer("fee_amount"),
    currencyCode: varchar("currency_code", { length: 3 }).notNull().default("INR"),
    feeNote: text("fee_note"),
    city: text("city"),
    regionId: text("region_id"),
    isActive: boolean("is_active").notNull().default(true),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  },
  (t) => [index("course_batch_course_idx").on(t.courseId, t.isActive)],
);

/**
 * A learner asking a provider to get in touch.
 *
 * We pass on only what the learner ticked. `sharedFields` records exactly what
 * was released so the disclosure is auditable rather than assumed.
 */
export const courseEnquiries = pgTable(
  "course_enquiries",
  {
    id: id(),
    courseId: text("course_id").notNull(),
    batchId: text("batch_id"),
    userId: text("user_id"),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    message: text("message"),
    sharedFields: jsonb("shared_fields").notNull().$type<string[]>(),
    status: enquiryStatusEnum("status").notNull().default("NEW"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("course_enquiry_course_idx").on(t.courseId, t.status),
    index("course_enquiry_user_idx").on(t.userId),
  ],
);

// ---------------------------------------------------------------------------
// Phase 2 · Mentors
// ---------------------------------------------------------------------------

export const mentors = pgTable(
  "mentors",
  {
    id: id(),
    userId: text("user_id").notNull(),
    headline: text("headline").notNull(),
    bio: text("bio").notNull(),
    countryId: text("country_id").notNull(),
    city: text("city"),
    languages: jsonb("languages").notNull().$type<string[]>(),
    expertiseCareerSlugs: jsonb("expertise_career_slugs").$type<string[]>(),
    expertiseExamIds: jsonb("expertise_exam_ids").$type<string[]>(),
    yearsExperience: integer("years_experience").notNull().default(0),
    currentRole: text("current_role"),
    currentOrganisation: text("current_organisation"),
    /** Zero means the mentor offers free sessions — not "price unknown". */
    sessionRate: integer("session_rate").notNull().default(0),
    currencyCode: varchar("currency_code", { length: 3 }).notNull().default("INR"),
    sessionMinutes: integer("session_minutes").notNull().default(30),
    status: mentorStatusEnum("status").notNull().default("PENDING"),
    /**
     * A mentor may not be listed until at least one credential is verified.
     * Enforced in modules/mentors/service.ts, mirrored here so the state is
     * queryable without recomputing it.
     */
    credentialVerifiedAt: timestamp("credential_verified_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("mentor_user_uq").on(t.userId),
    index("mentor_status_idx").on(t.status, t.countryId),
  ],
);

export const mentorCredentials = pgTable(
  "mentor_credentials",
  {
    id: id(),
    mentorId: text("mentor_id").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    issuer: text("issuer"),
    evidenceUrl: text("evidence_url"),
    documentId: text("document_id"),
    status: verificationStatusEnum("status").notNull().default("DISPUTED"),
    verifiedById: text("verified_by_id"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("mentor_credential_mentor_idx").on(t.mentorId, t.status)],
);

export const mentorAvailability = pgTable(
  "mentor_availability",
  {
    id: id(),
    mentorId: text("mentor_id").notNull(),
    weekday: integer("weekday").notNull(),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
  },
  (t) => [index("mentor_availability_mentor_idx").on(t.mentorId, t.weekday)],
);

export const mentorshipSessions = pgTable(
  "mentorship_sessions",
  {
    id: id(),
    mentorId: text("mentor_id").notNull(),
    seekerId: text("seeker_id").notNull(),
    topic: text("topic").notNull(),
    question: text("question"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(30),
    status: mentorshipStatusEnum("status").notNull().default("REQUESTED"),
    meetingUrl: text("meeting_url"),
    mentorNote: text("mentor_note"),
    cancelledReason: text("cancelled_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("mentorship_mentor_idx").on(t.mentorId, t.status),
    index("mentorship_seeker_idx").on(t.seekerId, t.status),
    uniqueIndex("mentorship_slot_uq").on(t.mentorId, t.scheduledAt),
  ],
);

/** Written only after a session is COMPLETED — see modules/mentors/service.ts. */
export const mentorReviews = pgTable(
  "mentor_reviews",
  {
    id: id(),
    sessionId: text("session_id").notNull(),
    mentorId: text("mentor_id").notNull(),
    seekerId: text("seeker_id").notNull(),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("mentor_review_session_uq").on(t.sessionId),
    index("mentor_review_mentor_idx").on(t.mentorId),
  ],
);

// ---------------------------------------------------------------------------
// Phase 2 · Premium billing
// ---------------------------------------------------------------------------

/**
 * Plans are rows, not constants, so pricing and entitlements can change
 * without a deploy — and so a subscription can keep pointing at the plan the
 * user actually bought after the public price moves.
 */
export const plans = pgTable(
  "plans",
  {
    id: id(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    plan: subscriptionPlanEnum("plan").notNull().default("PREMIUM"),
    description: text("description"),
    amount: integer("amount").notNull().default(0),
    currencyCode: varchar("currency_code", { length: 3 }).notNull().default("INR"),
    interval: billingIntervalEnum("interval").notNull().default("MONTHLY"),
    trialDays: integer("trial_days").notNull().default(0),
    entitlements: jsonb("entitlements").notNull().$type<Record<string, number | boolean>>(),
    isActive: boolean("is_active").notNull().default(true),
    sequence: integer("sequence").notNull().default(0),
  },
  (t) => [index("plan_active_idx").on(t.isActive, t.sequence)],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    userId: text("user_id").notNull(),
    planId: text("plan_id").notNull(),
    status: subscriptionStatusEnum("status").notNull().default("ACTIVE"),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }).notNull().defaultNow(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    provider: text("provider").notNull().default("manual"),
    providerRef: text("provider_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("subscription_user_idx").on(t.userId, t.status),
    uniqueIndex("subscription_provider_ref_uq").on(t.provider, t.providerRef),
    /**
     * One subscription per user, enforced by the database.
     *
     * `activateSubscription` has always updated the existing row rather than
     * inserting a second one, so this held by convention — but a convention is
     * only as good as the next person who writes an INSERT. Two active rows
     * would make `getEntitlements` pick whichever happened to have the later
     * period end, which is a silently wrong answer to "what has this person
     * paid for" rather than a loud one.
     */
    uniqueIndex("subscription_user_uq").on(t.userId),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    userId: text("user_id").notNull(),
    subscriptionId: text("subscription_id"),
    amount: integer("amount").notNull(),
    currencyCode: varchar("currency_code", { length: 3 }).notNull().default("INR"),
    status: paymentStatusEnum("status").notNull().default("PENDING"),
    provider: text("provider").notNull().default("manual"),
    providerRef: text("provider_ref"),
    description: text("description"),
    failureReason: text("failure_reason"),
    /** Idempotency key — a retried webhook must not charge or credit twice. */
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payment_user_idx").on(t.userId, t.createdAt),
    uniqueIndex("payment_idempotency_uq").on(t.idempotencyKey),
  ],
);

// ---------------------------------------------------------------------------
// Phase 2 · Notification delivery
// ---------------------------------------------------------------------------

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: id(),
    userId: text("user_id").notNull(),
    type: text("type").notNull(),
    channel: notificationChannelEnum("channel").notNull(),
    enabled: boolean("enabled").notNull().default(true),
  },
  (t) => [uniqueIndex("notification_pref_uq").on(t.userId, t.type, t.channel)],
);

/**
 * One row per attempt to push a notification down a channel.
 *
 * Separate from `notifications` because the in-app record is the same fact
 * however many times we tried to email it, and a failed send must not make
 * the notification itself disappear from the bell.
 */
export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: id(),
    notificationId: text("notification_id").notNull(),
    channel: notificationChannelEnum("channel").notNull(),
    status: deliveryStatusEnum("status").notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notification_delivery_idx").on(t.notificationId, t.channel)],
);

// ---------------------------------------------------------------------------
// Phase 2 · Localisation
// ---------------------------------------------------------------------------

/**
 * Translations of database-held content.
 *
 * `source` is not decoration: a machine-translated exam eligibility rule that
 * reads as authoritative Hindi is a worse failure than showing English. The UI
 * labels MACHINE rows and prefers the original when a reviewed one is absent.
 */
export const translations = pgTable(
  "translations",
  {
    id: id(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    field: text("field").notNull(),
    locale: localeEnum("locale").notNull(),
    value: text("value").notNull(),
    source: translationSourceEnum("source").notNull().default("MACHINE"),
    reviewedById: text("reviewed_by_id"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("translation_uq").on(t.entityType, t.entityId, t.field, t.locale),
    index("translation_lookup_idx").on(t.entityType, t.entityId, t.locale),
  ],
);

// ---------------------------------------------------------------------------
// Phase 2 · B2B (institutions and cohorts)
// ---------------------------------------------------------------------------

export const cohorts = pgTable(
  "cohorts",
  {
    id: id(),
    organisationId: text("organisation_id").notNull(),
    name: text("name").notNull(),
    academicYear: text("academic_year"),
    description: text("description"),
    joinCodeHash: text("join_code_hash"),
    isActive: boolean("is_active").notNull().default(true),
    createdById: text("created_by_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("cohort_org_idx").on(t.organisationId, t.isActive)],
);

/**
 * Membership is consented, not imposed.
 *
 * An institution can invite a student; it cannot add one. `consentedAt` is the
 * gate the analytics queries check — a student who never accepted is not in
 * anyone's dashboard.
 */
export const cohortMembers = pgTable(
  "cohort_members",
  {
    id: id(),
    cohortId: text("cohort_id").notNull(),
    userId: text("user_id"),
    inviteEmail: text("invite_email"),
    status: cohortMemberStatusEnum("status").notNull().default("INVITED"),
    consentedAt: timestamp("consented_at", { withTimezone: true }),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("cohort_member_cohort_idx").on(t.cohortId, t.status),
    uniqueIndex("cohort_member_uq").on(t.cohortId, t.userId),
  ],
);

// ---------------------------------------------------------------------------
// Phase 2 · Advertising
// ---------------------------------------------------------------------------

export const adCampaigns = pgTable(
  "ad_campaigns",
  {
    id: id(),
    organisationId: text("organisation_id").notNull(),
    name: text("name").notNull(),
    status: campaignStatusEnum("status").notNull().default("DRAFT"),
    countryId: text("country_id").notNull(),
    /** Targeting is by subject area, never by inferred personal attributes. */
    targetOccupationGroupIds: jsonb("target_occupation_group_ids").$type<string[]>(),
    targetExamIds: jsonb("target_exam_ids").$type<string[]>(),
    dailyImpressionCap: integer("daily_impression_cap"),
    startsOn: timestamp("starts_on", { withTimezone: true }),
    endsOn: timestamp("ends_on", { withTimezone: true }),
    reviewerId: text("reviewer_id"),
    reviewNote: text("review_note"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdById: text("created_by_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ad_campaign_status_idx").on(t.status, t.countryId)],
);

/**
 * A creative.
 *
 * `disclosureLabel` is NOT NULL with no meaningful empty default, and the only
 * component that renders a creative prints it. An advert that cannot say it is
 * an advert cannot be stored, let alone shown.
 */
export const adCreatives = pgTable(
  "ad_creatives",
  {
    id: id(),
    campaignId: text("campaign_id").notNull(),
    slot: text("slot").notNull(),
    headline: text("headline").notNull(),
    body: text("body").notNull(),
    imageUrl: text("image_url"),
    targetUrl: text("target_url").notNull(),
    ctaLabel: text("cta_label").notNull().default("Learn more"),
    disclosureLabel: text("disclosure_label").notNull().default("Paid promotion"),
    advertiserName: text("advertiser_name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [index("ad_creative_campaign_idx").on(t.campaignId, t.isActive)],
);

/**
 * Ad events, aggregated by day rather than stored per-impression.
 *
 * A row per view would be a browsing-history table for every signed-in user,
 * which is not a dataset this product should hold in order to bill an
 * advertiser. Counts per creative per day bill correctly and identify nobody.
 */
export const adEvents = pgTable(
  "ad_events",
  {
    id: id(),
    creativeId: text("creative_id").notNull(),
    type: adEventTypeEnum("type").notNull(),
    day: text("day").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [uniqueIndex("ad_event_uq").on(t.creativeId, t.type, t.day)],
);

// ---------------------------------------------------------------------------
// Relations (for drizzle query API)
// ---------------------------------------------------------------------------

export const countriesRelations = relations(countries, ({ many }) => ({
  regions: many(regions),
  careerProfiles: many(careerProfiles),
  exams: many(exams),
}));

export const regionsRelations = relations(regions, ({ one }) => ({
  country: one(countries, { fields: [regions.countryId], references: [countries.id] }),
}));

export const occupationsRelations = relations(occupations, ({ one, many }) => ({
  group: one(occupationGroups, {
    fields: [occupations.groupId],
    references: [occupationGroups.id],
  }),
  skills: many(occupationSkills),
  careerProfiles: many(careerProfiles),
}));

export const occupationSkillsRelations = relations(occupationSkills, ({ one }) => ({
  occupation: one(occupations, {
    fields: [occupationSkills.occupationId],
    references: [occupations.id],
  }),
  skill: one(skills, { fields: [occupationSkills.skillId], references: [skills.id] }),
}));

export const careerProfilesRelations = relations(careerProfiles, ({ one, many }) => ({
  occupation: one(occupations, {
    fields: [careerProfiles.occupationId],
    references: [occupations.id],
  }),
  country: one(countries, {
    fields: [careerProfiles.countryId],
    references: [countries.id],
  }),
  source: one(sources, { fields: [careerProfiles.sourceId], references: [sources.id] }),
  certifications: many(careerCertifications),
  entranceExams: many(careerEntranceExams),
  templates: many(roadmapTemplates),
}));

export const careerEntranceExamsRelations = relations(careerEntranceExams, ({ one }) => ({
  careerProfile: one(careerProfiles, {
    fields: [careerEntranceExams.careerProfileId],
    references: [careerProfiles.id],
  }),
  exam: one(exams, { fields: [careerEntranceExams.examId], references: [exams.id] }),
}));

export const careerCertificationsRelations = relations(careerCertifications, ({ one }) => ({
  careerProfile: one(careerProfiles, {
    fields: [careerCertifications.careerProfileId],
    references: [careerProfiles.id],
  }),
}));

export const roadmapTemplatesRelations = relations(roadmapTemplates, ({ one }) => ({
  careerProfile: one(careerProfiles, {
    fields: [roadmapTemplates.careerProfileId],
    references: [careerProfiles.id],
  }),
}));

export const examsRelations = relations(exams, ({ one, many }) => ({
  organisation: one(govOrganisations, {
    fields: [exams.organisationId],
    references: [govOrganisations.id],
  }),
  country: one(countries, { fields: [exams.countryId], references: [countries.id] }),
  source: one(sources, { fields: [exams.sourceId], references: [sources.id] }),
  stages: many(examStages),
  editions: many(examEditions),
  syllabusTopics: many(examSyllabusTopics),
  selectionSteps: many(examSelectionSteps),
  payStructure: many(examPayStructures),
  resources: many(learningResources),
}));

export const examStagesRelations = relations(examStages, ({ one, many }) => ({
  exam: one(exams, { fields: [examStages.examId], references: [exams.id] }),
  topics: many(examSyllabusTopics),
}));

export const examSyllabusTopicsRelations = relations(examSyllabusTopics, ({ one }) => ({
  exam: one(exams, { fields: [examSyllabusTopics.examId], references: [exams.id] }),
  stage: one(examStages, {
    fields: [examSyllabusTopics.stageId],
    references: [examStages.id],
  }),
}));

export const examEditionsRelations = relations(examEditions, ({ one }) => ({
  exam: one(exams, { fields: [examEditions.examId], references: [exams.id] }),
  source: one(sources, { fields: [examEditions.sourceId], references: [sources.id] }),
}));

export const examSelectionStepsRelations = relations(examSelectionSteps, ({ one }) => ({
  exam: one(exams, { fields: [examSelectionSteps.examId], references: [exams.id] }),
}));

export const examPayStructuresRelations = relations(examPayStructures, ({ one }) => ({
  exam: one(exams, { fields: [examPayStructures.examId], references: [exams.id] }),
}));

export const learningResourcesRelations = relations(learningResources, ({ one }) => ({
  exam: one(exams, { fields: [learningResources.examId], references: [exams.id] }),
}));

export const jobPostingsRelations = relations(jobPostings, ({ one, many }) => ({
  company: one(companies, { fields: [jobPostings.companyId], references: [companies.id] }),
  occupation: one(occupations, {
    fields: [jobPostings.occupationId],
    references: [occupations.id],
  }),
  region: one(regions, { fields: [jobPostings.regionId], references: [regions.id] }),
  applications: many(jobApplications),
}));

export const companiesRelations = relations(companies, ({ many, one }) => ({
  postings: many(jobPostings),
  country: one(countries, { fields: [companies.countryId], references: [countries.id] }),
}));

export const jobApplicationsRelations = relations(jobApplications, ({ one }) => ({
  user: one(users, { fields: [jobApplications.userId], references: [users.id] }),
  jobPosting: one(jobPostings, {
    fields: [jobApplications.jobPostingId],
    references: [jobPostings.id],
  }),
  resume: one(userDocuments, {
    fields: [jobApplications.resumeDocumentId],
    references: [userDocuments.id],
  }),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(userProfiles, { fields: [users.id], references: [userProfiles.userId] }),
  interests: many(userInterests),
  skills: many(userSkills),
  goals: many(userGoals),
  documents: many(userDocuments),
  savedItems: many(savedItems),
  roadmaps: many(roadmaps),
  conversations: many(aiConversations),
  applications: many(jobApplications),
  notifications: many(notifications),
}));

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(users, { fields: [userProfiles.userId], references: [users.id] }),
  country: one(countries, { fields: [userProfiles.countryId], references: [countries.id] }),
  region: one(regions, { fields: [userProfiles.regionId], references: [regions.id] }),
  educationStage: one(educationStages, {
    fields: [userProfiles.educationStageId],
    references: [educationStages.id],
  }),
}));

export const userSkillsRelations = relations(userSkills, ({ one }) => ({
  user: one(users, { fields: [userSkills.userId], references: [users.id] }),
  skill: one(skills, { fields: [userSkills.skillId], references: [skills.id] }),
}));

export const userGoalsRelations = relations(userGoals, ({ one }) => ({
  user: one(users, { fields: [userGoals.userId], references: [users.id] }),
  targetCareer: one(careerProfiles, {
    fields: [userGoals.targetCareerProfileId],
    references: [careerProfiles.id],
  }),
  targetExam: one(exams, { fields: [userGoals.targetExamId], references: [exams.id] }),
}));

export const userDocumentsRelations = relations(userDocuments, ({ one }) => ({
  user: one(users, { fields: [userDocuments.userId], references: [users.id] }),
  extraction: one(documentExtractions, {
    fields: [userDocuments.id],
    references: [documentExtractions.documentId],
  }),
}));

export const documentExtractionsRelations = relations(documentExtractions, ({ one }) => ({
  document: one(userDocuments, {
    fields: [documentExtractions.documentId],
    references: [userDocuments.id],
  }),
}));

export const roadmapsRelations = relations(roadmaps, ({ one, many }) => ({
  user: one(users, { fields: [roadmaps.userId], references: [users.id] }),
  steps: many(roadmapSteps),
}));

export const roadmapStepsRelations = relations(roadmapSteps, ({ one }) => ({
  roadmap: one(roadmaps, { fields: [roadmapSteps.roadmapId], references: [roadmaps.id] }),
}));

export const studyPlansRelations = relations(studyPlans, ({ one }) => ({
  user: one(users, { fields: [studyPlans.userId], references: [users.id] }),
  exam: one(exams, { fields: [studyPlans.examId], references: [exams.id] }),
}));

export const aiConversationsRelations = relations(aiConversations, ({ one, many }) => ({
  user: one(users, { fields: [aiConversations.userId], references: [users.id] }),
  messages: many(aiMessages),
}));

export const aiMessagesRelations = relations(aiMessages, ({ one }) => ({
  conversation: one(aiConversations, {
    fields: [aiMessages.conversationId],
    references: [aiConversations.id],
  }),
}));

export const businessModelTemplatesRelations = relations(businessModelTemplates, ({ one }) => ({
  category: one(businessCategories, {
    fields: [businessModelTemplates.categoryId],
    references: [businessCategories.id],
  }),
  country: one(countries, {
    fields: [businessModelTemplates.countryId],
    references: [countries.id],
  }),
}));

export const govOrganisationsRelations = relations(govOrganisations, ({ one, many }) => ({
  country: one(countries, { fields: [govOrganisations.countryId], references: [countries.id] }),
  exams: many(exams),
}));

export const educationStagesRelations = relations(educationStages, ({ one, many }) => ({
  educationSystem: one(educationSystems, {
    fields: [educationStages.educationSystemId],
    references: [educationSystems.id],
  }),
  pathways: many(careerPathways),
}));

export const careerPathwaysRelations = relations(careerPathways, ({ one }) => ({
  fromStage: one(educationStages, {
    fields: [careerPathways.fromStageId],
    references: [educationStages.id],
  }),
}));

export const sourcesRelations = relations(sources, ({ many }) => ({
  careerProfiles: many(careerProfiles),
  exams: many(exams),
}));

// Convenience type exports -----------------------------------------------

/** Enum value unions, derived from the pgEnum definitions so they can't drift. */
export type DocumentType = (typeof documentTypeEnum.enumValues)[number];
export type ConfidenceLabel = (typeof confidenceLabelEnum.enumValues)[number];
export type PublishStatus = (typeof publishStatusEnum.enumValues)[number];
export type Level = (typeof levelEnum.enumValues)[number];
export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type SubscriptionPlan = (typeof subscriptionPlanEnum.enumValues)[number];
export type ExtractionStatus = (typeof extractionStatusEnum.enumValues)[number];
export type EmploymentType = (typeof employmentTypeEnum.enumValues)[number];
export type RemoteType = (typeof remoteTypeEnum.enumValues)[number];

export type CareerProfileRow = typeof careerProfiles.$inferSelect;
export type ExamRow = typeof exams.$inferSelect;
export type JobPostingRow = typeof jobPostings.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type UserProfileRow = typeof userProfiles.$inferSelect;
export type OccupationRow = typeof occupations.$inferSelect;
export type SourceRow = typeof sources.$inferSelect;
export type RoadmapRow = typeof roadmaps.$inferSelect;
export type RoadmapStepRow = typeof roadmapSteps.$inferSelect;
export type BusinessModelRow = typeof businessModelTemplates.$inferSelect;
export const schemaSql = sql;
