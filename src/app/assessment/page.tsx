import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { skills as skillsTable, userProfiles, userSkills } from "@/db/schema";
import { getSession } from "@/modules/auth/session";
import { INTEREST_OPTIONS } from "@/modules/recommendations/assessment";
import { AssessmentWizard } from "@/components/assessment-wizard";
import { Callout } from "@/components/ui";

export const metadata: Metadata = {
  title: "Career assessment",
  description:
    "Answer a few questions about your interests, budget and how you like to work, and see careers ranked against your answers — with the reasoning for each.",
};

export default async function AssessmentPage() {
  const session = await getSession();

  const [profile, existingSkills] = session
    ? await Promise.all([
        db.query.userProfiles.findFirst({ where: eq(userProfiles.userId, session.sub) }),
        db
          .select({ name: skillsTable.name })
          .from(userSkills)
          .innerJoin(skillsTable, eq(userSkills.skillId, skillsTable.id))
          .where(eq(userSkills.userId, session.sub)),
      ])
    : [null, []];

  return (
    <div className="page page-measure-sm py-8">
      <header className="mb-6">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight sm:text-4xl">
          Career assessment
        </h1>
        <p className="mt-2 text-muted">
          Six questions. Then careers ranked against your answers, with the reason for each ranking
          shown next to it.
        </p>
      </header>

      <Callout tone="info" title="What this is, and what it isn't">
        <p>
          This is a transparent scoring model, not a psychometric test. It weighs what you tell us
          about your interests, budget, time and preferences against what each career record says it
          requires. Every point it awards is explainable, and we show you the reasoning. Treat the
          output as a shortlist worth investigating — not a verdict on who you are.
        </p>
      </Callout>

      <div className="mt-6">
        <AssessmentWizard
          interestOptions={INTEREST_OPTIONS}
          signedIn={Boolean(session)}
          defaults={{
            budget: profile?.availableBudget ?? null,
            hoursPerDay: profile?.availableHoursPerDay ?? null,
            yearsExperience: profile?.yearsExperience ?? null,
            riskTolerance: (profile?.riskTolerance as "low" | "medium" | "high") ?? "medium",
            currentSkills: existingSkills.map((row) => row.name),
          }}
        />
      </div>
    </div>
  );
}
