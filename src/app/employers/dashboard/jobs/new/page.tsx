import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePage } from "@/modules/auth/session";
import { getPrimaryOrganisation } from "@/modules/employers/service";
import { JobPostingForm } from "@/components/employer-forms";
import { Callout } from "@/components/ui";

export const metadata: Metadata = { title: "Post a job" };

export default async function NewJobPage() {
  const session = await requirePage("/employers/dashboard/jobs/new");
  const membership = await getPrimaryOrganisation(session.sub);
  if (!membership) redirect("/employers/register");

  return (
    <div className="page page-measure-sm py-10">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
        Post a job
      </h1>
      <p className="mt-2 text-sm text-muted">
        Posting as {membership.organisation.name}.
      </p>

      <div className="mt-6">
        <Callout tone="info" title="What gets checked">
          A person reads every posting before it publishes. Adverts that ask candidates for money,
          request identity or bank details before an interview, or guarantee income are not
          published. Describing a training bond or a security deposit required by law is fine —
          just be specific about it.
        </Callout>
      </div>

      <div className="mt-8">
        <JobPostingForm organisationId={membership.organisation.id} />
      </div>
    </div>
  );
}
