"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type SwitchableCountry = { isoCode: string; name: string };

/**
 * Country selector.
 *
 * Only rendered when more than one country is active — a single-country
 * deployment should not carry a control that does nothing. The options come
 * from `listActiveCountries`, so an inactive country can never be selected
 * here even if someone knows its code; the API re-checks anyway.
 */
export function CountrySwitcher({
  current,
  countries,
}: {
  current: string;
  countries: SwitchableCountry[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (countries.length < 2) return null;

  async function change(isoCode: string) {
    if (isoCode === current) return;
    setBusy(true);
    try {
      await fetch("/api/v1/geo/country", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isoCode }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <select
      value={current}
      disabled={busy}
      onChange={(event) => change(event.target.value)}
      aria-label="Country"
      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm"
    >
      {countries.map((country) => (
        <option key={country.isoCode} value={country.isoCode}>
          {country.name}
        </option>
      ))}
    </select>
  );
}
