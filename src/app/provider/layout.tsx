import { redirect } from "next/navigation";
import { requirePage } from "@/modules/auth/session";
import { CAPABILITIES, getProviderContext } from "@/modules/providers/service";
import { providerWorkload } from "@/modules/providers/workload";
import { ProviderNav, type ProviderNavItem } from "@/components/provider-nav";

/**
 * The provider shell.
 *
 * Navigation is built from what this person has actually been approved for, so
 * nobody is offered a link to something they cannot use. Several links leave
 * `/provider` for screens that already exist and work — reimplementing those
 * inside this shell to make the URLs tidy would be a rewrite whose only visible
 * result is a nav bar.
 *
 * The profile and apply pages sit outside the shell: they are what somebody
 * reaches *before* being a provider, and wrapping them in a dashboard for
 * capabilities they do not yet hold would be an odd first impression.
 */
export default async function ProviderLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePage("/provider");
  const { profile, active } = await getProviderContext(session.sub);

  // No profile yet — the hub explains what this is and starts one. Wrapping that
  // in a dashboard shell would frame a first visit as an empty product.
  if (!profile) return <>{children}</>;

  const workload = await providerWorkload(session.sub, active);

  const items: ProviderNavItem[] = [
    { href: "/provider", label: "Overview" },
    { href: "/provider/requests", label: "Requests", badge: workload.waiting },
    { href: "/provider/calendar", label: "Calendar" },
    { href: "/messages", label: "Messages", badge: workload.unreadMessages, external: true },
  ];

  if (active.includes("MENTOR")) {
    items.push({ href: "/dashboard/mentor", label: "Mentoring", external: true });
  }
  if (active.includes("EMPLOYER")) {
    items.push({ href: "/employers/dashboard", label: "Hiring", external: true });
  }
  if (active.includes("SERVICE_PROVIDER")) {
    items.push({ href: "/provider/services", label: "Services" });
  }
  if (active.includes("COURSE_PROVIDER") && CAPABILITIES.COURSE_PROVIDER.href) {
    items.push({ href: CAPABILITIES.COURSE_PROVIDER.href, label: "Courses", external: true });
  }

  items.push({ href: "/provider/profile", label: "Profile" });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="grid gap-6 lg:grid-cols-[190px_1fr]">
        <ProviderNav items={items} />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
