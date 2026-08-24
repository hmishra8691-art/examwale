import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/modules/auth/session";
import { safeRedirectPath } from "@/modules/auth/redirect";
import { env } from "@/modules/shared/env";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Sign in" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const OAUTH_ERRORS: Record<string, string> = {
  oauth_state: "That sign-in attempt expired. Please try again.",
  oauth_exchange: "Google couldn't complete the sign-in. Please try again.",
  oauth_no_email: "Google didn't share an email address, so we can't create your account.",
};

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSession();
  const params = await searchParams;
  const next = safeRedirectPath(one(params.next));

  if (session) redirect(next);

  const errorKey = one(params.error);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12 sm:px-6">
      <div className="mb-6 text-center">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Welcome back
        </h1>
        <p className="mt-2 text-muted">Sign in to pick up where you left off.</p>
      </div>

      <AuthForm
        mode="login"
        next={next}
        googleEnabled={env.googleEnabled}
        initialError={errorKey ? OAUTH_ERRORS[errorKey] : undefined}
      />

      <p className="mt-6 text-center text-sm text-muted">
        Don&rsquo;t have an account?{" "}
        <Link href={`/signup?next=${encodeURIComponent(next)}`} className="font-medium text-brand-600 hover:underline">
          Create one free
        </Link>
      </p>

      <p className="mt-4 text-center text-xs text-faint">
        You don&rsquo;t need an account to read career guides, exam details or job listings.{" "}
        <Link href="/careers" className="underline">
          Browse without signing in
        </Link>
        .
      </p>
    </div>
  );
}
