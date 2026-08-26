import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/modules/auth/session";
import { getPreferences, listNotifications } from "@/modules/notifications/service";
import { configuredChannels } from "@/modules/notifications/channels";
import { getMessages } from "@/modules/i18n/service";
import { relativeDays } from "@/modules/shared/format";
import { MarkAllRead, PreferenceToggles } from "@/components/notification-controls";
import { Badge, Callout, Card, EmptyState, SectionHeading } from "@/components/ui";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const session = await requirePage("/dashboard/notifications");
  const [t, notifications, preferences] = await Promise.all([
    getMessages(),
    listNotifications(session.sub, { limit: 50 }),
    getPreferences(session.sub),
  ]);

  const available = configuredChannels();
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="measure-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeading title={t.notifications.title} />
        {unread ? <MarkAllRead label={t.notifications.markAllRead} /> : null}
      </div>

      {notifications.length ? (
        <ul className="mt-6 grid gap-3">
          {notifications.map((notification) => (
            <Card
              as="li"
              key={notification.id}
              className={notification.readAt ? "relative opacity-70" : "relative"}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-medium">
                    {notification.href ? (
                      <Link href={notification.href} className="hover:text-brand-600">
                        <span className="absolute inset-0" aria-hidden />
                        {notification.title}
                      </Link>
                    ) : (
                      notification.title
                    )}
                  </h3>
                  <p className="mt-1 text-sm text-muted">{notification.body}</p>
                </div>
                {!notification.readAt ? <Badge tone="brand">New</Badge> : null}
              </div>
              <p className="mt-2 text-xs text-faint">{relativeDays(notification.createdAt)}</p>
            </Card>
          ))}
        </ul>
      ) : (
        <div className="mt-6">
          <EmptyState title={t.notifications.empty} description="Things that happen will show up here." />
        </div>
      )}

      <section className="mt-12">
        <SectionHeading
          title={t.notifications.preferences}
          description="What reaches you, and how."
        />

        {available.length === 1 ? (
          <div className="mt-4">
            <Callout tone="info">
              Only in-app notifications are switched on for this deployment. Email and push are
              shown below but can&rsquo;t be enabled until a provider is configured.
            </Callout>
          </div>
        ) : null}

        <div className="mt-5">
          <PreferenceToggles
            preferences={preferences}
            unavailableLabel={t.notifications.channelUnavailable}
          />
        </div>
      </section>
    </div>
  );
}
