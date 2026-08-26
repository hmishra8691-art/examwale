/**
 * Seeds the database with the India starting corpus.
 *
 * Run with: npm run db:seed  (or npm run db:reset to wipe and reseed)
 *
 * Everything published here carries a source and a verification record, because
 * the publish gate refuses records that don't — including during seeding. The
 * editorial source is explicitly tiered TERTIARY and its notes say the numbers
 * are planning estimates. That is the honest state of a seeded dataset, and the
 * admin review queue exists to move records off it.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { slugify } from "@/db/id";
import { seedCourses } from "@/db/seed/courses";
import { seedMentors } from "@/db/seed/mentors";
import { seedPlans } from "@/db/seed/plans";
import { seedUae } from "@/db/seed/uae";
import { seedCoverage } from "@/db/seed/coverage";
import {
  businessCategories,
  countries,
  businessModelTemplates,
  careerCertifications,
  careerEntranceExams,
  careerProfiles,
  careerRelations,
  careerScholarships,
  companies,
  examEditions,
  examPayStructures,
  examSelectionSteps,
  examStages,
  examSyllabusTopics,
  exams,
  govOrganisations,
  jobPostings,
  jobPublicationPeriods,
  knowledgeChunks,
  learningResources,
  occupationSkills,
  occupations,
  regions,
  roadmapTemplates,
  scholarships,
  skills as skillsTable,
  userGoals,
  userInterests,
  userProfiles,
  userSkills,
  users,
  verificationRecords,
} from "@/db/schema";
import { seedReference } from "@/db/seed/reference";
import { CAREERS } from "@/db/seed/careers-data";
import { EXAMS } from "@/db/seed/exams-data";
import { COMPANIES, JOBS } from "@/db/seed/jobs-data";
import { BUSINESSES, BUSINESS_CATEGORIES } from "@/db/seed/business-data";

const SCHOLARSHIPS = [
  {
    name: "National Scholarship Portal — Central Sector Scheme",
    provider: "Ministry of Education, Government of India",
    type: "scholarship",
    summary:
      "Central government scholarships for students meeting merit and income criteria, administered through a single national portal covering many separate schemes.",
    eligibility:
      "Varies by scheme. Most set a family income ceiling and a minimum marks threshold. Check the specific scheme on the portal.",
    approxValue: "Varies by scheme",
    officialUrl: "https://scholarships.gov.in",
    careerSlugs: ["doctor-mbbs-in", "software-developer-in", "mechanical-engineer-in", "nurse-in", "civil-engineer-in"],
  },
  {
    name: "Post Matric Scholarship for SC/ST/OBC Students",
    provider: "Ministry of Social Justice and Empowerment",
    type: "scholarship",
    summary:
      "Support for post-matriculation studies for students from Scheduled Castes, Scheduled Tribes and Other Backward Classes, covering fees and maintenance allowance.",
    eligibility: "Caste certificate and family income within the prescribed limit. Terms are revised periodically.",
    approxValue: "Fee reimbursement plus maintenance allowance",
    officialUrl: "https://scholarships.gov.in",
    careerSlugs: ["doctor-mbbs-in", "software-developer-in", "civil-engineer-in", "nurse-in", "teacher-in"],
  },
  {
    name: "Education Loan under the Model Education Loan Scheme",
    provider: "Indian Banks' Association member banks",
    type: "loan",
    summary:
      "Bank education loans for higher studies in India and abroad. Loans up to the prescribed threshold do not require collateral under the model scheme.",
    eligibility:
      "Admission to a recognised course through a merit-based selection process. Terms, thresholds and interest subsidy eligibility differ by bank.",
    approxValue: "Varies; collateral-free up to the prescribed limit",
    officialUrl: "https://www.vidyalakshmi.co.in",
    careerSlugs: ["doctor-mbbs-in", "dentist-in", "software-developer-in", "mechanical-engineer-in", "architect-in"],
  },
  {
    name: "PM Vidyalaxmi / Central Sector Interest Subsidy",
    provider: "Ministry of Education",
    type: "scheme",
    summary:
      "Interest subsidy on education loans during the moratorium period for students from economically weaker sections studying at approved institutions.",
    eligibility: "Family income within the prescribed ceiling, and admission to an approved institution. Confirm current terms on the portal.",
    approxValue: "Full interest subsidy during the moratorium",
    officialUrl: "https://www.vidyalakshmi.co.in",
    careerSlugs: ["doctor-mbbs-in", "software-developer-in", "chartered-accountant-in"],
  },
  {
    name: "National Apprenticeship Promotion Scheme",
    provider: "Ministry of Skill Development and Entrepreneurship",
    type: "apprenticeship",
    summary:
      "Government-supported apprenticeships where trainees receive a stipend while learning a trade on the job, with government sharing part of the stipend cost.",
    eligibility: "Varies by trade and establishment. ITI holders and Class 10/12 pass candidates are the main cohorts.",
    approxValue: "Monthly stipend during training",
    officialUrl: "https://www.apprenticeshipindia.gov.in",
    careerSlugs: ["electrician-in", "welder-in", "plumber-in", "automobile-technician-in"],
  },
];

async function main() {
  console.log("→ Seeding ExamWale\n");

  await clearAll();

  const ref = await seedReference();
  console.log(`✓ reference data — ${ref.regionIds.size} regions, ${ref.groupIds.size} career groups, ${ref.skillIds.size} skills`);

  const examIdBySlug = await seedExams(ref);
  console.log(`✓ ${examIdBySlug.size} government exams`);

  const scholarshipIds = await seedScholarships(ref);
  console.log(`✓ ${scholarshipIds.size} financial assistance programmes`);

  const careerIdBySlug = await seedCareers(ref, examIdBySlug, scholarshipIds);
  console.log(`✓ ${careerIdBySlug.size} career profiles`);

  const jobCount = await seedJobs(ref);
  console.log(`✓ ${COMPANIES.length} companies, ${jobCount} job postings`);

  const businessCount = await seedBusinesses(ref);
  console.log(`✓ ${businessCount} business models`);

  const courseStats = await seedCourses(ref.countryId);
  console.log(
    `✓ ${courseStats.providers} course providers, ${courseStats.courses} courses, ${courseStats.batches} batches, ${courseStats.claims} unverified outcome claims`,
  );

  const planCount = await seedPlans();
  console.log(`✓ ${planCount} billing plans`);

  const coverageCount = await seedCoverage();
  console.log(`✓ ${coverageCount} coverage declarations for India`);

  // Before the corpus build on purpose: UAE careers must be indexed in the
  // same pass, and tagged AE, or the assistant would answer UAE questions
  // from Indian records.
  await seedUae();

  const chunkCount = await buildKnowledgeCorpus();
  console.log(`✓ ${chunkCount} retrieval chunks indexed`);

  await seedUsers(ref);
  console.log("✓ demo accounts");

  // After seedUsers on purpose: the sample mentor reviews are written against
  // the demo seeker account, which does not exist until that step has run.
  const mentorStats = await seedMentors(ref.countryId, examIdBySlug);
  console.log(
    `✓ ${mentorStats.listed} listed mentors (${mentorStats.pending} awaiting credential checks)`,
  );

  const countryRows = await db
    .select({ name: countries.name, iso: countries.isoCode })
    .from(countries)
    .where(eq(countries.isActive, true));
  console.log(
    `✓ ${countryRows.length} countries live: ${countryRows.map((c) => `${c.name} (${c.iso})`).join(", ")}`,
  );

  console.log("\nDone. Sign in with:");
  console.log("  admin@examwale.test / examwale-admin-2026   (admin)");
  console.log("  demo@examwale.test  / examwale-demo-2026    (seeker, profile filled in)");
  console.log("\nNote: seeded content is a starting corpus. Salary and cost figures are");
  console.log("planning estimates against an editorial source, not verified data.\n");
}

/** Seed data uses expressions like `2.2 * L`; Postgres integers won't take the float. */
const int = (value: number | null | undefined): number | null =>
  value == null ? null : Math.round(value);

