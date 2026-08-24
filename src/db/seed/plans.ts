/**
 * Billing plans.
 *
 * Prices are in whole rupees and are deliberately modest. This product's users
 * include people who are unemployed; a premium tier priced like a SaaS seat
 * would put the paid features out of reach of exactly the cohort the free
 * limits bite hardest for.
 *
 * The free plan exists as a row, not only as a fallback in code, so that the
 * pricing page can render all four tiers from one query and so that changing
 * the free AI allowance is a data edit rather than a deploy.
 */
import { db } from "@/db/client";
import { plans } from "@/db/schema";

export async function seedPlans(): Promise<number> {
  const rows = [
    {
      code: "free",
      name: "Free",
      plan: "FREE" as const,
      description:
        "Everything that makes the product honest — careers, exams, jobs, reality checks — with a daily cap on AI questions.",
      amount: 0,
      interval: "MONTHLY" as const,
      trialDays: 0,
      sequence: 0,
      entitlements: {
        aiDailyMessages: 15,
        mentorSessionsPerMonth: 1,
        resumeAnalysesPerMonth: 2,
        advancedFilters: false,
        adFree: false,
        cohortSeats: 0,
        dataExport: false,
      },
    },
    {
      code: "premium-monthly",
      name: "Premium (monthly)",
      plan: "PREMIUM" as const,
      description: "More AI questions, more mentor sessions, saved searches, and no paid placements.",
      amount: 249,
      interval: "MONTHLY" as const,
      trialDays: 7,
      sequence: 1,
      entitlements: {
        aiDailyMessages: 100,
        mentorSessionsPerMonth: 8,
        resumeAnalysesPerMonth: 20,
        advancedFilters: true,
        adFree: true,
        cohortSeats: 0,
        dataExport: true,
      },
    },
    {
      code: "premium-yearly",
      name: "Premium (yearly)",
      plan: "PREMIUM" as const,
      description: "The monthly plan, paid once a year — works out at about two months free.",
      amount: 2_490,
      interval: "YEARLY" as const,
      trialDays: 7,
      sequence: 2,
      entitlements: {
        aiDailyMessages: 100,
        mentorSessionsPerMonth: 8,
        resumeAnalysesPerMonth: 20,
        advancedFilters: true,
        adFree: true,
        cohortSeats: 0,
        dataExport: true,
      },
    },
    {
      code: "b2b-institution",
      name: "Institution",
      plan: "B2B" as const,
      description:
        "For colleges and schools: cohorts, aggregate progress reporting, and premium access for enrolled students.",
      amount: 40_000,
      interval: "YEARLY" as const,
      trialDays: 0,
      sequence: 3,
      entitlements: {
        aiDailyMessages: 100,
        mentorSessionsPerMonth: 8,
        resumeAnalysesPerMonth: 20,
        advancedFilters: true,
        adFree: true,
        cohortSeats: 250,
        dataExport: true,
      },
    },
  ];

  await db.insert(plans).values(rows).onConflictDoNothing();
  return rows.length;
}
