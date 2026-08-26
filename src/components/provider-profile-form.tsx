"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Callout } from "@/components/ui";

const inputClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

type Link = { label: string; url: string };
type Certification = { title: string; issuer?: string; year?: number };

export type ProfileFormValues = {
  displayName: string;
  headline: string;
  bio: string;
  professionalTitle: string;
  currentRole: string;
  currentOrganisation: string;
  yearsExperience: number;
  languages: string[];
  city: string;
  timezone: string;
  links: Link[];
  certifications: Certification[];
  visibility: "PUBLIC" | "LIMITED" | "HIDDEN";
};

const VISIBILITY = [
  {
    value: "PUBLIC" as const,
    label: "Publicly listed",
    blurb: "Appears in directories and search. What most providers want.",
  },
  {
    value: "LIMITED" as const,
    label: "Link only",
    blurb: "Works if someone has the link, but not listed anywhere. For when you are full.",
  },
  {
    value: "HIDDEN" as const,
    label: "Hidden",
    blurb: "Nobody can reach it. Existing bookings are unaffected.",
  },
];

/**
 * Provider profile editor.
 *
 * The three visibility options are spelled out rather than left as a dropdown
 * with one-word labels, because the middle one is the whole reason the setting
 * exists and nobody guesses what "limited" means. A mentor who is temporarily
 * full wants to stop appearing in the directory without breaking the link they
 * have already sent to six people.
 */