async function clearAll() {
  // Truncate rather than delete: faster, resets nothing we need to keep, and
  // CASCADE handles the dependency order for us.
  await db.execute(sql`
    TRUNCATE TABLE
      ad_events, ad_creatives, ad_campaigns,
      cohort_members, cohorts,
      translations,
      notification_deliveries, notification_preferences,
      payments, subscriptions, plans,
      mentor_reviews, mentorship_sessions, mentor_availability,
      mentor_credentials, mentors,
      course_enquiries, course_outcome_claims, course_targets, course_batches,
      job_moderation_reviews, organisation_invites,
      knowledge_chunks, ai_messages, ai_conversations, ai_usage_logs,
      roadmap_steps, roadmaps, roadmap_templates, assessments, study_plans,
      document_extractions, user_documents, job_applications, saved_items,
      user_goals, user_skills, user_interests, user_profiles,
      password_reset_tokens, auth_sessions, notifications,
      organisation_members, organisations,
      job_postings, companies,
      business_model_templates, business_categories,
      career_scholarships, scholarships, career_entrance_exams,
      career_certifications, career_relations, career_profiles,
      learning_resources, exam_editions, exam_pay_structures,
      exam_selection_steps, exam_syllabus_topics, exam_stages, exams,
      gov_organisations, courses, providers,
      occupation_skills, occupations, occupation_groups, skills,
      career_pathways, qualifications, education_stages, education_systems,
      regions, countries, verification_records, audit_logs, sources, users
    RESTART IDENTITY CASCADE
  `);
}

