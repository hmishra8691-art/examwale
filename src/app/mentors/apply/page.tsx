import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePage } from "@/modules/auth/session";
import { getMentorForUser } from "@/modules/mentors/service";
import { MentorApplyForm } from "@/components/mentor-forms";
import { Callout } from "@/components/ui";
import { getCountry } from "@/modules/geo/service";

export const metadata: Metadata = { title: "Become a mentor" };

export default async function MentorApplyPage() {
  const session = await requirePage("/mentors/apply");

  const existing = await getMentorForUser(session.sub);
  if (existing) redirect("/dashboard/mentor");

  // The country the visitor is actually browsing, not the deployment default —
  // an organisation or mentor registers in the market they are looking at.
  const country = await getCountry();

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
        Become a mentor
      </h1>
      <p className="mt-2 text-muted">
        Thirty minutes with someone who has actually done it is worth more than a month of
        guessing. You don&rsquo;t need to be an expert — you need to be a step or two ahead.
      </p>

      <div className="mt-6">
        <Callout tone="info" title="What happens next">
          Your profile is not public when you submit it. You add credentials — an exam result, an
          employment letter, a professional registration — and a person checks at least one before
          you&rsquo;re listed. People booking these sessions are making real decisions off what
          you say about yourself, so the check comes first.
        </Callout>
      </div>

      <div className="mt-8">
        <MentorApplyForm countryId={country?.id ?? ""} />
      </div>
    </div>
  );
}
