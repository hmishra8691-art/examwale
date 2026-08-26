import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/modules/auth/session";
import { getProviderProfile } from "@/modules/providers/service";
import { COUNTRY_DEFAULT_ZONE } from "@/modules/shared/timezone";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { AvatarUpload } from "@/components/avatar-upload";
import { ProviderProfileForm } from "@/components/provider-profile-form";
import { Callout } from "@/components/ui";

export const metadata: Metadata = { title: "Your provider profile" };

export default async function ProviderProfilePage() {
  const session = await requirePage("/provider/profile");
  const [profile, [account]] = await Promise.all([
    getProviderProfile(session.sub),
    db.select({ avatarHash: users.avatarHash }).from(users).where(eq(users.id, session.sub)).limit(1),
  ]);

  return (
    <div className="max-w-3xl">
      <Link href="/provider" className="text-sm text-muted hover:underline">
        ← Provider dashboard
      </Link>
      <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
        {profile ? "Your provider profile" : "Set up your provider profile"}
      </h1>
      <p className="mt-3 max-w-prose text-muted">
        One profile for everything you offer. Change it once and it changes everywhere — your mentor
        listing, your job postings, your course pages.
      </p>

      {!profile ? (
        <div className="mt-6">
          <Callout tone="info" title="Nothing is published yet">
            <p>
              Saving this creates the profile. It becomes visible only once you apply for something
              and that application is approved.
            </p>
          </Callout>
        </div>
      ) : null}

      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Profile picture</h2>
        <div className="mt-3">
          <AvatarUpload
            userId={session.sub}
            name={profile?.displayName ?? session.name}
            hash={account?.avatarHash ?? null}
          />
        </div>
      </div>

      <div className="mt-8 border-t pt-8">
        <ProviderProfileForm
          timezoneOptions={[...new Set(Object.values(COUNTRY_DEFAULT_ZONE)), "UTC"]}
          initial={{
            displayName: profile?.displayName ?? session.name ?? "",
            headline: profile?.headline ?? "",
            bio: profile?.bio ?? "",
            professionalTitle: profile?.professionalTitle ?? "",
            currentRole: profile?.currentRole ?? "",
            currentOrganisation: profile?.currentOrganisation ?? "",
            yearsExperience: profile?.yearsExperience ?? 0,
            languages: (profile?.languages as string[] | null) ?? ["English"],
            city: profile?.city ?? "",
            timezone: profile?.timezone ?? "Asia/Kolkata",
            links: (profile?.links as { label: string; url: string }[] | null) ?? [],
            certifications:
              (profile?.certifications as { title: string; issuer?: string; year?: number }[] | null) ??
              [],
            visibility: profile?.visibility ?? "PUBLIC",
          }}
        />
      </div>
    </div>
  );
}