// ---------------------------------------------------------------------------

async function seedExams(ref: Awaited<ReturnType<typeof seedReference>>) {
  const examIdBySlug = new Map<string, string>();
  const orgIdByShortName = new Map<string, string>();

  for (const seed of EXAMS) {
    let orgId = orgIdByShortName.get(seed.organisation.shortName);
    if (!orgId) {
      const [org] = await db
        .insert(govOrganisations)
        .values({
          name: seed.organisation.name,
          shortName: seed.organisation.shortName,
          countryId: ref.countryId,
          type: seed.organisation.type,
          website: seed.organisation.website,
        })
        .onConflictDoNothing()
        .returning();
      orgId =
        org?.id ??
        (
          await db.query.govOrganisations.findFirst({
            where: eq(govOrganisations.shortName, seed.organisation.shortName),
          })
        )!.id;
      orgIdByShortName.set(seed.organisation.shortName, orgId);
    }

    const sourceId = ref.sourceIds.get(seed.sourceKey) ?? ref.sourceIds.get("editorial")!;

    const [exam] = await db
      .insert(exams)
      .values({
        name: seed.name,
        shortName: seed.shortName,
        slug: seed.slug,
        organisationId: orgId,
        countryId: ref.countryId,
        category: seed.category,
        description: seed.description,
        eligibility: seed.eligibility,
        ageLimit: seed.ageLimit,
        nationalityRequirement: seed.nationality,
        educationRequirement: seed.educationRequirement,
        applicationProcess: seed.applicationProcess,
        officialWebsite: seed.officialWebsite,
        preparationMonthsTypical: seed.preparationMonths,
        difficultyLevel: seed.difficulty,
        competitionNote: seed.competitionNote,
        status: "PUBLISHED",
        sourceId,
        lastVerifiedAt: new Date(),
      })
      .returning();

    examIdBySlug.set(seed.slug, exam.id);

    // The publish gate requires a live verification record. Seeded records get
    // a 180-day window so they surface in the admin re-check queue rather than
    // sitting "verified" forever on the strength of having been seeded once.
    await db.insert(verificationRecords).values({
      entityType: "exam",
      entityId: exam.id,
      sourceId,
      expiresAt: new Date(Date.now() + 180 * 86_400_000),
      note: "Seeded from the starting corpus. Structure verified against the recruiting body; cycle-specific data not yet captured.",
    });

    const stageIds: string[] = [];
    for (const [index, stage] of seed.stages.entries()) {
      const [row] = await db
        .insert(examStages)
        .values({
          examId: exam.id,
          name: stage.name,
          sequence: index + 1,
          pattern: stage.pattern,
          durationMinutes: stage.durationMinutes ?? null,
          marksTotal: stage.marksTotal ?? null,
          negativeMarking: stage.negativeMarking ?? false,
          negativeMarkingRatio: stage.negativeMarkingRatio ?? null,
          isQualifyingOnly: stage.isQualifyingOnly ?? false,
        })
        .returning();
      stageIds.push(row.id);
    }

    let sequence = 0;
    for (const subject of seed.syllabus) {
      for (const topic of subject.topics) {
        await db.insert(examSyllabusTopics).values({
          examId: exam.id,
          stageId: null,
          subject: subject.subject,
          topic: topic.topic,
          weightEstimate: topic.weight,
          sequence: sequence++,
        });
      }
    }

    await db.insert(examSelectionSteps).values(
      seed.selection.map((step, index) => ({
        examId: exam.id,
        sequence: index + 1,
        name: step.name,
        description: step.description,
      })),
    );

    if (seed.pay?.length) {
      await db.insert(examPayStructures).values(
        seed.pay.map((pay) => ({
          examId: exam.id,
          postName: pay.postName,
          payLevel: pay.payLevel ?? null,
          grossRangeMin: pay.grossMin ?? null,
          grossRangeMax: pay.grossMax ?? null,
          note: pay.note ?? null,
        })),
      );
    }

    if (seed.resources.length) {
      await db.insert(learningResources).values(
        seed.resources.map((resource, index) => ({
          examId: exam.id,
          kind: resource.kind,
          title: resource.title,
          author: resource.author ?? null,
          publisher: resource.publisher ?? null,
          url: resource.url ?? null,
          budgetTier: resource.budgetTier,
          costNote: resource.costNote ?? null,
          note: resource.note ?? null,
          sequence: index,
        })),
      );
    }

    // An edition row exists so the UI has somewhere to show cycle data, but it
    // stays in DRAFT with no dates. Seeding a plausible date would be exactly
    // the failure this product exists to prevent.
    await db.insert(examEditions).values({
      examId: exam.id,
      year: new Date().getFullYear(),
      status: "DRAFT",
      officialNotificationUrl: seed.officialWebsite,
      sourceId,
    });
  }

  return examIdBySlug;
}

