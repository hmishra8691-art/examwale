import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePage } from "@/modules/auth/session";
import { getPrimaryOrganisation } from "@/modules/employers/service";
import { OrganisationRegisterForm } from "@/components/employer-forms";
import { Callout } from "@/components/ui";
import { getCountry } from "@/modules/geo/service";

export const metadata: Metadata = { title: "Register your organisation" };

export default async function RegisterOrganisationPage() {
  const session = await requirePage("/employers/register");

  const existing = await getPrimaryOrganisation(session.sub);
  if (existing) redirect("/employers/dashboard");

  // The country the visitor is actually browsing, not the deployment default —
  // an organisation or mentor registers in the market they are looking at.
  const country = await getCountry();

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
        Register your organisation
      </h1>
      <p className="mt-2 text-muted">
        This creates your hiring account. You can write postings straight away; they go live once
        the organisation is verified and the posting has been read.
      </p>

      <div className="mt-6">
        <Callout tone="info">
          Verification is a person confirming the organisation exists and that you&rsquo;re
          connected to it. A working website or a company email domain makes it quick.
        </Callout>
      </div>

      <div className="mt-8">
        <OrganisationRegisterForm countryId={country?.id ?? ""} />
      </div>
    </div>
  );
}
