"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Callout, Card, cx, EmptyState, SectionHeading } from "@/components/ui";
import type { ExtractedResume } from "@/db/schema";

type DocumentRow = {
  id: string;
  type: string;
  originalName: string;
  sizeBytes: number;
  status: string;
  failureReason: string | null;
  uploadedAt: string;
};

const TYPE_LABEL: Record<string, string> = {
  RESUME: "Résumé",
  MARKSHEET: "Marksheet",
  CERTIFICATE: "Certificate",
  JOB_DESCRIPTION: "Job description",
  EXAM_NOTIFICATION: "Exam notification",
  BUSINESS_PLAN: "Business plan",
  OTHER: "Document",
};

const STATUS_TONE: Record<string, "good" | "warn" | "bad" | "neutral"> = {
  CONFIRMED: "good",
  EXTRACTED: "warn",
  PROCESSING: "neutral",
  PENDING: "neutral",
  FAILED: "bad",
};

export function DocumentsWorkspace({
  initialDocuments,
  modelBacked,
}: {
  initialDocuments: DocumentRow[];
  modelBacked: boolean;
}) {
  const router = useRouter();
  const [documents, setDocuments] = useState(initialDocuments);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<{
    documentId: string;
    extracted: ExtractedResume | Record<string, unknown>;
    confidence: Record<string, number>;
    reviewed: boolean;
  } | null>(null);
  const [acceptedSkills, setAcceptedSkills] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);

      const response = await fetch("/api/v1/documents", { method: "POST", body: form });
      const body = await response.json();

      if (!response.ok) {
        setError(body?.error?.message ?? "Couldn't process that file.");
        return;
      }

      const document = body.data.document;
      setDocuments((current) => [
        {
          id: document.id,
          type: document.type,
          originalName: document.originalName,
          sizeBytes: document.sizeBytes,
          status: document.status,
          failureReason: document.failureReason ?? null,
          uploadedAt: new Date().toISOString(),
        },
        ...current,
      ]);

      if (document.status === "EXTRACTED") await open(document.id);
      router.refresh();
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  async function open(documentId: string) {
    setOpenId(documentId);
    setExtraction(null);
    const response = await fetch(`/api/v1/documents/${documentId}`);
    if (!response.ok) return;
    const body = await response.json();
    if (!body.data.extraction) return;

    const extracted = body.data.extraction.extracted;
    setExtraction({
      documentId,
      extracted,
      confidence: body.data.extraction.confidence,
      reviewed: body.data.extraction.reviewedByUser,
    });
    setAcceptedSkills(Array.isArray(extracted?.skills) ? (extracted.skills as string[]) : []);
  }

  async function confirm() {
    if (!extraction) return;
    setConfirming(true);
    try {
      const response = await fetch(`/api/v1/documents/${extraction.documentId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acceptedSkills }),
      });
      if (response.ok) {
        setDocuments((current) =>
          current.map((document) =>
            document.id === extraction.documentId ? { ...document, status: "CONFIRMED" } : document,
          ),
        );
        setExtraction({ ...extraction, reviewed: true });
        router.refresh();
      }
    } finally {
      setConfirming(false);
    }
  }

  async function remove(documentId: string) {
    await fetch(`/api/v1/documents/${documentId}`, { method: "DELETE" });
    setDocuments((current) => current.filter((document) => document.id !== documentId));
    if (openId === documentId) {
      setOpenId(null);
      setExtraction(null);
    }
    router.refresh();
  }

  const resume = extraction?.extracted as ExtractedResume | undefined;
  const isResume = Boolean(resume && Array.isArray(resume.skills));

  return (
    <div className="space-y-6">
      <label
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file) void upload(file);
        }}
        className={cx(
          "flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragging ? "border-brand-500 bg-brand-50 dark:bg-brand-900/20" : "hover:bg-[var(--surface-raised)]",
        )}
      >
        <input
          type="file"
          accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
          className="sr-only"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = "";
          }}
        />
        <svg viewBox="0 0 24 24" className="mb-3 size-8 text-ink-400" fill="none" aria-hidden>
          <path d="M12 16V4m0 0L8 8m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="font-medium">{uploading ? "Reading your document…" : "Drop a file here, or click to choose"}</p>
        <p className="mt-1 text-sm text-muted">PDF, Word (.docx), plain text, PNG or JPEG · up to 10 MB</p>
      </label>

      {!modelBacked ? (
        <Callout tone="warn" title="Extraction is running on rules, not a model">
          <p>
            Without <code>ANTHROPIC_API_KEY</code> configured, we use the built-in pattern-based
            parser. It handles well-structured résumés reasonably and unusual layouts poorly. Check
            the extracted fields carefully before confirming.
          </p>
        </Callout>
      ) : null}

      {error ? (
        <Callout tone="danger">
          <p>{error}</p>
        </Callout>
      ) : null}

      <section aria-labelledby="your-documents">
        <SectionHeading title="Your documents" id="your-documents" />
        {documents.length === 0 ? (
          <EmptyState
            title="Nothing uploaded yet"
            description="A résumé is the most useful thing to start with — it fills in your skills and unlocks job matching."
          />
        ) : (
          <ul className="space-y-2">
            {documents.map((document) => (
              <Card as="li" key={document.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-sm font-medium">{document.originalName}</h3>
                      <Badge tone="neutral">{TYPE_LABEL[document.type] ?? document.type}</Badge>
                      <Badge tone={STATUS_TONE[document.status] ?? "neutral"}>
                        {document.status.toLowerCase().replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-faint">
                      {(document.sizeBytes / 1024).toFixed(0)} KB
                    </p>
                    {document.failureReason ? (
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">{document.failureReason}</p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    {document.status === "EXTRACTED" || document.status === "CONFIRMED" ? (
                      <Button variant="secondary" size="sm" onClick={() => open(document.id)}>
                        {openId === document.id ? "Viewing" : "View analysis"}
                      </Button>
                    ) : null}
                    <Button variant="ghost" size="sm" onClick={() => remove(document.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </ul>
        )}
      </section>

      {extraction && isResume && resume ? (
        <section aria-labelledby="analysis">
          <SectionHeading
            title="What we found"
            id="analysis"
            description="Tick the skills you want added to your profile. Nothing else is written."
          />

          <div className="space-y-4">
            <Card>
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { label: "Name", value: resume.fullName, key: "fullName" },
                  { label: "Email", value: resume.email, key: "email" },
                  { label: "Phone", value: resume.phone, key: "phone" },
                ].map((item) => (
                  <div key={item.label}>
                    <dt className="text-xs uppercase tracking-wide text-muted">{item.label}</dt>
                    <dd className="mt-0.5 text-sm">
                      {item.value ?? <span className="text-faint">Not found</span>}
                      {extraction.confidence[item.key] ? (
                        <span className="ml-2 text-xs text-faint">
                          {Math.round(extraction.confidence[item.key] * 100)}% confidence
                        </span>
                      ) : null}
                    </dd>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold">Skills found</h3>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setAcceptedSkills(resume.skills ?? [])}>
                    Select all
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setAcceptedSkills([])}>
                    Clear
                  </Button>
                </div>
              </div>
              {resume.skills?.length ? (
                <ul className="flex flex-wrap gap-1.5">
                  {resume.skills.map((skill) => {
                    const active = acceptedSkills.includes(skill);
                    return (
                      <li key={skill}>
                        <button
                          type="button"
                          aria-pressed={active}
                          onClick={() =>
                            setAcceptedSkills((current) =>
                              active ? current.filter((item) => item !== skill) : [...current, skill],
                            )
                          }
                          className={cx(
                            "rounded-full border px-3 py-1 text-sm transition-colors",
                            active
                              ? "border-brand-500 bg-brand-500 text-white"
                              : "hover:border-brand-400",
                          )}
                        >
                          {skill}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted">
                  No recognisable skills found. Add them manually on your profile instead.
                </p>
              )}
            </Card>

            {resume.education?.length ? (
              <Card>
                <h3 className="mb-2 font-semibold">Education</h3>
                <ul className="space-y-1.5 text-sm">
                  {resume.education.map((entry, index) => (
                    <li key={`${entry.qualification}-${index}`}>
                      <span className="font-medium">{entry.qualification}</span>
                      {entry.institution ? <span className="text-muted"> · {entry.institution}</span> : null}
                      {entry.year ? <span className="text-faint"> · {entry.year}</span> : null}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {resume.experience?.length ? (
              <Card>
                <h3 className="mb-2 font-semibold">Experience</h3>
                <ul className="space-y-2 text-sm">
                  {resume.experience.map((entry, index) => (
                    <li key={`${entry.title}-${index}`}>
                      <p className="font-medium">{entry.title}</p>
                      <p className="text-muted">
                        {[entry.organisation, entry.duration].filter(Boolean).join(" · ")}
                      </p>
                    </li>
                  ))}
                </ul>
                {resume.totalYearsExperience != null ? (
                  <p className="mt-2 text-sm text-muted">
                    Estimated total experience:{" "}
                    <strong className="text-[var(--text)]">{resume.totalYearsExperience} years</strong>
                  </p>
                ) : null}
              </Card>
            ) : null}

            {resume.issues?.length ? (
              <Card>
                <h3 className="mb-2 font-semibold">What to fix in this résumé</h3>
                <ul className="space-y-1.5 text-sm">
                  {resume.issues.map((issue) => (
                    <li key={issue} className="flex gap-2">
                      <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-estimate-600" />
                      {issue}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {extraction.reviewed ? (
              <Callout tone="good">
                <p>Confirmed. These skills are on your profile and job matching is using them.</p>
              </Callout>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={confirm} disabled={confirming} size="lg">
                  {confirming ? "Adding…" : `Add ${acceptedSkills.length} skill${acceptedSkills.length === 1 ? "" : "s"} to my profile`}
                </Button>
                <p className="text-sm text-muted">Only what you&rsquo;ve ticked gets added.</p>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {extraction && !isResume ? (
        <section aria-labelledby="analysis-other">
          <SectionHeading title="What we found" id="analysis-other" />
          <Card>
            <pre className="overflow-x-auto whitespace-pre-wrap text-sm text-muted">
              {JSON.stringify(extraction.extracted, null, 2)}
            </pre>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