// ---------------------------------------------------------------------------

async function seedScholarships(ref: Awaited<ReturnType<typeof seedReference>>) {
  const ids = new Map<string, { id: string; careerSlugs: string[] }>();
  const sourceId = ref.sourceIds.get("scholarships")!;

  for (const seed of SCHOLARSHIPS) {
    const [row] = await db
      .insert(scholarships)
      .values({
        name: seed.name,
        countryId: ref.countryId,
        provider: seed.provider,
        type: seed.type,
        summary: seed.summary,
        eligibility: seed.eligibility,
        approxValue: seed.approxValue,
        officialUrl: seed.officialUrl,
        sourceId,
        lastVerifiedAt: new Date(),
        status: "PUBLISHED",
      })
      .returning();

    await db.insert(verificationRecords).values({
      entityType: "scholarship",
      entityId: row.id,
      sourceId,
      expiresAt: new Date(Date.now() + 180 * 86_400_000),
      note: "Programme exists and is described from the official portal. Amounts and eligibility ceilings change — re-verify each cycle.",
    });

    ids.set(seed.name, { id: row.id, careerSlugs: seed.careerSlugs });
  }
  return ids;
}

// ---------------------------------------------------------------------------

async function seedCareers(
  ref: Awaited<ReturnType<typeof seedReference>>,
  examIdBySlug: Map<string, string>,
  scholarshipIds: Map<string, { id: string; careerSlugs: string[] }>,
) {
  const careerIdBySlug = new Map<string, string>();
  const editorialSource = ref.sourceIds.get("editorial")!;

  // Pass 1 — occupations and career profiles.
  for (const seed of CAREERS) {
    const groupId = ref.groupIds.get(seed.group);
    if (!groupId) throw new Error(`Unknown occupation group: ${seed.group}`);

    const occupationSlug = slugify(seed.occupation);
    const [occupation] = await db
      .insert(occupations)
      .values({
        globalCode: `OCC-${occupationSlug.toUpperCase()}`,
        name: seed.occupation,
        slug: occupationSlug,
        description: seed.description,
        groupId,
      })
      .onConflictDoNothing()
      .returning();

    const occupationId =
      occupation?.id ??
      (await db.query.occupations.findFirst({ where: eq(occupations.slug, occupationSlug) }))!.id;

    // Skill links on the occupation, not the country-scoped profile — skills
    // are part of the global taxonomy.
    for (const skillName of seed.skills) {
      const skillId = ref.skillIds.get(skillName);
      if (!skillId) continue;
      await db
        .insert(occupationSkills)
        .values({ occupationId, skillId, importance: 4 })
        .onConflictDoNothing();
    }

    const [profile] = await db
      .insert(careerProfiles)
      .values({
        occupationId,
        countryId: ref.countryId,
        slug: seed.slug,
        summary: seed.summary,
        dayToDay: seed.dayToDay,
        workEnvironment: seed.workEnvironment,
        educationRequired: seed.education,
        eligibility: seed.eligibility,
        timeRequiredMonthsMin: seed.timeMonths[0],
        timeRequiredMonthsMax: seed.timeMonths[1],
        costMin: int(seed.cost[0]),
        costMax: int(seed.cost[1]),
        currencyCode: "INR",
        lowCostAlternatives: seed.lowCost?.map((alt) => ({ ...alt, approxCost: int(alt.approxCost) ?? undefined })) ?? null,
        salaryEntryMin: int(seed.salary.entry[0]),
        salaryEntryMax: int(seed.salary.entry[1]),
        salaryMidMin: int(seed.salary.mid[0]),
        salaryMidMax: int(seed.salary.mid[1]),
        salarySeniorMin: int(seed.salary.senior[0]),
        salarySeniorMax: int(seed.salary.senior[1]),
        salaryConfidence: "ESTIMATED",
        selfEmploymentPossible: seed.selfEmployment ?? false,
        freelancingPossible: seed.freelancing ?? false,
        remotePossible: seed.remote ?? false,
        internationalNote: seed.internationalNote ?? null,
        automationRiskLevel: seed.automationRisk,
        futureDemandLevel: seed.demand,
        competitionLevel: seed.competition,
        difficultyLevel: seed.difficulty,
        advantages: seed.advantages,
        disadvantages: seed.disadvantages,
        progression: seed.progression,
        nextSteps: seed.nextSteps,
        licensingNote: seed.licensing ?? null,
        isRegulated: seed.regulated ?? false,
        status: "PUBLISHED",
        sourceId: editorialSource,
        lastVerifiedAt: new Date(),
      })
      .returning();

    careerIdBySlug.set(seed.slug, profile.id);

    await db.insert(verificationRecords).values({
      entityType: "career",
      entityId: profile.id,
      sourceId: editorialSource,
      expiresAt: new Date(Date.now() + 180 * 86_400_000),
      note: "Editorial starting corpus. Structural facts researched; salary and cost figures are planning estimates requiring verification against a primary source.",
    });

    if (seed.certifications?.length) {
      await db.insert(careerCertifications).values(
        seed.certifications.map((cert) => ({
          careerProfileId: profile.id,
          name: cert.name,
          provider: cert.provider ?? null,
          approxCost: int(cert.approxCost),
          isFree: cert.isFree ?? false,
        })),
      );
    }

    if (seed.roadmap?.length) {
      await db.insert(roadmapTemplates).values({
        careerProfileId: profile.id,
        title: `Path to ${seed.occupation}`,
        steps: seed.roadmap,
      });
    }
  }

  // Pass 2 — cross-references, now that every profile has an id.
  for (const seed of CAREERS) {
    const profileId = careerIdBySlug.get(seed.slug)!;

    for (const relatedSlug of seed.related ?? []) {
      const toId = careerIdBySlug.get(relatedSlug);
      if (!toId || toId === profileId) continue;
      await db
        .insert(careerRelations)
        .values({ fromId: profileId, toId, relationType: "adjacent" })
        .onConflictDoNothing();
    }

    for (const examSlug of seed.exams ?? []) {
      const examId = examIdBySlug.get(examSlug);
      if (!examId) continue;
      await db
        .insert(careerEntranceExams)
        .values({ careerProfileId: profileId, examId })
        .onConflictDoNothing();
    }
  }

  for (const { id, careerSlugs } of scholarshipIds.values()) {
    for (const careerSlug of careerSlugs) {
      const careerProfileId = careerIdBySlug.get(careerSlug);
      if (!careerProfileId) continue;
      await db
        .insert(careerScholarships)
        .values({ careerProfileId, scholarshipId: id })
        .onConflictDoNothing();
    }
  }

  return careerIdBySlug;
}

