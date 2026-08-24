import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/modules/auth/session";
import { safeRedirectPath } from "@/modules/auth/redirect";
import { env } from "@/modules/shared/env";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Create an account" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function SignupPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSession();
  const params = await searchParams;
  const next = safeRedirectPath(one(params.next), "/dashboard/profile?welcome=1");

  if (session) redirect(next);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12 sm:px-6">
      <div className="mb-6 text-center">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Create your account
        </h1>
        <p className="mt-2 text-muted">
          Free. Ten minutes of profile now makes everything after it specific to you.
        </p>
      </div>

      <AuthForm mode="signup" next={next} googleEnabled={env.googleEnabled} />

      <ul className="mt-6 space-y-1.5 text-sm text-muted">
        {[
          "Career recommendations scored against your budget, location and hours",
          "Roadmaps with real dates and a reality check on the timeline",
          "Résumé analysis and job match estimates",
          "Study plans built from the actual syllabus",
        ].map((item) => (
          <li key={item} className="flex gap-2">
            <svg viewBox="0 0 16 16" className="mt-1 size-3.5 shrink-0 text-verified-600" aria-hidden>
              <path d="M3 8.5l3.5 3.5L13 4.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {item}
          </li>
        ))}
      </ul>

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-medium text-brand-600 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
