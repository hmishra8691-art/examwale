/**
 * Delivery channels.
 *
 * Same shape as the AI and payment providers: an interface with a default that
 * works offline. The default logs instead of sending, so a development machine
 * with no mail provider still exercises the whole path — record, preference
 * check, delivery row, status — and the only thing that changes in production
 * is which object is returned by `getChannel`.
 *
 * A channel never throws into the caller. A notification that failed to email
 * is still a notification the user should see in the app.
 */

export type OutboundNotification = {
  notificationId: string;
  userId: string;
  email: string | null;
  name: string | null;
  type: string;
  title: string;
  body: string;
  href: string | null;
};

export type DeliveryOutcome = {
  status: "SENT" | "FAILED" | "SUPPRESSED";
  error?: string;
};

export interface NotificationChannel {
  readonly name: "IN_APP" | "EMAIL" | "PUSH";
  readonly configured: boolean;
  send(message: OutboundNotification): Promise<DeliveryOutcome>;
}

/** The in-app bell. The row already exists by the time this runs. */
const inAppChannel: NotificationChannel = {
  name: "IN_APP",
  configured: true,
  async send() {
    return { status: "SENT" };
  },
};

const emailChannel: NotificationChannel = {
  name: "EMAIL",
  get configured() {
    return Boolean(process.env.EMAIL_PROVIDER && process.env.EMAIL_FROM);
  },
  async send(message) {
    if (!process.env.EMAIL_PROVIDER || !process.env.EMAIL_FROM) {
      // Not an error: this deployment has no mail provider. Suppressed rather
      // than failed, so retry logic doesn't chase something that cannot work.
      console.info(`[notify:email:noop] ${message.type} → ${message.email ?? "(no address)"}: ${message.title}`);
      return { status: "SUPPRESSED", error: "No email provider configured." };
    }
    if (!message.email) {
      return { status: "SUPPRESSED", error: "Account has no email address." };
    }
    // A real provider implementation goes here, selected on EMAIL_PROVIDER.
    console.info(`[notify:email] ${message.type} → ${message.email}: ${message.title}`);
    return { status: "SENT" };
  },
};

const pushChannel: NotificationChannel = {
  name: "PUSH",
  get configured() {
    return Boolean(process.env.PUSH_PROVIDER);
  },
  async send(message) {
    if (!process.env.PUSH_PROVIDER) {
      return { status: "SUPPRESSED", error: "No push provider configured." };
    }
    console.info(`[notify:push] ${message.type} → user ${message.userId}: ${message.title}`);
    return { status: "SENT" };
  },
};

const CHANNELS: Record<string, NotificationChannel> = {
  IN_APP: inAppChannel,
  EMAIL: emailChannel,
  PUSH: pushChannel,
};

export function getChannel(name: "IN_APP" | "EMAIL" | "PUSH"): NotificationChannel {
  return CHANNELS[name] ?? inAppChannel;
}

export function configuredChannels(): ("IN_APP" | "EMAIL" | "PUSH")[] {
  return (["IN_APP", "EMAIL", "PUSH"] as const).filter((name) => CHANNELS[name].configured);
}