// ---------------------------------------------------------------------------

async function seedJobs(ref: Awaited<ReturnType<typeof seedReference>>) {
  const companyIdBySlug = new Map<string, string>();

  for (const company of COMPANIES) {
    const [row] = await db
      .insert(companies)
      .values({
        name: company.name,
        slug: company.slug,
        countryId: ref.countryId,
        industry: company.industry,
        sizeBand: company.sizeBand,
        about: company.about,
        verificationStatus: "unverified",
      })
      .returning();
    companyIdBySlug.set(company.slug, row.id);
  }

  let count = 0;
  const now = Date.now();

  for (const [index, job] of JOBS.entries()) {
    const companyId = companyIdBySlug.get(job.companySlug);
    if (!companyId) continue;

    const regionId = ref.regionIds.get(job.region) ?? null;
    const occupationId = job.occupationSlug
      ? (await db.query.occupations.findFirst({ where: eq(occupations.slug, job.occupationSlug) }))?.id ?? null
      : null;

    const postedAt = new Date(now - index * 2 * 86_400_000);
    /*
      Application windows spread across the whole range rather than a flat 45
      days for every posting.

      Two reasons. Real boards look like this — some roles close this week,
      some next quarter — and a column of identical "45 days left" badges reads
      as obviously fake. And the countdown escalates its tone at 7 and 21 days,
      so a uniform value means two of the three states never appear in the demo
      and nobody notices when one of them breaks.

      Deterministic, not random: the same index always produces the same date,
      so a screenshot diff or a smoke assertion does not shift under it.

      Note this is only defensible because these postings are fictional — ten
      invented companies, flagged `source: "seed"` and slated for deletion
      before launch. Exam application windows are seeded with NO dates for the
      opposite reason: a plausible-looking UPSC deadline is how somebody misses
      the real one.
    */
    const SPREAD_DAYS = [3, 52, 11, 88, 5, 34, 120, 18, 2, 67, 26, 150, 9, 41, 74, 14, 200, 6, 29, 95];
    const expiresAt = new Date(now + SPREAD_DAYS[index % SPREAD_DAYS.length] * 86_400_000);

    const [posting] = await db.insert(jobPostings).values({
      companyId,
      occupationId,
      title: job.title,
      slug: job.slug,
      description: job.description,
      responsibilities: job.responsibilities,
      employmentType: job.employmentType,
      remoteType: job.remoteType,
      regionId,
      city: job.city,
      experienceMinYears: job.experienceMin,
      experienceMaxYears: job.experienceMax ?? null,
      educationRequired: job.educationRequired ?? null,
      skillsRequired: job.skillsRequired,
      skillsPreferred: job.skillsPreferred ?? null,
      salaryMin: int(job.salaryMin),
      salaryMax: int(job.salaryMax),
      isSalaryDisclosed: job.disclosed,
      status: "ACTIVE",
      // Marked so demo listings can be identified and purged before real
      // listings are ingested.
      source: "seed",
      postedAt,
      expiresAt,
    }).returning({ id: jobPostings.id });

    /*
     * Every live posting needs its first publication period.
     *
     * Without one its history reads as "never published" and the first revival
     * would open period 1 rather than period 2 — so a fresh install would need
     * the backfill script to be correct, which is not what a seed is for.
     */
    await db.insert(jobPublicationPeriods).values({
      jobPostingId: posting.id,
      sequence: 1,
      publishedAt: postedAt,
      expiresAt,
    });
    count += 1;
  }

  return count;
}

