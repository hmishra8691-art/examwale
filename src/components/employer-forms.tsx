"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Callout } from "@/components/ui";

type FieldErrors = Record<string, string>;

/** Shared submit plumbing: one place that knows the API's error envelope. */
async function post(url: string, body: unknown, method: "POST" | "PATCH" = "POST") {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const fields: FieldErrors = {};
    for (const issue of payload?.error?.fields ?? []) {
      fields[issue.path] = issue.message;
    }
    throw Object.assign(new Error(payload?.error?.message ?? "Something went wrong."), { fields });
  }
  return payload?.data;
}

function Field({
  label,
  name,
  error,
  hint,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={name} className="block">
      <span className="text-sm font-medium">{label}</span>
      {hint ? <span className="mt-0.5 block text-xs text-faint">{hint}</span> : null}
      <div className="mt-1.5">{children}</div>
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

export function OrganisationRegisterForm({ countryId }: { countryId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldErrors>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});

    const form = new FormData(event.currentTarget);
    try {
      await post("/api/v1/employers/organisations", {
        name: String(form.get("name") ?? "").trim(),
        type: String(form.get("type") ?? "company"),
        countryId,
        contactEmail: String(form.get("contactEmail") ?? "").trim(),
        website: String(form.get("website") ?? "").trim() || null,
        about: String(form.get("about") ?? "").trim() || null,
      });
      router.push("/employers/dashboard");
      router.refresh();
    } catch (caught) {
      const err = caught as Error & { fields?: FieldErrors };
      setError(err.message);
      setFields(err.fields ?? {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error ? <Callout tone="danger">{error}</Callout> : null}

      <Field label="Organisation name" name="name" error={fields.name}>
        <input id="name" name="name" required maxLength={160} className={inputClass} />
      </Field>

      <Field label="Type" name="type" error={fields.type}>
        <select id="type" name="type" className={inputClass} defaultValue="company">
          <option value="company">Company</option>
          <option value="institution">College or university</option>
          <option value="coaching">Coaching centre</option>
          <option value="government">Government body</option>
          <option value="ngo">NGO</option>
        </select>
      </Field>

      <Field
        label="Contact email"
        name="contactEmail"
        error={fields.contactEmail}
        hint="Used for verification. Not shown on your postings."
      >
        <input
          id="contactEmail"
          name="contactEmail"
          type="email"
          required
          className={inputClass}
        />
      </Field>

      <Field
        label="Website"
        name="website"
        error={fields.website}
        hint="Optional, but it makes verification much faster."
      >
        <input id="website" name="website" type="url" placeholder="https://" className={inputClass} />
      </Field>

      <Field label="About" name="about" error={fields.about} hint="Optional. A couple of sentences.">
        <textarea id="about" name="about" rows={4} maxLength={2000} className={inputClass} />
      </Field>

      <Button type="submit" disabled={busy}>
        {busy ? "Registering…" : "Register organisation"}
      </Button>
    </form>
  );
}

const EMPLOYMENT_TYPES = [
  ["FULL_TIME", "Full time"],
  ["PART_TIME", "Part time"],
  ["CONTRACT", "Contract"],
  ["INTERNSHIP", "Internship"],
  ["APPRENTICESHIP", "Apprenticeship"],
  ["FREELANCE", "Freelance"],
] as const;

export function JobPostingForm({
  organisationId,
  posting,
}: {
  organisationId: string;
  posting?: {
    id: string;
    title: string;
    description: string;
    employmentType: string;
    remoteType: string;
    city: string | null;
    experienceMinYears: number;
    experienceMaxYears: number | null;
    educationRequired: string | null;
    skillsRequired: string[];
    salaryMin: number | null;
    salaryMax: number | null;
    isSalaryDisclosed: boolean;
  };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldErrors>({});
  const [disclose, setDisclose] = useState(posting?.isSalaryDisclosed ?? true);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});

    const form = new FormData(event.currentTarget);
    const salaryMin = Number(form.get("salaryMin"));
    const salaryMax = Number(form.get("salaryMax"));

    const body = {
      title: String(form.get("title") ?? "").trim(),
      description: String(form.get("description") ?? "").trim(),
      employmentType: String(form.get("employmentType") ?? "FULL_TIME"),
      remoteType: String(form.get("remoteType") ?? "ONSITE"),
      city: String(form.get("city") ?? "").trim() || null,
      experienceMinYears: Number(form.get("experienceMinYears") ?? 0) || 0,
      experienceMaxYears: Number(form.get("experienceMaxYears")) || null,
      educationRequired: String(form.get("educationRequired") ?? "").trim() || null,
      skillsRequired: String(form.get("skillsRequired") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      salaryMin: disclose && Number.isFinite(salaryMin) && salaryMin > 0 ? salaryMin : null,
      salaryMax: disclose && Number.isFinite(salaryMax) && salaryMax > 0 ? salaryMax : null,
      isSalaryDisclosed: disclose,
    };

    try {
      if (posting) {
        await post(`/api/v1/employers/jobs/${posting.id}`, body, "PATCH");
        router.push(`/employers/dashboard/jobs/${posting.id}`);
      } else {
        const data = await post(`/api/v1/employers/organisations/${organisationId}/jobs`, body);
        router.push(`/employers/dashboard/jobs/${data.posting.id}`);
      }
      router.refresh();
    } catch (caught) {
      const err = caught as Error & { fields?: FieldErrors };
      setError(err.message);
      setFields(err.fields ?? {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error ? <Callout tone="danger">{error}</Callout> : null}

      <Field label="Job title" name="title" error={fields.title}>
        <input
          id="title"
          name="title"
          required
          defaultValue={posting?.title}
          maxLength={160}
          className={inputClass}
        />
      </Field>

      <Field
        label="Description"
        name="description"
        error={fields.description}
        hint="What the person will actually do. At least a couple of paragraphs."
      >
        <textarea
          id="description"
          name="description"
          required
          rows={10}
          defaultValue={posting?.description}
          className={inputClass}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Employment type" name="employmentType">
          <select
            id="employmentType"
            name="employmentType"
            defaultValue={posting?.employmentType ?? "FULL_TIME"}
            className={inputClass}
          >
            {EMPLOYMENT_TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Location type" name="remoteType">
          <select
            id="remoteType"
            name="remoteType"
            defaultValue={posting?.remoteType ?? "ONSITE"}
            className={inputClass}
          >
            <option value="ONSITE">On site</option>
            <option value="HYBRID">Hybrid</option>
            <option value="REMOTE">Remote</option>
          </select>
        </Field>

        <Field label="City" name="city" error={fields.city}>
          <input id="city" name="city" defaultValue={posting?.city ?? ""} className={inputClass} />
        </Field>

        <Field
          label="Education required"
          name="educationRequired"
          hint="Leave blank if you don't require a specific qualification."
        >
          <input
            id="educationRequired"
            name="educationRequired"
            defaultValue={posting?.educationRequired ?? ""}
            className={inputClass}
          />
        </Field>

        <Field label="Minimum experience (years)" name="experienceMinYears">
          <input
            id="experienceMinYears"
            name="experienceMinYears"
            type="number"
            min={0}
            max={50}
            defaultValue={posting?.experienceMinYears ?? 0}
            className={inputClass}
          />
        </Field>

        <Field label="Maximum experience (years)" name="experienceMaxYears" hint="Optional.">
          <input
            id="experienceMaxYears"
            name="experienceMaxYears"
            type="number"
            min={0}
            max={60}
            defaultValue={posting?.experienceMaxYears ?? ""}
            className={inputClass}
          />
        </Field>
      </div>

      <Field
        label="Required skills"
        name="skillsRequired"
        error={fields.skillsRequired}
        hint="Comma separated."
      >
        <input
          id="skillsRequired"
          name="skillsRequired"
          required
          defaultValue={posting?.skillsRequired?.join(", ")}
          className={inputClass}
        />
      </Field>

      <div className="rounded-md border border-[var(--border)] p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={disclose}
            onChange={(event) => setDisclose(event.target.checked)}
            className="mt-1"
          />
          <span className="text-sm">
            <span className="font-medium">Show the pay range</span>
            <span className="mt-0.5 block text-xs text-muted">
              Postings with a disclosed range get substantially more applications, and undisclosed
              pay is one of the signals our moderation flags for a closer look.
            </span>
          </span>
        </label>

        {disclose ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Minimum (₹ per year)" name="salaryMin">
              <input
                id="salaryMin"
                name="salaryMin"
                type="number"
                min={0}
                defaultValue={posting?.salaryMin ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Maximum (₹ per year)" name="salaryMax">
              <input
                id="salaryMax"
                name="salaryMax"
                type="number"
                min={0}
                defaultValue={posting?.salaryMax ?? ""}
                className={inputClass}
              />
            </Field>
          </div>
        ) : null}
      </div>

      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : posting ? "Save changes" : "Create draft"}
      </Button>
      <p className="text-xs text-faint">
        Saving creates a draft. Nothing is public until you submit it and a reviewer approves it.
      </p>
    </form>
  );
}

/** Submit-for-review and close controls on the posting detail page. */
export function PostingActions({ jobId, status }: { jobId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [flags, setFlags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const data = await post(`/api/v1/employers/jobs/${jobId}/submit`, {});
      setMessage(data.message);
      setFlags(data.flags ?? []);
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /**
   * One handler for every lifecycle action.
   *
   * The server decides what is legal from the current state, so this does not
   * duplicate the rules — a button that should not be offered is hidden below,
   * and one that slips through gets a specific refusal rather than a shrug.
   */
  async function act(action: "close" | "revive" | "archive" | "restore") {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/v1/employers/jobs/${jobId}/lifecycle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? "That didn't work.");
      if (action === "revive") {
        setMessage(
          "Live again, with a fresh 30-day run. Everything applicants sent last time is still here.",
        );
      }
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error ? <Callout tone="danger">{error}</Callout> : null}
      {message ? (
        <Callout tone="good" title="Submitted">
          <p>{message}</p>
          {flags.length ? (
            <>
              <p className="mt-2 font-medium">Our automated screen flagged this for a reviewer:</p>
              <ul className="mt-1 list-inside list-disc">
                {flags.map((flag) => (
                  <li key={flag}>{FLAG_LABELS[flag] ?? flag}</li>
                ))}
              </ul>
              <p className="mt-2">
                A flag is not a rejection — a person decides. If any of these were unintentional,
                editing the posting now will save a round trip.
              </p>
            </>
          ) : null}
        </Callout>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {status === "DRAFT" || status === "REJECTED" ? (
          <Button onClick={submit} disabled={busy} size="sm">
            {busy ? "Submitting…" : "Submit for review"}
          </Button>
        ) : null}
        {status === "EXPIRED" || status === "CLOSED" ? (
          <Button onClick={() => act("revive")} disabled={busy} size="sm">
            {busy ? "Reviving…" : "Run this posting again"}
          </Button>
        ) : null}
        {status === "ACTIVE" ? (
          <Button onClick={() => act("close")} disabled={busy} size="sm" variant="secondary">
            Close posting
          </Button>
        ) : null}
        {status === "ARCHIVED" ? (
          <Button onClick={() => act("restore")} disabled={busy} size="sm">
            Restore to draft
          </Button>
        ) : null}
        {status !== "ARCHIVED" && status !== "SUSPENDED" ? (
          <Button onClick={() => act("archive")} disabled={busy} size="sm" variant="secondary">
            Archive
          </Button>
        ) : null}
      </div>
      {status === "EXPIRED" || status === "CLOSED" ? (
        <p className="text-xs leading-relaxed text-faint">
          Running it again does not go back through review — the posting already passed. Editing it
          does, because a changed role is a different role.
        </p>
      ) : null}
      {status === "SUSPENDED" ? (
        <p className="text-xs leading-relaxed text-faint">
          A moderator took this down. Reply to the note above to have it looked at again — it cannot
          be relisted from here.
        </p>
      ) : null}
    </div>
  );
}

export const FLAG_LABELS: Record<string, string> = {
  mentions_candidate_payment: "Mentions a fee, deposit or charge paid by the candidate",
  requests_sensitive_documents_upfront: "Asks for identity or bank details up front",
  directs_applicants_off_platform: "Sends applicants to a personal messaging number",
  guarantee_language: "Guarantees income or placement",
  undisclosed_pay_and_no_website: "No pay range and no organisation website",
};

/** Applicant status control used on the posting detail page. */
export function ApplicantStatusControl({
  applicationId,
  status,
}: {
  applicationId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(status);

  async function change(next: string) {
    setBusy(true);
    try {
      await post(`/api/v1/employers/applications/${applicationId}`, { status: next }, "PATCH");
      setCurrent(next);
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
      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs"
      aria-label="Application status"
    >
      <option value="APPLIED">Applied</option>
      <option value="IN_REVIEW">In review</option>
      <option value="OFFER">Offer</option>
      <option value="REJECTED">Not proceeding</option>
    </select>
  );
}
