import type { Metadata } from "next";
import { requireAdminPage } from "@/modules/auth/session";
import { AD_SLOTS, listCampaignsForReview, listCreatives } from "@/modules/ads/service";
import { AdCampaignDecision } from "@/components/admin-ad-review";
import { Badge, Callout, Card, EmptyState, SectionHeading } from "@/components/ui";
import { formatDate } from "@/modules/shared/format";

export const metadata: Metadata = { title: "Advertising review" };

export default async function AdvertisingReviewPage() {
  await requireAdminPage("/admin/advertising");
  const queue = await listCampaignsForReview();

  const withCreatives = await Promise.all(
    queue.map(async (entry) => ({ ...entry, creatives: await listCreatives(entry.campaign.id) })),
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <SectionHeading
        title="Advertising review"
        description="Campaigns waiting for approval. Nothing runs until it is approved and the advertiser's organisation is verified."
      />

      <div className="mt-6">
        <Callout tone="info" title="What you're checking">
          <p>
            That the advertiser is a real, verified organisation, and that the creative does not
            make a claim about outcomes, guarantee a job or a selection, imply endorsement by
            ExamWale, or target something it should not.
          </p>
          <p className="mt-2">
            Adverts never enter rankings or search results — they only occupy the fixed slots
            below, all of which sit outside result sets. You are not deciding placement, only
            whether this advertiser and this copy may appear at all.
          </p>
        </Callout>
      </div>

      {withCreatives.length ? (
        <ul className="mt-6 grid gap-5">
          {withCreatives.map((entry) => (
            <Card as="li" key={entry.campaign.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-medium">{entry.campaign.name}</h3>
                  <p className="mt-1 text-sm text-muted">{entry.organisation.name}</p>
                  <p className="mt-1 text-xs text-faint">
                    {entry.campaign.startsOn ? formatDate(entry.campaign.startsOn) : "No start date"}
                    {" – "}
                    {entry.campaign.endsOn ? formatDate(entry.campaign.endsOn) : "open ended"}
                    {entry.campaign.dailyImpressionCap
                      ? ` · cap ${entry.campaign.dailyImpressionCap}/day`
                      : null}
                  </p>
                </div>
                <Badge tone={entry.organisation.verificationStatus === "VERIFIED" ? "good" : "bad"}>
                  {entry.organisation.verificationStatus === "VERIFIED"
                    ? "Advertiser verified"
                    : "Advertiser not verified"}
                </Badge>
              </div>

              <ul className="mt-4 space-y-3">
                {entry.creatives.map((creative) => (
                  <li
                    key={creative.id}
                    className="rounded-md border border-dashed border-[var(--border)] p-4"
                  >
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                      {creative.disclosureLabel} · {AD_SLOTS[creative.slot as keyof typeof AD_SLOTS] ?? creative.slot}
                    </p>
                    <h4 className="mt-2 text-sm font-medium">{creative.headline}</h4>
                    <p className="mt-1 text-sm text-muted">{creative.body}</p>
                    <p className="mt-2 break-words text-xs text-faint">
                      → {creative.targetUrl} · &ldquo;{creative.ctaLabel}&rdquo; · as{" "}
                      {creative.advertiserName}
                    </p>
                  </li>
                ))}
              </ul>

              {entry.organisation.verificationStatus !== "VERIFIED" ? (
                <p className="mt-4 text-sm text-estimate-700 dark:text-estimate-100">
                  Approving will be refused until this organisation is verified.
                </p>
              ) : null}

              <div className="mt-4 border-t border-[var(--border)] pt-4">
                <AdCampaignDecision campaignId={entry.campaign.id} />
              </div>
            </Card>
          ))}
        </ul>
      ) : (
        <div className="mt-6">
          <EmptyState title="Nothing waiting" description="No campaigns are pending review." />
        </div>
      )}

      <section className="mt-12">
        <SectionHeading
          title="Where adverts can appear"
          description="A closed list. Adding a slot is a code change, not a configuration one."
        />
        <ul className="mt-4 space-y-2 text-sm">
          {Object.entries(AD_SLOTS).map(([slot, description]) => (
            <li key={slot} className="flex flex-wrap gap-2 rounded-lg border border-[var(--border)] p-3">
              <code className="font-mono text-xs text-muted">{slot}</code>
              <span>{description}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