// ---------------------------------------------------------------------------

async function seedBusinesses(ref: Awaited<ReturnType<typeof seedReference>>) {
  const categoryIds = new Map<string, string>();
  for (const category of BUSINESS_CATEGORIES) {
    const [row] = await db
      .insert(businessCategories)
      .values({ name: category.name, slug: category.slug })
      .returning();
    categoryIds.set(category.slug, row.id);
  }

  const sourceId = ref.sourceIds.get("editorial")!;
  let count = 0;

  for (const business of BUSINESSES) {
    const categoryId = categoryIds.get(business.category);
    if (!categoryId) continue;

    await db.insert(businessModelTemplates).values({
      categoryId,
      countryId: ref.countryId,
      name: business.name,
      slug: business.slug,
      targetCustomer: business.targetCustomer,
      summary: business.summary,
      startupCostMin: int(business.startupCost[0])!,
      startupCostMax: int(business.startupCost[1])!,
      fixedCosts: business.fixedCosts,
      variableCosts: business.variableCosts,
      equipment: business.equipment,
      licenses: business.licenses,
      skills: business.skills,
      suppliersNote: business.suppliersNote,
      marketingPlan: business.marketingPlan,
      pricingModel: business.pricingModel,
      revenueModel: business.revenueModel,
      breakEven: business.breakEven,
      risks: business.risks,
      competition: business.competition,
      growth: business.growth,
      aiOpportunities: business.aiOpportunities,
      launchPlan: business.launchPlan,
      status: "PUBLISHED",
      sourceId,
      lastVerifiedAt: new Date(),
    });
    count += 1;
  }

  return count;
}

// ---------------------------------------------------------------------------

/**
 * Flattens published records into the retrieval corpus.
 *
 * Each chunk is a self-contained description that makes sense on its own,
 * because a retrieved fragment is read without the surrounding page.
 */
