import { getSession } from "@/modules/auth/session";
import { getEntitlements } from "@/modules/billing/entitlements";
import { selectAds, recordAdEvent, type AdSlot as SlotName } from "@/modules/ads/service";

/**
 * The only way an advert reaches a page.
 *
 * Everything that makes advertising tolerable in a guidance product is
 * enforced in this one component:
 *
 *  - The disclosure label is printed above the creative, in the same visual
 *    treatment every time, and is not passed in by the caller.
 *  - The advertiser is named. "Paid promotion" without saying who paid is
 *    barely a disclosure.
 *  - The whole block is wrapped in an <aside> with an accessible label, so a
 *    screen-reader user gets the same signal a sighted one does — which is
 *    where most "clearly labelled" advertising quietly fails.
 *  - Links are `rel="sponsored nofollow noopener"`, which is the same claim
 *    made to search engines that we make to the reader.
 *  - Paid subscribers get nothing rendered at all.
 *
 * It is a server component, so a page cannot accidentally ship targeting logic
 * or advertiser data to the browser.
 */
export async function AdSlot({
  slot,
  countryId,
  occupationGroupId,
  examId,
  className,
}: {
  slot: SlotName;
  countryId: string;
  occupationGroupId?: string | null;
  examId?: string | null;
  className?: string;
}) {
  const session = await getSession();

  // adFree is an entitlement, so this is one query and no plan-name branching.
  const { entitlements } = await getEntitlements(session?.sub ?? null);
  if (entitlements.adFree) return null;

  const creatives = await selectAds({
    slot,
    countryId,
    occupationGroupId,
    examId,
    limit: 1,
  });

  if (!creatives.length) return null;

  // Counted server-side at render. Aggregate only — see modules/ads/service.
  await Promise.all(creatives.map((creative) => recordAdEvent({ creativeId: creative.id, type: "IMPRESSION" })));

  return (
    <aside aria-label="Paid promotion" className={className}>
      {creatives.map((creative) => (
        <div
          key={creative.id}
          className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-raised)] p-4"
        >
          <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
            <span className="rounded bg-ink-200 px-1.5 py-0.5 text-ink-800 dark:bg-ink-700 dark:text-ink-100">
              {creative.disclosureLabel}
            </span>
            <span className="normal-case tracking-normal text-faint">
              from {creative.advertiserName}
            </span>
          </p>

          <h3 className="mt-2.5 text-sm font-medium">{creative.headline}</h3>
          <p className="mt-1 text-sm text-muted">{creative.body}</p>

          <a
            href={`/api/v1/ads/${creative.id}/click`}
            target="_blank"
            rel="sponsored nofollow noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
          >
            {creative.ctaLabel} <span aria-hidden>→</span>
          </a>

          <p className="mt-2.5 border-t border-[var(--border)] pt-2 text-[11px] leading-relaxed text-faint">
            Paying for this space does not affect anything ExamWale says about this advertiser, or
            where they appear in any search or ranking.
          </p>
        </div>
      ))}
    </aside>
  );
}