export function ProviderProfileForm({
  initial,
  timezoneOptions,
}: {
  initial: ProfileFormValues;
  timezoneOptions: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [languages, setLanguages] = useState(initial.languages.join(", "));
  const [links, setLinks] = useState<Link[]>(initial.links);
  const [certifications, setCertifications] = useState<Certification[]>(initial.certifications);
  const [visibility, setVisibility] = useState(initial.visibility);
  const [bio, setBio] = useState(initial.bio);

  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zones = Array.from(new Set([initial.timezone, browserZone, ...timezoneOptions].filter(Boolean)));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);

    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "").trim();

    try {
      const response = await fetch("/api/v1/providers/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: value("displayName"),
          headline: value("headline"),
          bio,
          professionalTitle: value("professionalTitle") || null,
          currentRole: value("currentRole") || null,
          currentOrganisation: value("currentOrganisation") || null,
          yearsExperience: Number(value("yearsExperience") || 0),
          languages: languages
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean),
          city: value("city") || null,
          timezone: value("timezone") || null,
          // Empty rows are dropped rather than rejected — a half-filled row the
          // person forgot about should not block the whole save.
          links: links.filter((link) => link.label.trim() && link.url.trim()),
          certifications: certifications.filter((entry) => entry.title.trim()),
          visibility,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? "That didn't save.");
      setSaved(true);
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {error ? <Callout tone="danger">{error}</Callout> : null}
      {saved ? <Callout tone="good">Profile saved.</Callout> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">Your name, professionally</span>
          <input
            name="displayName"
            defaultValue={initial.displayName}
            required
            maxLength={120}
            className={`mt-1.5 ${inputClass}`}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Title (optional)</span>
          <input
            name="professionalTitle"
            defaultValue={initial.professionalTitle}
            maxLength={160}
            placeholder="Career coach · IAS officer · Consultant"
            className={`mt-1.5 ${inputClass}`}
          />
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium">Headline</span>
        <input
          name="headline"
          defaultValue={initial.headline}
          required
          minLength={10}
          maxLength={200}
          className={`mt-1.5 ${inputClass}`}
        />
        <span className="mt-1 block text-xs text-faint">
          One line, and the only thing many people will read. What you help with beats what you are.
        </span>
      </label>

      <label className="block">
        <span className="text-sm font-medium">About you</span>
        <textarea
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          required
          rows={6}
          maxLength={4000}
          className={`mt-1.5 ${inputClass}`}
        />
        <span className="mt-1 block text-xs text-faint tabular-nums">
          {bio.trim().length} characters
          {bio.trim().length < 40 ? " — at least 40 needed" : ""}
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="text-sm font-medium">Current role</span>
          <input
            name="currentRole"
            defaultValue={initial.currentRole}
            maxLength={160}
            className={`mt-1.5 ${inputClass}`}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Organisation</span>
          <input
            name="currentOrganisation"
            defaultValue={initial.currentOrganisation}
            maxLength={160}
            className={`mt-1.5 ${inputClass}`}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Years of experience</span>
          <input
            name="yearsExperience"
            type="number"
            min={0}
            max={70}
            defaultValue={initial.yearsExperience}
            className={`mt-1.5 ${inputClass}`}
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="text-sm font-medium">City</span>
          <input
            name="city"
            defaultValue={initial.city}
            maxLength={120}
            className={`mt-1.5 ${inputClass}`}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium">Timezone</span>
          <select name="timezone" defaultValue={initial.timezone} className={`mt-1.5 ${inputClass}`}>
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-faint">
            Every session time you publish is read in this zone, and shown to others converted to
            theirs.
            {browserZone && browserZone !== initial.timezone ? (
              <> Your device says {browserZone.replace(/_/g, " ")}.</>
            ) : null}
          </span>
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium">Languages you can work in</span>
        <input
          value={languages}
          onChange={(event) => setLanguages(event.target.value)}
          required
          className={`mt-1.5 ${inputClass}`}
          placeholder="English, Hindi, Marathi"
        />
        <span className="mt-1 block text-xs text-faint">Comma separated.</span>
      </label>

      <fieldset>
        <legend className="text-sm font-medium">Who can see this profile</legend>
        <div className="mt-2 space-y-2">
          {VISIBILITY.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${
                visibility === option.value
                  ? "border-brand-500 bg-brand-50 dark:bg-brand-900/20"
                  : "hover:bg-[var(--surface-raised)]"
              }`}
            >
              <input
                type="radio"
                name="visibility"
                checked={visibility === option.value}
                onChange={() => setVisibility(option.value)}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="block text-xs leading-relaxed text-muted">{option.blurb}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium">Links</legend>
        <div className="mt-2 space-y-2">
          {links.map((link, index) => (
            <div key={index} className="flex flex-wrap gap-2">
              <input
                value={link.label}
                onChange={(event) =>
                  setLinks(links.map((l, i) => (i === index ? { ...l, label: event.target.value } : l)))
                }
                placeholder="LinkedIn"
                className={`${inputClass} sm:w-40`}
                aria-label="Link label"
              />
              <input
                value={link.url}
                onChange={(event) =>
                  setLinks(links.map((l, i) => (i === index ? { ...l, url: event.target.value } : l)))
                }
                placeholder="https://…"
                className={`${inputClass} sm:flex-1`}
                aria-label="Link URL"
              />
              <button
                type="button"
                onClick={() => setLinks(links.filter((_, i) => i !== index))}
                className="text-sm text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        {links.length < 8 ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setLinks([...links, { label: "", url: "" }])}
            className="mt-2"
          >
            Add a link
          </Button>
        ) : null}
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium">Certifications</legend>
        <p className="mt-1 text-xs leading-relaxed text-faint">
          Shown as self-declared, because that is what they are. Verified credentials are separate
          and are checked by a person before they appear as verified.
        </p>
        <div className="mt-2 space-y-2">
          {certifications.map((entry, index) => (
            <div key={index} className="flex flex-wrap gap-2">
              <input
                value={entry.title}
                onChange={(event) =>
                  setCertifications(
                    certifications.map((c, i) =>
                      i === index ? { ...c, title: event.target.value } : c,
                    ),
                  )
                }
                placeholder="Certification"
                className={`${inputClass} sm:flex-1`}
                aria-label="Certification title"
              />
              <input
                value={entry.issuer ?? ""}
                onChange={(event) =>
                  setCertifications(
                    certifications.map((c, i) =>
                      i === index ? { ...c, issuer: event.target.value } : c,
                    ),
                  )
                }
                placeholder="Issuer"
                className={`${inputClass} sm:w-48`}
                aria-label="Issuer"
              />
              <input
                type="number"
                value={entry.year ?? ""}
                onChange={(event) =>
                  setCertifications(
                    certifications.map((c, i) =>
                      i === index
                        ? { ...c, year: event.target.value ? Number(event.target.value) : undefined }
                        : c,
                    ),
                  )
                }
                placeholder="Year"
                min={1950}
                max={2100}
                className={`${inputClass} sm:w-24`}
                aria-label="Year"
              />
              <button
                type="button"
                onClick={() => setCertifications(certifications.filter((_, i) => i !== index))}
                className="text-sm text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        {certifications.length < 20 ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setCertifications([...certifications, { title: "" }])}
            className="mt-2"
          >
            Add a certification
          </Button>
        ) : null}
      </fieldset>

      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
