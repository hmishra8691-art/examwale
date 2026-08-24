/**
 * Mentors seed.
 *
 * Ten demonstration mentors, seven listable and three deliberately left
 * PENDING with unverified credentials.
 *
 * The three pending ones are the important part. A seed that only contains
 * approved mentors makes the listability gate invisible — you cannot tell by
 * looking whether it works. With these, a fresh install shows seven mentors on
 * /mentors and three waiting in the admin queue, which is the behaviour the
 * gate is supposed to produce.
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  mentorAvailability,
  mentorCredentials,
  mentorReviews,
  mentorshipSessions,
  mentors,
  users,
} from "@/db/schema";

type MentorSeed = {
  email: string;
  name: string;
  headline: string;
  bio: string;
  city: string;
  languages: string[];
  examSlugs?: string[];
  careerSlugs?: string[];
  yearsExperience: number;
  currentRole: string;
  currentOrganisation: string;
  sessionRate: number;
  sessionMinutes: number;
  /** Left PENDING with nothing verified when false. */
  approved: boolean;
  credentials: { kind: string; title: string; issuer?: string }[];
  availability: { weekday: number; startMinute: number; endMinute: number }[];
};

const MORNING = { startMinute: 7 * 60, endMinute: 9 * 60 };
const EVENING = { startMinute: 19 * 60, endMinute: 22 * 60 };
const WEEKEND = { startMinute: 10 * 60, endMinute: 13 * 60 };

