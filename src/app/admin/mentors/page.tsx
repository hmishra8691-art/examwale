import type { Metadata } from "next";
import { requireAdminPage } from "@/modules/auth/session";
import { listCredentials, listPendingMentors } from "@/modules/mentors/service";
import { MentorReviewControls } from "@/components/admin-mentor-review";
import { Badge, Callout, Card, EmptyState, SectionHeading } from "@/components/ui";

export const metadata: Metadata = { title: "Mentor applications" };

export default async function AdminMentorsPage() {
  await requireAdminPage("/admin/mentors");
  const queue = await listPendingMentors();

  const withCredentials = await Promise.all(
    queue.map(async (entry) => ({
      ...entry,
      credentials: await listCredentials(entry.mentor.id),
    })),
  );

  return (
    <div className="measure">
      <SectionHeading
        title="Mentor applications"
        description="Nobody here is publicly listed. Verify a credential before approving."
      />

      <div className="mt-6">
        <Callout tone="info" title="What you're checking">
          That the person is who they say they are — an exam result, an employment letter, a
          professional registration. You are not assessing whether they will give good advice. You
          are confirming the claim their profile is built on is true, because a seeker cannot
          check it themselves.
        </Callout>
      </div>

      {withCredentials.length ? (
        <ul className="mt-6 grid gap-5">
          {withCredentials.map((entry) => (
            <Card as="li" key={entry.mentor.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-medium">{entry.name ?? "Applicant"}</h3>
                  <p className="text-xs text-faint">{entry.email}</p>
                  <p className="mt-1 text-sm text-muted">{entry.mentor.headline}</p>
                  <p className="mt-1 text-xs text-faint">
                    {[
                      entry.mentor.currentRole,
                      entry.mentor.currentOrganisation,
                      entry.mentor.city,
                      `${entry.mentor.yearsExperience} yrs`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <Badge tone={entry.verifiedCredentials > 0 ? "good" : "warn"}>
                  {entry.verifiedCredentials} of {entry.credentialCount} verified
                </Badge>
              </div>

              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium">Read their bio</summary>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">
                  {entry.mentor.bio}
                </p>
              </details>

              <div className="mt-4 border-t border-[var(--border)] pt-4">
                <MentorReviewControls
                  mentorId={entry.mentor.id}
                  credentials={entry.credentials.map((credential) => ({
                    id: credential.id,
                    title: credential.title,
                    kind: credential.kind,
                    issuer: credential.issuer,
                    evidenceUrl: credential.evidenceUrl,
                    status: credential.status,
                  }))}
                  canApprove={entry.verifiedCredentials > 0}
                />
              </div>
            </Card>
          ))}
        </ul>
      ) : (
        <div className="mt-6">
          <EmptyState title="Nothing waiting" description="No mentor applications to review." />
        </div>
      )}
    </div>
  );
}
