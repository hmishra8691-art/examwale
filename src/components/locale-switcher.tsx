"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/modules/i18n/config";

/**
 * Language switcher.
 *
 * Labels are written in their own script — a Hindi reader looking for their
 * language should find "हिन्दी", not the word "Hindi" in English, which is
 * precisely the sort of detail that decides whether a switcher gets used.
 */
export function LocaleSwitcher({ current }: { current: Locale }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function change(locale: string) {
    if (locale === current) return;
    setBusy(true);
    try {
      await fetch("/api/v1/i18n/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
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
      aria-label="Language"
      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm"
    >
      {LOCALES.map((locale) => (
        <option key={locale} value={locale}>
          {LOCALE_LABELS[locale].native}
        </option>
      ))}
    </select>
  );
}
