import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getCourseById } from "@/modules/courses/service";
import { getSession } from "@/modules/auth/session";
import { getMessages } from "@/modules/i18n/service";
import { formatDate } from "@/modules/shared/format";
import { BatchFee, OutcomeClaims } from "@/components/course-claims";
import { CourseEnquiryForm } from "@/components/course-enquiry-form";
import { Badge, Callout, Card, SectionHeading } from "@/components/ui";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const { course, provider } = await getCourseById(id);
    return {
      title: course.title,
      description: course.summary ?? `${course.title} from ${provider?.name ?? "a provider"}.`,
    };
  } catch {
    return { title: "Course" };
  }
}

const MODE_LABELS: Record<string, string> = {
  ONLINE_LIVE: "Online (live)",
  ONLINE_SELF_PACED: "Online (self-paced)",
  CLASSROOM: "Classroom",
  HYBRID: "Hybrid",
  CORRESPONDENCE: "Correspondence",
};

export default async function CourseDetailPage({ params }: Props) {
  const { id } = await params;

  let data;
  try {
    data = await getCourseById(id);
  } catch {
    notFound();
  }

  const { course, provider, batches, activeBatches, claims, targets } = data;
  const [t, session] = await Promise.all([getMessages(), getSession()]);

  const viewer = session
    ? ((
        await db
          .select({ name: users.name, email: users.email })
          .from(users)
          .where(eq(users.id, session.sub))
          .limit(1)
      )[0] ?? null)
    : null;

  return (
    <div className="page page-measure py-10">
      <Link href="/courses" className="text-sm text-muted hover:underline">
        ← All courses
      </Link>

      <header className="mt-4">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          {course.title}
        </h1>
        {provider ? (
          <p className="mt-2 text-muted">
            <Link href={`/providers/${provider.id}`} className="underline">
              {provider.name}
            </Link>
            {provider.verificationStatus !== "verified" ? (
              <>
                {" · "}
                <Badge tone="neutral">Provider not verified</Badge>
              </>
            ) : null}
          </p>
        ) : null}
        {course.summary ? <p className="mt-3 max-w-2xl">{course.summary}</p> : null}
      </header>

      {targets.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {targets.map((entry) => (
            <Badge key={entry.target.id} tone="brand">
              {entry.examName ?? entry.careerName ?? "Related"}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-8">
          <section>
            <SectionHeading
              title={t.courses.batches}
              description="A fee belongs to a batch, not to a course. These are the runs the provider has told us about."
            />
            {batches.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-muted">
                      <th className="pb-2 pr-4 font-medium">Batch</th>
                      <th className="pb-2 pr-4 font-medium">Mode</th>
                      <th className="pb-2 pr-4 font-medium">Starts</th>
                      <th className="pb-2 pr-4 font-medium">Seats</th>
                      <th className="pb-2 font-medium">{t.courses.fee}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((batch) => (
                      <tr
                        key={batch.id}
                        className={
                          batch.isActive
                            ? "border-b border-[var(--border)]"
                            : "border-b border-[var(--border)] opacity-55"
                        }
                      >
                        <td className="py-3 pr-4">
                          {batch.label}
                          {batch.city ? (
                            <span className="block text-xs text-faint">{batch.city}</span>
                          ) : null}
                          {!batch.isActive ? (
                            <span className="block text-xs text-faint">Closed</span>
                          ) : null}
                        </td>
                        <td className="py-3 pr-4">{MODE_LABELS[batch.mode] ?? batch.mode}</td>
                        <td className="py-3 pr-4">
                          {batch.startsOn ? formatDate(batch.startsOn) : "Not announced"}
                        </td>
                        <td className="py-3 pr-4 tabular-nums">
                          {batch.seatsLeft != null && batch.seatsTotal != null
                            ? `${batch.seatsLeft} of ${batch.seatsTotal}`
                            : "—"}
                        </td>
                        <td className="py-3">
                          <BatchFee
                            feeAmount={batch.feeAmount}
                            currencyCode={batch.currencyCode}
                            feeNote={batch.feeNote}
                            isFreeCourse={course.isFree}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted">
                No batches published. Ask the provider what is running.
              </p>
            )}

            <div className="mt-4">
              <Callout tone="warn">{t.courses.feeNote}</Callout>
            </div>
          </section>

          <section>
            <SectionHeading title="What the provider claims" />
            <div className="mt-4">
              <OutcomeClaims claims={claims} />
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <Card>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              {t.courses.enquire}
            </h2>
            <div className="mt-4">
              <CourseEnquiryForm
                courseId={course.id}
                batches={activeBatches.map((batch) => ({ id: batch.id, label: batch.label }))}
                defaultName={viewer?.name}
                defaultEmail={viewer?.email}
              />
            </div>
          </Card>

          {course.url ? (
            <Card>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                Provider&rsquo;s own page
              </h2>
              <a
                href={course.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="mt-2 block break-words text-sm underline"
              >
                {course.url}
              </a>
              <p className="mt-2 text-xs text-faint">
                We don&rsquo;t control what&rsquo;s on that page and don&rsquo;t earn anything if
                you enrol.
              </p>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