const MENTORS: MentorSeed[] = [
  {
    email: "mentor.anita@examwale.test",
    name: "Anita Deshmukh",
    headline: "IAS officer, 2019 batch — prelims strategy and optional selection",
    bio: "Cleared CSE on my third attempt after two years of working full time. I mostly help people work out whether the attempt is realistic for their situation before they give up a job for it.",
    city: "Pune",
    languages: ["Hindi", "English", "Marathi"],
    examSlugs: ["upsc-cse", "state-psc"],
    yearsExperience: 6,
    currentRole: "Sub-Divisional Magistrate",
    currentOrganisation: "Government of Maharashtra",
    sessionRate: 0,
    sessionMinutes: 30,
    approved: true,
    credentials: [
      { kind: "exam_result", title: "UPSC CSE 2019 — AIR 214", issuer: "UPSC" },
      { kind: "employment", title: "IAS, Maharashtra cadre", issuer: "DoPT" },
    ],
    availability: [
      { weekday: 6, ...WEEKEND },
      { weekday: 0, ...WEEKEND },
    ],
  },
  {
    email: "mentor.rakesh@examwale.test",
    name: "Rakesh Menon",
    headline: "Senior engineer — moving from tier-3 college to product companies",
    bio: "I did my B.Tech at a college nobody had heard of and spent four years in services before switching. Happy to talk honestly about what that switch actually takes.",
    city: "Bengaluru",
    languages: ["English", "Malayalam", "Hindi"],
    careerSlugs: ["software-developer-in"],
    examSlugs: ["gate"],
    yearsExperience: 11,
    currentRole: "Staff Engineer",
    currentOrganisation: "A payments company",
    sessionRate: 500,
    sessionMinutes: 45,
    approved: true,
    credentials: [
      { kind: "employment", title: "Staff Engineer, 11 years", issuer: "Employment letter" },
      { kind: "education", title: "B.Tech Computer Science", issuer: "Calicut University" },
    ],
    availability: [
      { weekday: 2, ...EVENING },
      { weekday: 4, ...EVENING },
      { weekday: 6, ...WEEKEND },
    ],
  },
  {
    email: "mentor.priya@examwale.test",
    name: "Priya Nair",
    headline: "Bank PO — IBPS and SBI preparation while working",
    bio: "Cleared IBPS PO in 2021 while doing a full-time job. Most of what I help with is scheduling: what actually fits around a nine-hour workday.",
    city: "Kochi",
    languages: ["English", "Malayalam"],
    examSlugs: ["ibps-po", "sbi-po"],
    yearsExperience: 4,
    currentRole: "Probationary Officer",
    currentOrganisation: "A public sector bank",
    sessionRate: 300,
    sessionMinutes: 30,
    approved: true,
    credentials: [{ kind: "exam_result", title: "IBPS PO 2021 — selected", issuer: "IBPS" }],
    availability: [
      { weekday: 1, ...EVENING },
      { weekday: 3, ...EVENING },
    ],
  },
  {
    email: "mentor.vikram@examwale.test",
    name: "Vikram Singh Rathore",
    headline: "Army officer — NDA, CDS and the SSB interview",
    bio: "Commissioned through NDA. The written paper is the easy half; I spend most sessions on what the SSB is actually assessing, which is rarely what candidates think.",
    city: "Jaipur",
    languages: ["Hindi", "English"],
    examSlugs: ["nda", "cds"],
    yearsExperience: 9,
    currentRole: "Major",
    currentOrganisation: "Indian Army",
    sessionRate: 0,
    sessionMinutes: 45,
    approved: true,
    credentials: [
      { kind: "exam_result", title: "NDA 2013 — selected", issuer: "UPSC" },
      { kind: "employment", title: "Commissioned officer", issuer: "Indian Army" },
    ],
    availability: [{ weekday: 0, ...WEEKEND }],
  },
  {
    email: "mentor.fatima@examwale.test",
    name: "Fatima Sheikh",
    headline: "Doctor — NEET, and deciding whether medicine is the right call",
    bio: "MBBS then MD. I talk to a lot of people who are being pushed towards NEET by family and haven't been asked what they want. That conversation is usually more useful than a study plan.",
    city: "Hyderabad",
    languages: ["English", "Hindi", "Telugu", "Urdu"],
    examSlugs: ["neet-ug"],
    careerSlugs: ["doctor-mbbs-in"],
    yearsExperience: 8,
    currentRole: "Consultant Physician",
    currentOrganisation: "A teaching hospital",
    sessionRate: 400,
    sessionMinutes: 30,
    approved: true,
    credentials: [
      { kind: "education", title: "MBBS", issuer: "Osmania Medical College" },
      { kind: "licence", title: "State medical council registration", issuer: "TSMC" },
    ],
    availability: [
      { weekday: 2, ...MORNING },
      { weekday: 5, ...MORNING },
    ],
  },
  {
    email: "mentor.sanjay@examwale.test",
    name: "Sanjay Kulkarni",
    headline: "Chartered Accountant — articleship, exams and practice vs industry",
    bio: "Qualified CA, eight years in industry after three in practice. Useful if you're weighing up which side to go into, or struggling with the attempt cycle.",
    city: "Mumbai",
    languages: ["English", "Hindi", "Marathi"],
    careerSlugs: ["chartered-accountant-in"],
    yearsExperience: 11,
    currentRole: "Finance Controller",
    currentOrganisation: "A manufacturing firm",
    sessionRate: 600,
    sessionMinutes: 45,
    approved: true,
    credentials: [{ kind: "licence", title: "ICAI membership", issuer: "ICAI" }],
    availability: [{ weekday: 6, ...WEEKEND }],
  },
  {
    email: "mentor.lakshmi@examwale.test",
    name: "Lakshmi Iyer",
    headline: "Teacher — CTET, state TET and what school teaching is actually like",
    bio: "Twelve years in a government school. Happy to help with the pedagogy paper, and to be straightforward about pay, posting and workload.",
    city: "Chennai",
    languages: ["English", "Tamil"],
    examSlugs: ["ctet"],
    yearsExperience: 12,
    currentRole: "Senior Teacher",
    currentOrganisation: "A government higher secondary school",
    sessionRate: 0,
    sessionMinutes: 30,
    approved: true,
    credentials: [
      { kind: "exam_result", title: "CTET Paper 2 — qualified", issuer: "CBSE" },
      { kind: "education", title: "B.Ed", issuer: "University of Madras" },
    ],
    availability: [
      { weekday: 3, ...EVENING },
      { weekday: 0, ...WEEKEND },
    ],
  },

  // --- Deliberately pending: the gate should keep these off /mentors --------
  {
    email: "mentor.pending.arjun@examwale.test",
    name: "Arjun Bhatt",
    headline: "Cleared SSC CGL — happy to help others",
    bio: "Applied recently. Credentials not yet checked.",
    city: "Ahmedabad",
    languages: ["Hindi", "English", "Gujarati"],
    examSlugs: ["ssc-cgl"],
    yearsExperience: 3,
    currentRole: "Assistant Section Officer",
    currentOrganisation: "Central government",
    sessionRate: 250,
    sessionMinutes: 30,
    approved: false,
    credentials: [{ kind: "exam_result", title: "SSC CGL 2022 — claimed", issuer: "Self-reported" }],
    availability: [],
  },
  {
    email: "mentor.pending.neha@examwale.test",
    name: "Neha Gupta",
    headline: "GATE topper, IIT alumna",
    bio: "Applied recently. Credentials not yet checked.",
    city: "Kanpur",
    languages: ["Hindi", "English"],
    examSlugs: ["gate"],
    yearsExperience: 2,
    currentRole: "Research Associate",
    currentOrganisation: "An IIT",
    sessionRate: 800,
    sessionMinutes: 45,
    approved: false,
    credentials: [{ kind: "exam_result", title: "GATE 2023 — AIR 47 (claimed)", issuer: "Self-reported" }],
    availability: [],
  },
  {
    email: "mentor.pending.imran@examwale.test",
    name: "Imran Qureshi",
    headline: "Career counsellor, 15 years",
    bio: "Applied recently. Credentials not yet checked.",
    city: "Lucknow",
    languages: ["Hindi", "English", "Urdu"],
    careerSlugs: [],
    yearsExperience: 15,
    currentRole: "Independent counsellor",
    currentOrganisation: "Self-employed",
    sessionRate: 1_200,
    sessionMinutes: 60,
    approved: false,
    credentials: [{ kind: "other", title: "Counselling certification (claimed)", issuer: "Self-reported" }],
    availability: [],
  },
];

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(11, 0, 0, 0);
  return date;
}

