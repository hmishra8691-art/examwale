import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProviderById } from "@/modules/courses/service";
import { formatDate } from "@/modules/shared/format";
import { BatchFee } from "@/components/course-claims";
import { Badge, Callout, Card, EmptyState, SectionHeading } from "@/components/ui";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const { provider } = await getProviderById(id);
    return { title: provider.name, description: provider.about ?? undefined };
  } catch {
    return { title: "Provider" };
  }
}

export default async function ProviderPage({ params }: Props) {
  const { id } = await params;

  let data;
  try {
    data = await getProviderById(id);
  } catch {
    notFound();
  }

  const { provider, courses } = data;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link href="/courses" className="text-sm text-muted hover:underline">
        ← All courses
      </Link>

      <header className="mt-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
            {provider.name}
          </h1>
          <Badge tone={provider.verificationStatus === "verified" ? "good" : "neutral"}>
            {provider.verificationStatus === "verified" ? "Verified" : "Not verified"}
          </Badge>
        </div>
        <p className="mt-2 text-sm text-muted">
          {[provider.type, provider.city].filter(Boolean).join(" · ")}
        </p>
        {provider.about ? <p className="mt-3 max-w-2xl">{provider.about}</p> : null}
        {provider.website ? (
          <a
            href={provider.website}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="mt-2 inline-block text-sm underline"
          >
            {provider.website}
          </a>
        ) : null}
      </header>

      {provider.verificationStatus !== "verified" ? (
        <div className="mt-6">
          <Callout tone="warn" title="We haven't verified this provider">
            This listing exists because the provider is relevant to exams people here are
            preparing for, not because we vouch for it. Check registration and talk to a current
            student before paying anything.
          </Callout>
        </div>
      ) : null}

      <section className="mt-10">
        <SectionHeading title="Courses" />
        {courses.length ? (
          <ul className="mt-5 grid gap-4 md:grid-cols-2">
            {courses.map((row) => (
              <Card as="li" key={row.course.id} className="relative flex flex-col">
                <h3 className="font-medium">
                  <Link href={`/courses/${row.course.id}`} className="hover:text-brand-600">
                    <span className="absolute inset-0" aria-hidden />
                    {row.course.title}
                  </Link>
                </h3>
                {row.course.summary ? (
                  <p className="mt-2 line-clamp-2 text-sm text-muted">{row.course.summary}</p>
                ) : null}
                <div className="mt-3 text-sm">
                  <span className="text-muted">From: </span>
                  <BatchFee
                    feeAmount={row.cheapestFee}
                    currencyCode={row.course.currencyCode}
                    feeNote={null}
                    isFreeCourse={row.course.isFree}
                  />
                </div>
                <p className="mt-2 text-xs text-faint">
                  {row.batchCount} {row.batchCount === 1 ? "batch" : "batches"}
                  {row.nextStart ? ` · next starts ${formatDate(row.nextStart)}` : null}
                </p>
              </Card>
            ))}
          </ul>
        ) : (
          <div className="mt-5">
            <EmptyState
              title="No published courses"
              description="This provider has no courses listed here at the moment."
            />
          </div>
        )}
      </section>
    </div>
  );
}
