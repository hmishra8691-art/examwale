import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/modules/auth/session";
import { getPrimaryOrganisation } from "@/modules/employers/service";
import { ButtonLink, Callout, Card, SectionHeading } from "@/components/ui";

export const metadata: Metadata = {
  title: "Hire on ExamWale",
  description:
    "Post a role and reach people who are actively working out their next step. Every posting is checked before it goes live.",
};

const STEPS = [
  {
    title: "Register your organisation",
    body: "Name, contact and website. Two minutes.",
  },
  {
    title: "We verify you exist",
    body: "A person checks the organisation is real and is who it says it is. Usually the same working day.",
  },
  {
    title: "Write the posting",
    body: "Pay range, skills, location. Disclosing pay is optional but it roughly doubles the applications you'll get.",
  },
  {
    title: "A person reads it",
    body: "Every posting is read before publication. Adverts that ask candidates for money never reach the site.",
  },
];

export default async function EmployersLandingPage() {
  const session = await getSession();
  const membership = session ? await getPrimaryOrganisation(session.sub) : null;

  return (
    <div className="page page-measure py-12">
      <header className="max-w-2xl">
        <p className="text-sm font-medium text-brand-600">For employers</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight sm:text-4xl">
          Post a role, reach people deciding what to do next
        </h1>
        <p className="mt-4 text-muted">
          ExamWale is where people work out their career, not just where they scroll listings. A
          posting here reaches someone with a profile, a skills history and a stated direction.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {membership ? (
            <ButtonLink href="/employers/dashboard">Go to your hiring dashboard</ButtonLink>
          ) : (
            <ButtonLink href="/employers/register">Register your organisation</ButtonLink>
          )}
          <ButtonLink href="/jobs" variant="secondary">
            See what&rsquo;s posted
          </ButtonLink>
        </div>
      </header>

      <section className="mt-12">
        <SectionHeading
          title="How posting works"
          description="Four steps, one of which is a person reading what you wrote."
        />
        <ol className="mt-6 grid gap-4 sm:grid-cols-2">
          {STEPS.map((step, index) => (
            <Card as="li" key={step.title} className="flex gap-4">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700 dark:bg-brand-600/20 dark:text-brand-100">
                {index + 1}
              </span>
              <div>
                <h3 className="font-medium">{step.title}</h3>
                <p className="mt-1 text-sm text-muted">{step.body}</p>
              </div>
            </Card>
          ))}
        </ol>
      </section>

      <section className="mt-10">
        <Callout tone="info" title="Why the checks">
          <p>
            The people using this site are often looking for their first job, and recruitment-fee
            fraud targets exactly them — a listing that asks for a &ldquo;registration
            charge&rdquo; before an interview. So an organisation is verified before its postings
            can go live, and each posting is read by a person first. It costs you a day. It is the
            reason a job-seeker can trust what they find here.
          </p>
        </Callout>
      </section>

      {!session ? (
        <p className="mt-8 text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login?next=/employers/register" className="underline">
            Sign in
          </Link>{" "}
          to register your organisation.
        </p>
      ) : null}
    </div>
  );
}