export async function seedMentors(
  countryId: string,
  examIdBySlug: Map<string, string>,
): Promise<{ listed: number; pending: number }> {
  const passwordHash = await bcrypt.hash("examwale-mentor-2026", 12);

  let listed = 0;
  let pending = 0;
  const listedMentorIds: { mentorId: string; userId: string }[] = [];

  for (const seed of MENTORS) {
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, seed.email))
      .limit(1);

    const userId =
      existingUser?.id ??
      (
        await db
          .insert(users)
          .values({
            email: seed.email,
            name: seed.name,
            passwordHash,
            role: "SEEKER",
            emailVerified: true,
          })
          .returning({ id: users.id })
      )[0].id;

    const [mentor] = await db
      .insert(mentors)
      .values({
        userId,
        headline: seed.headline,
        bio: seed.bio,
        countryId,
        city: seed.city,
        languages: seed.languages,
        expertiseCareerSlugs: seed.careerSlugs?.length ? seed.careerSlugs : null,
        expertiseExamIds: seed.examSlugs?.length
          ? seed.examSlugs.map((slug) => examIdBySlug.get(slug)).filter((id): id is string => Boolean(id))
          : null,
        yearsExperience: seed.yearsExperience,
        currentRole: seed.currentRole,
        currentOrganisation: seed.currentOrganisation,
        sessionRate: seed.sessionRate,
        sessionMinutes: seed.sessionMinutes,
        status: seed.approved ? "ACTIVE" : "PENDING",
        credentialVerifiedAt: seed.approved ? daysAgo(20) : null,
      })
      .returning({ id: mentors.id });

    for (const credential of seed.credentials) {
      await db.insert(mentorCredentials).values({
        mentorId: mentor.id,
        kind: credential.kind,
        title: credential.title,
        issuer: credential.issuer ?? null,
        status: seed.approved ? "VERIFIED" : "DISPUTED",
        verifiedAt: seed.approved ? daysAgo(20) : null,
      });
    }

    if (seed.availability.length) {
      await db.insert(mentorAvailability).values(
        seed.availability.map((slot) => ({
          mentorId: mentor.id,
          weekday: slot.weekday,
          startMinute: slot.startMinute,
          endMinute: slot.endMinute,
          timezone: "Asia/Kolkata",
        })),
      );
    }

    if (seed.approved) {
      listed += 1;
      listedMentorIds.push({ mentorId: mentor.id, userId });
    } else {
      pending += 1;
    }
  }

  // A few completed sessions with reviews, so the rating-suppression rule is
  // observable: the first mentor gets three (an average shows), the second
  // gets two (it does not).
  const [demoSeeker] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, "demo@examwale.test"))
    .limit(1);

  if (demoSeeker && listedMentorIds.length >= 2) {
    const plan: { target: number; reviews: { rating: number; comment: string }[] }[] = [
      {
        target: 0,
        reviews: [
          { rating: 5, comment: "Told me plainly that my timeline wasn't realistic. Needed to hear it." },
          { rating: 4, comment: "Very practical about balancing the attempt with work." },
          { rating: 5, comment: "Went through my optional choice properly." },
        ],
      },
      {
        target: 1,
        reviews: [
          { rating: 5, comment: "Clear about what the switch actually requires." },
          { rating: 4, comment: "Useful, though I wanted more on system design." },
        ],
      },
    ];

    for (const entry of plan) {
      const mentorEntry = listedMentorIds[entry.target];
      let offset = 40;
      for (const review of entry.reviews) {
        const [session] = await db
          .insert(mentorshipSessions)
          .values({
            mentorId: mentorEntry.mentorId,
            seekerId: demoSeeker.id,
            topic: "Career direction",
            scheduledAt: daysAgo(offset),
            durationMinutes: 30,
            status: "COMPLETED",
          })
          .returning({ id: mentorshipSessions.id });

        await db.insert(mentorReviews).values({
          sessionId: session.id,
          mentorId: mentorEntry.mentorId,
          seekerId: demoSeeker.id,
          rating: review.rating,
          comment: review.comment,
        });

        offset += 7;
      }
    }
  }

  return { listed, pending };
}