async function buildKnowledgeCorpus() {
  const rows: (typeof knowledgeChunks.$inferInsert)[] = [];

  /**
   * Every chunk is tagged with the country of the record it came from, never a
   * constant.
   *
   * Retrieval filters on `countryIso`, so a mis-tagged chunk does not merely
   * look wrong on a page — it feeds a UAE reader Indian eligibility rules
   * through the assistant, with a citation attached. The money and the "(in
   * <country>)" preamble come from the same row for the same reason: "₹" on an
   * AED salary is a factual error in the corpus itself.
   */
  const countryRows = await db
    .select({ id: countries.id, iso: countries.isoCode, name: countries.name, currency: countries.currencyCode })
    .from(countries);
  const countryById = new Map(countryRows.map((row) => [row.id, row]));
  const FALLBACK = { iso: "IN", name: "India", currency: "INR" };
  const countryFor = (id: string | null) => (id ? (countryById.get(id) ?? FALLBACK) : FALLBACK);

  /** Indian readers think in lakh; nobody else does. */
  const corpusMoney = (value: number | null, currency: string) => {
    if (value == null) return "not recorded";
    if (currency === "INR") return `₹${(value / 100_000).toFixed(1)} lakh`;
    return `${currency} ${value.toLocaleString("en-US")}`;
  };

  const careerRows = await db
    .select({
      slug: careerProfiles.slug,
      name: occupations.name,
      summary: careerProfiles.summary,
      dayToDay: careerProfiles.dayToDay,
      education: careerProfiles.educationRequired,
      eligibility: careerProfiles.eligibility,
      salaryEntryMin: careerProfiles.salaryEntryMin,
      salaryEntryMax: careerProfiles.salaryEntryMax,
      salarySeniorMax: careerProfiles.salarySeniorMax,
      costMin: careerProfiles.costMin,
      costMax: careerProfiles.costMax,
      timeMin: careerProfiles.timeRequiredMonthsMin,
      timeMax: careerProfiles.timeRequiredMonthsMax,
      demand: careerProfiles.futureDemandLevel,
      competition: careerProfiles.competitionLevel,
      advantages: careerProfiles.advantages,
      disadvantages: careerProfiles.disadvantages,
      lastVerifiedAt: careerProfiles.lastVerifiedAt,
      lowCost: careerProfiles.lowCostAlternatives,
      regulated: careerProfiles.isRegulated,
      licensing: careerProfiles.licensingNote,
      countryId: careerProfiles.countryId,
    })
    .from(careerProfiles)
    .innerJoin(occupations, eq(careerProfiles.occupationId, occupations.id))
    .where(eq(careerProfiles.status, "PUBLISHED"));

  for (const career of careerRows) {
    const place = countryFor(career.countryId);
    const money = (value: number | null) => corpusMoney(value, place.currency);

    rows.push({
      entityType: "career",
      entitySlug: career.slug,
      title: career.name,
      countryIso: place.iso,
      content: [
        `${career.name} — career guide (${place.name}).`,
        career.summary,
        `Day to day: ${career.dayToDay}`,
        `Education required: ${(career.education as { label: string; detail: string }[]).map((e) => `${e.label} — ${e.detail}`).join(" ")}`,
        `Eligibility: ${(career.eligibility as { label: string; detail: string }[]).map((e) => `${e.label}: ${e.detail}`).join(" ")}`,
        `Typical time to qualify: ${career.timeMin ?? "?"}–${career.timeMax ?? "?"} months.`,
        `Approximate cost of education and training: ${money(career.costMin)} to ${money(career.costMax)}.`,
        career.lowCost
          ? `Lower-cost routes: ${(career.lowCost as { label: string; detail: string }[]).map((a) => `${a.label} — ${a.detail}`).join(" ")}`
          : "",
        `Estimated salary range: entry ${money(career.salaryEntryMin)}–${money(career.salaryEntryMax)} per year, rising to about ${money(career.salarySeniorMax)} at senior level. These are planning estimates, not quoted figures.`,
        `Future demand rated ${career.demand}; competition rated ${career.competition}.`,
        `Advantages: ${(career.advantages as string[]).join(" ")}`,
        `Disadvantages: ${(career.disadvantages as string[]).join(" ")}`,
        career.regulated && career.licensing ? `Licensing: ${career.licensing}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      metadata: {
        sourceName: "ExamWale editorial research",
        lastVerifiedAt: career.lastVerifiedAt?.toISOString() ?? null,
        kind: "career",
      },
    });
  }

  const examRows = await db
    .select({
      slug: exams.slug,
      name: exams.name,
      shortName: exams.shortName,
      description: exams.description,
      eligibility: exams.eligibility,
      ageLimit: exams.ageLimit,
      education: exams.educationRequirement,
      website: exams.officialWebsite,
      prepMonths: exams.preparationMonthsTypical,
      competition: exams.competitionNote,
      lastVerifiedAt: exams.lastVerifiedAt,
      orgName: govOrganisations.name,
      countryId: exams.countryId,
    })
    .from(exams)
    .innerJoin(govOrganisations, eq(exams.organisationId, govOrganisations.id))
    .where(eq(exams.status, "PUBLISHED"));

  const allStages = await db
    .select({ examSlug: exams.slug, name: examStages.name })
    .from(examStages)
    .innerJoin(exams, eq(examStages.examId, exams.id));

  const stagesByExam = new Map<string, string[]>();
  for (const stage of allStages) {
    const list = stagesByExam.get(stage.examSlug) ?? [];
    list.push(stage.name);
    stagesByExam.set(stage.examSlug, list);
  }

  for (const exam of examRows) {
    const stages = stagesByExam.get(exam.slug) ?? [];
    const age = exam.ageLimit as { min?: number; max?: number; note?: string };
    const place = countryFor(exam.countryId);

    rows.push({
      entityType: "exam",
      entitySlug: exam.slug,
      title: `${exam.shortName} — ${exam.name}`,
      countryIso: place.iso,
      content: [
        `${exam.name} (${exam.shortName}), conducted by ${exam.orgName}.`,
        exam.description,
        `Education requirement: ${exam.education}`,
        `Eligibility: ${(exam.eligibility as { label: string; detail: string }[]).map((e) => `${e.label}: ${e.detail}`).join(" ")}`,
        `Age limit: ${age.min ?? "no minimum stated"} to ${age.max ?? "no upper limit stated"}. ${age.note ?? ""}`,
        `Stages: ${stages.join(", ") || "see official notification"}.`,
        `Typical preparation time: about ${exam.prepMonths ?? "?"} months.`,
        `Competition: ${exam.competition ?? "not recorded"}`,
        `Official website: ${exam.website}. Dates, vacancies and fees change every cycle and must be confirmed there.`,
      ].join("\n"),
      metadata: {
        sourceName: exam.orgName,
        sourceUrl: exam.website,
        lastVerifiedAt: exam.lastVerifiedAt?.toISOString() ?? null,
        kind: "exam",
      },
    });
  }

  const businessRows = await db
    .select()
    .from(businessModelTemplates)
    .where(eq(businessModelTemplates.status, "PUBLISHED"));

  for (const business of businessRows) {
    const place = countryFor(business.countryId);

    rows.push({
      entityType: "business",
      entitySlug: business.slug,
      title: business.name,
      countryIso: place.iso,
      content: [
        `${business.name} — business model guide (${place.name}).`,
        business.summary,
        `Target customer: ${business.targetCustomer}`,
        `Startup cost: ${corpusMoney(business.startupCostMin, place.currency)} to ${corpusMoney(business.startupCostMax, place.currency)}.`,
        `Licences and registrations: ${(business.licenses as { name: string; authority: string }[]).map((l) => `${l.name} (${l.authority})`).join(", ")}.`,
        `Skills needed: ${(business.skills as string[]).join(", ")}.`,
        `Pricing: ${business.pricingModel} Revenue: ${business.revenueModel}`,
        `Break-even: ${(business.breakEven as { formula: string; note: string }).formula}. ${(business.breakEven as { note: string }).note}`,
        `Risks: ${(business.risks as string[]).join(" ")}`,
        `Competition: ${business.competition}`,
      ].join("\n"),
      metadata: {
        sourceName: "ExamWale editorial research",
        lastVerifiedAt: business.lastVerifiedAt?.toISOString() ?? null,
        kind: "business",
      },
    });
  }

  if (rows.length) {
    await db.insert(knowledgeChunks).values(rows).onConflictDoNothing();
  }
  return rows.length;
}

// ---------------------------------------------------------------------------

async function seedUsers(ref: Awaited<ReturnType<typeof seedReference>>) {
  const adminHash = await bcrypt.hash("examwale-admin-2026", 12);
  const demoHash = await bcrypt.hash("examwale-demo-2026", 12);

  const [admin] = await db
    .insert(users)
    .values({
      email: "admin@examwale.test",
      name: "Platform Admin",
      passwordHash: adminHash,
      emailVerified: true,
      role: "SUPER_ADMIN",
      plan: "B2B",
    })
    .returning();
  await db.insert(userProfiles).values({ userId: admin.id, countryId: ref.countryId });

  const [demo] = await db
    .insert(users)
    .values({
      email: "demo@examwale.test",
      name: "Demo User",
      passwordHash: demoHash,
      emailVerified: true,
      role: "SEEKER",
      plan: "FREE",
    })
    .returning();

  const karnataka = ref.regionIds.get("Karnataka") ?? null;

  await db.insert(userProfiles).values({
    userId: demo.id,
    age: 24,
    countryId: ref.countryId,
    regionId: karnataka,
    city: "Bengaluru",
    educationStageId: ref.stageIds.get("undergraduate") ?? null,
    degree: "B.Com",
    major: "Commerce",
    employmentStatus: "unemployed",
    yearsExperience: 1,
    availableBudget: 50_000,
    availableHoursPerDay: 4,
    willingnessToRelocate: true,
    onlineOfflinePreference: "online",
    riskTolerance: "medium",
    desiredIncomeMin: 600_000,
  });

  // A partially filled profile so the dashboard, recommendations and matching
  // all have something real to work against on first sign-in.
  const demoSkills = ["Excel", "Communication", "Accounting", "Tally", "SQL"];
  for (const name of demoSkills) {
    const skill = await db.query.skills.findFirst({ where: eq(skillsTable.name, name) });
    if (!skill) continue;
    await db
      .insert(userSkills)
      .values({ userId: demo.id, skillId: skill.id, proficiency: 3, source: "self_reported" })
      .onConflictDoNothing();
  }

  await db.insert(userInterests).values(
    ["finance", "technology", "business"].map((tag) => ({ userId: demo.id, tag })),
  );

  await db.insert(userGoals).values({
    userId: demo.id,
    goalType: "get_job",
    note: "Find a first proper job that uses my commerce background but pays better than pure accounting.",
    priority: 1,
  });
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("\n✗ Seed failed:", error);
    await pool.end();
    process.exit(1);
  });
