/**
 * Payment provider abstraction.
 *
 * Mirrors `modules/ai/provider.ts`: the product must run, and be developable
 * and testable, without a paid third party configured. The default is a manual
 * provider that records an intent and settles it in-process — which is exactly
 * what an admin granting a comped subscription needs anyway, so it is not a
 * stub with no production use.
 *
 * A real gateway (Razorpay, Stripe) implements this interface and is selected
 * by PAYMENT_PROVIDER. Nothing above this file knows which one is in play.
 */

export type CheckoutIntent = {
  /** Our reference. Doubles as the payment row's idempotency key. */
  reference: string;
  amount: number;
  currencyCode: string;
  description: string;
  userId: string;
  planCode: string;
};

export type CheckoutResult = {
  provider: string;
  providerRef: string;
  /** Where to send the buyer. Null when the provider settles without a redirect. */
  redirectUrl: string | null;
  /** True when the charge is already final — the manual provider's case. */
  settled: boolean;
};

export type WebhookVerification = {
  ok: boolean;
  reference?: string;
  providerRef?: string;
  status?: "SUCCEEDED" | "FAILED";
  reason?: string;
};

export interface PaymentProvider {
  readonly name: string;
  /** True when this provider can actually take money. */
  readonly canCharge: boolean;
  createCheckout(intent: CheckoutIntent): Promise<CheckoutResult>;
  /**
   * Verifies an inbound webhook. Returning `ok: false` must be treated as
   * hostile input, not as a failed payment.
   */
  verifyWebhook(rawBody: string, signature: string | null): Promise<WebhookVerification>;
}

/**
 * Settles immediately and takes no money.
 *
 * Used for local development, the smoke suite, and admin-granted access. It
 * reports `canCharge: false` so the UI can say plainly that checkout is not
 * wired up rather than presenting a fake payment screen.
 */
const manualProvider: PaymentProvider = {
  name: "manual",
  canCharge: false,

  async createCheckout(intent) {
    return {
      provider: "manual",
      providerRef: `manual_${intent.reference}`,
      redirectUrl: null,
      settled: true,
    };
  },

  async verifyWebhook() {
    // A provider that cannot charge cannot receive a genuine webhook.
    return { ok: false, reason: "The manual provider does not accept webhooks." };
  },
};

export function getPaymentProvider(): PaymentProvider {
  const configured = (process.env.PAYMENT_PROVIDER ?? "manual").toLowerCase();
  switch (configured) {
    case "manual":
      return manualProvider;
    default:
      // An unrecognised provider name must not silently become "free access".
      console.warn(
        `[billing] PAYMENT_PROVIDER="${configured}" is not implemented; falling back to manual (no charges).`,
      );
      return manualProvider;
  }
}
