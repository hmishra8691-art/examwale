/**
 * Courses and coaching seed.
 *
 * Demonstration data, and marked as such: every provider here is invented, and
 * every one carries `verificationStatus: "unverified"` so the UI's "we
 * haven't checked this provider" path is what you see by default rather than
 * an edge case nobody looks at.
 *
 * The outcome claims are the point of this seed. They are deliberately the
 * kind of figure the coaching industry actually advertises — a selection rate
 * with no denominator, a "highest package" that describes one person — and
 * almost all are left UNVERIFIED, so the labelling machinery is visible on a
 * fresh install instead of only appearing once someone enters bad data.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { slugify } from "@/db/id";
import { courseBatches, courseOutcomeClaims, courseTargets, courses, exams, providers } from "@/db/schema";

type ProviderSeed = {
  name: string;
  type: string;
  city: string;
  about: string;
  website: string;
};

const PROVIDERS: ProviderSeed[] = [
  {
    name: "Kautilya Civil Services Academy",
    type: "coaching",
    city: "Delhi",
    about:
      "Classroom and online coaching for the civil services examination, running since the late 1990s.",
    website: "https://example.org/kautilya",
  },
  {
    name: "Nalanda Banking Institute",
    type: "coaching",
    city: "Patna",
    about: "Banking and insurance exam preparation with evening batches for working candidates.",
    website: "https://example.org/nalanda-banking",
  },
  {
    name: "Sarvodaya SSC Classes",
    type: "coaching",
    city: "Lucknow",
    about: "Staff Selection Commission preparation, mainly CGL and CHSL.",
    website: "https://example.org/sarvodaya",
  },
  {
    name: "Brahmaputra Defence Academy",
    type: "coaching",
    city: "Guwahati",
    about: "NDA and CDS written preparation, plus SSB interview practice.",
    website: "https://example.org/brahmaputra",
  },
  {
    name: "Deccan Engineering Tutorials",
    type: "coaching",
    city: "Hyderabad",
    about: "GATE and JEE coaching run by former faculty of regional engineering colleges.",
    website: "https://example.org/deccan-eng",
  },
  {
    name: "Malabar Medical Coaching",
    type: "coaching",
    city: "Kozhikode",
    about: "NEET preparation with a repeaters' programme.",
    website: "https://example.org/malabar-medical",
  },
  {
    name: "Open Learning India",
    type: "platform",
    city: "Bengaluru",
    about: "Free and low-cost self-paced courses, largely recorded lectures with practice sets.",
    website: "https://example.org/open-learning-india",
  },
  {
    name: "Rashtriya Teaching Institute",
    type: "coaching",
    city: "Bhopal",
    about: "CTET and state TET preparation, including pedagogy modules.",
    website: "https://example.org/rashtriya-teaching",
  },
];

type CourseSeed = {
  provider: string;
  title: string;
  summary: string;
  examSlug?: string;
  isFree?: boolean;
  duration: string;
  batches: {
    label: string;
    mode: "ONLINE_LIVE" | "ONLINE_SELF_PACED" | "CLASSROOM" | "HYBRID" | "CORRESPONDENCE";
    monthsFromNow: number | null;
    fee: number | null;
    feeNote?: string;
    seatsTotal?: number;
    seatsLeft?: number;
    city?: string;
  }[];
  claims?: {
    metric: string;
    claimedValue: string;
    claimedPeriod?: string;
    note?: string;
  }[];
};

const COURSES: CourseSeed[] = [
  {
    provider: "Kautilya Civil Services Academy",
    title: "UPSC CSE Foundation — General Studies",
    summary:
      "Two-year general studies programme covering prelims and mains, with weekly answer writing.",
    examSlug: "upsc-cse",
    duration: "24 months",
    batches: [
      {
        label: "Classroom · Delhi · morning",
        mode: "CLASSROOM",
        monthsFromNow: 2,
        fee: 185_000,
        feeNote: "Quoted as a two-year fee. Ask whether test series is included.",
        seatsTotal: 120,
        seatsLeft: 34,
        city: "Delhi",
      },
      {
        label: "Online live · evening",
        mode: "ONLINE_LIVE",
        monthsFromNow: 1,
        fee: 96_000,
        seatsTotal: 400,
        seatsLeft: 210,
      },
    ],
    claims: [
      {
        metric: "selections_count",
        claimedValue: "31 selections",
        claimedPeriod: "2025 cycle",
        note: "Provider has not said how many students sat the exam.",
      },
      { metric: "faculty_experience", claimedValue: "Average 12 years teaching" },
    ],
  },
  {
    provider: "Kautilya Civil Services Academy",
    title: "UPSC Prelims Test Series",
    summary: "32 full-length prelims papers with explanations and percentile ranking.",
    examSlug: "upsc-cse",
    duration: "6 months",
    batches: [
      {
        label: "Online · rolling",
        mode: "ONLINE_SELF_PACED",
        monthsFromNow: 0,
        fee: 9_500,
      },
    ],
  },
  {
    provider: "Nalanda Banking Institute",
    title: "IBPS PO Complete Preparation",
    summary: "Prelims and mains coverage with daily quant and reasoning practice.",
    examSlug: "ibps-po",
    duration: "8 months",
    batches: [
      {
        label: "Classroom · Patna",
        mode: "CLASSROOM",
        monthsFromNow: 1,
        fee: 42_000,
        seatsTotal: 90,
        seatsLeft: 12,
        city: "Patna",
      },
      { label: "Online live", mode: "ONLINE_LIVE", monthsFromNow: 2, fee: 24_000 },
    ],
    claims: [
      {
        metric: "selection_rate",
        claimedValue: "68%",
        claimedPeriod: "2025",
        note: "Denominator not stated.",
      },
    ],
  },
  {
    provider: "Nalanda Banking Institute",
    title: "SBI PO Interview and Group Exercise",
    summary: "Mock interviews and group discussion practice for candidates through to the final stage.",
    examSlug: "sbi-po",
    duration: "6 weeks",
    batches: [
      { label: "Online live · weekends", mode: "ONLINE_LIVE", monthsFromNow: 3, fee: 11_000 },
    ],
  },
  {
    provider: "Sarvodaya SSC Classes",
    title: "SSC CGL Tier 1 and Tier 2",
    summary: "Full syllabus coverage with a focus on quantitative aptitude speed.",
    examSlug: "ssc-cgl",
    duration: "10 months",
    batches: [
      {
        label: "Classroom · Lucknow",
        mode: "CLASSROOM",
        monthsFromNow: 1,
        fee: 38_000,
        seatsTotal: 150,
        seatsLeft: 61,
        city: "Lucknow",
      },
      { label: "Hybrid · Lucknow + online", mode: "HYBRID", monthsFromNow: 2, fee: 29_000, city: "Lucknow" },
    ],
    claims: [
      { metric: "batch_size", claimedValue: "Maximum 60 per classroom batch" },
      {
        metric: "selections_count",
        claimedValue: "410 selections",
        claimedPeriod: "since 2019",
        note: "Cumulative across all exams and years.",
      },
    ],
  },
  {
    provider: "Sarvodaya SSC Classes",
    title: "SSC CHSL Crash Course",
    summary: "Eight-week revision programme before the tier 1 window.",
    examSlug: "ssc-chsl",
    duration: "8 weeks",
    batches: [
      { label: "Online live · evening", mode: "ONLINE_LIVE", monthsFromNow: 1, fee: 7_500 },
    ],
  },
  {
    provider: "Brahmaputra Defence Academy",
    title: "NDA Written and SSB Preparation",
    summary: "Mathematics and general ability written preparation plus five-day SSB simulation.",
    examSlug: "nda",
    duration: "12 months",
    batches: [
      {
        label: "Residential · Guwahati",
        mode: "CLASSROOM",
        monthsFromNow: 2,
        fee: 140_000,
        feeNote: "Includes lodging. Confirm what the mess charges are on top.",
        seatsTotal: 60,
        seatsLeft: 8,
        city: "Guwahati",
      },
    ],
    claims: [
      {
        metric: "selection_rate",
        claimedValue: "22%",
        claimedPeriod: "2024–25 residential batch",
        note: "Residential batch only; day-scholar figures not published.",
      },
    ],
  },
  {
    provider: "Brahmaputra Defence Academy",
    title: "CDS Written Preparation",
    summary: "English, general knowledge and elementary mathematics for the CDS written paper.",
    examSlug: "cds",
    duration: "6 months",
    batches: [
      { label: "Online live", mode: "ONLINE_LIVE", monthsFromNow: 1, fee: 22_000 },
    ],
  },
  {
    provider: "Deccan Engineering Tutorials",
    title: "GATE Computer Science",
    summary: "Subject-wise coverage with previous-year paper analysis and two revision cycles.",
    examSlug: "gate",
    duration: "11 months",
    batches: [
      {
        label: "Online live · weekday evening",
        mode: "ONLINE_LIVE",
        monthsFromNow: 1,
        fee: 45_000,
        seatsTotal: 250,
        seatsLeft: 96,
      },
      {
        label: "Classroom · Hyderabad",
        mode: "CLASSROOM",
        monthsFromNow: 2,
        fee: 68_000,
        city: "Hyderabad",
      },
    ],
    claims: [
      {
        metric: "highest_package",
        claimedValue: "₹44 LPA",
        claimedPeriod: "2025",
        note: "Describes one student's offer, not a typical outcome.",
      },
    ],
  },
  {
    provider: "Deccan Engineering Tutorials",
    title: "JEE Main Two-Year Programme",
    summary: "Physics, chemistry and mathematics from class 11, aligned to the JEE Main pattern.",
    examSlug: "jee-main",
    duration: "24 months",
    batches: [
      {
        label: "Classroom · Hyderabad",
        mode: "CLASSROOM",
        monthsFromNow: 3,
        fee: 210_000,
        feeNote: "Two-year fee. Instalment options not published.",
        city: "Hyderabad",
      },
    ],
  },
  {
    provider: "Malabar Medical Coaching",
    title: "NEET UG Repeaters' Programme",
    summary: "Full-year programme for candidates reattempting NEET, with fortnightly full tests.",
    examSlug: "neet-ug",
    duration: "12 months",
    batches: [
      {
        label: "Classroom · Kozhikode",
        mode: "CLASSROOM",
        monthsFromNow: 2,
        fee: 125_000,
        seatsTotal: 180,
        seatsLeft: 45,
        city: "Kozhikode",
      },
      { label: "Online live", mode: "ONLINE_LIVE", monthsFromNow: 1, fee: 58_000 },
    ],
    claims: [
      {
        metric: "selection_rate",
        claimedValue: "54% qualified",
        claimedPeriod: "2025 repeaters' batch",
        note: "Qualifying is not the same as securing an MBBS seat.",
      },
    ],
  },
  {
    provider: "Rashtriya Teaching Institute",
    title: "CTET Paper 1 and Paper 2",
    summary: "Child development and pedagogy, plus subject methodology for both papers.",
    examSlug: "ctet",
    duration: "5 months",
    batches: [
      { label: "Online live · weekends", mode: "ONLINE_LIVE", monthsFromNow: 1, fee: 14_000 },
      {
        label: "Classroom · Bhopal",
        mode: "CLASSROOM",
        monthsFromNow: 2,
        fee: 19_500,
        city: "Bhopal",
      },
    ],
  },
  {
    provider: "Open Learning India",
    title: "Quantitative Aptitude Foundations",
    summary:
      "Recorded lectures covering arithmetic and data interpretation, useful for most competitive exams.",
    isFree: true,
    duration: "Self-paced",
    batches: [
      { label: "Self-paced", mode: "ONLINE_SELF_PACED", monthsFromNow: null, fee: null },
    ],
  },
  {
    provider: "Open Learning India",
    title: "RRB NTPC Complete Practice Sets",
    summary: "Practice papers and solutions for the NTPC computer-based tests.",
    examSlug: "rrb-ntpc",
    duration: "Self-paced",
    batches: [
      { label: "Self-paced", mode: "ONLINE_SELF_PACED", monthsFromNow: null, fee: 499 },
    ],
  },
];

function monthsAhead(months: number): Date {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  date.setHours(9, 0, 0, 0);
  return date;
}

export async function seedCourses(countryId: string): Promise<{
  providers: number;
  courses: number;
  batches: number;
  claims: number;
}> {
  const examRows = await db.select({ id: exams.id, slug: exams.slug }).from(exams);
  const examBySlug = new Map(examRows.map((row) => [row.slug, row.id]));

  const providerIds = new Map<string, string>();
  for (const seed of PROVIDERS) {
    const slug = slugify(seed.name);
    const [existing] = await db
      .select({ id: providers.id })
      .from(providers)
      .where(eq(providers.slug, slug))
      .limit(1);

    if (existing) {
      providerIds.set(seed.name, existing.id);
      continue;
    }

    const [inserted] = await db
      .insert(providers)
      .values({
        name: seed.name,
        slug,
        type: seed.type,
        countryId,
        city: seed.city,
        about: seed.about,
        website: seed.website,
        // Demonstration data: nothing here has been checked, and the listing
        // pages should say so.
        verificationStatus: "unverified",
      })
      .returning({ id: providers.id });

    providerIds.set(seed.name, inserted.id);
  }

  let courseCount = 0;
  let batchCount = 0;
  let claimCount = 0;

  for (const seed of COURSES) {
    const providerId = providerIds.get(seed.provider);
    if (!providerId) continue;

    const [course] = await db
      .insert(courses)
      .values({
        providerId,
        title: seed.title,
        summary: seed.summary,
        format: seed.batches[0]?.mode.startsWith("ONLINE") ? "online" : "offline",
        isFree: seed.isFree ?? false,
        duration: seed.duration,
        status: "PUBLISHED",
        lastVerifiedAt: new Date(),
      })
      .returning({ id: courses.id });
    courseCount += 1;

    const examId = seed.examSlug ? examBySlug.get(seed.examSlug) : undefined;
    if (examId) {
      await db.insert(courseTargets).values({ courseId: course.id, examId });
    }

    for (const batch of seed.batches) {
      await db.insert(courseBatches).values({
        courseId: course.id,
        label: batch.label,
        mode: batch.mode,
        startsOn: batch.monthsFromNow == null ? null : monthsAhead(batch.monthsFromNow),
        seatsTotal: batch.seatsTotal ?? null,
        seatsLeft: batch.seatsLeft ?? null,
        feeAmount: batch.fee,
        feeNote: batch.feeNote ?? null,
        city: batch.city ?? null,
        isActive: true,
        lastVerifiedAt: new Date(),
      });
      batchCount += 1;
    }

    for (const claim of seed.claims ?? []) {
      await db.insert(courseOutcomeClaims).values({
        courseId: course.id,
        metric: claim.metric,
        claimedValue: claim.claimedValue,
        claimedPeriod: claim.claimedPeriod ?? null,
        note: claim.note ?? null,
        confidence: "UNVERIFIED",
      });
      claimCount += 1;
    }
  }

  return {
    providers: providerIds.size,
    courses: courseCount,
    batches: batchCount,
    claims: claimCount,
  };
}
