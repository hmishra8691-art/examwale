"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Callout } from "@/components/ui";

/**
 * Credential verification and application decision.
 *
 * "Approve" is disabled until a credential has actually been verified, and the
 * server refuses it too. The disabled button is a courtesy; the server check is
 * the rule — a reviewer with a stale page must not be able to list an unchecked
 * mentor by clicking through.
 */
export function MentorReviewControls({
  mentorId,
  credentials,
  canApprove: initialCanApprove,
}: {
  mentorId: string;
  credentials: {
    id: string;
    title: string;
    kind: string;
    issuer: string | null;
    evidenceUrl: string | null;
    status: string;
  }[];
  canApprove: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState<Set<string>>(
    new Set(credentials.filter((c) => c.status === "VERIFIED").map((c) => c.id)),
  );
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");

  const canApprove = initialCanApprove || verified.size > 0;

  async function call(url: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message ?? "That didn't work.");
      }
      router.refresh();
      return true;
    } catch (caught) {
      setError((caught as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function verifyCredential(id: string) {
    const ok = await call(`/api/v1/admin/mentor-credentials/${id}`, {});
    if (ok) setVerified(new Set([...verified, id]));
  }

  return (
    <div className="space-y-4">
      {error ? <Callout tone="danger">{error}</Callout> : null}

      <div>
        <p className="text-sm font-medium">Credentials</p>
        <ul className="mt-2 space-y-2">
          {credentials.map((credential) => {
            const isVerified = verified.has(credential.id);
            return (
              <li
                key={credential.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm">{credential.title}</p>
                  <p className="text-xs text-faint">
                    {credential.kind.replace("_", " ")}
                    {credential.issuer ? ` · ${credential.issuer}` : null}
                    {credential.evidenceUrl ? (
                      <>
                        {" · "}
                        <a
                          href={credential.evidenceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                        >
                          evidence
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>
                {isVerified ? (
                  <Badge tone="good">Verified</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => verifyCredential(credential.id)}
                  >
                    Mark verified
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        {!credentials.length ? (
          <p className="mt-2 text-sm text-muted">
            No credentials submitted. Nothing to verify — this application cannot be approved.
          </p>
        ) : null}
      </div>

      {rejecting ? (
        <div className="space-y-2">
          <label htmlFor={`note-${mentorId}`} className="text-sm font-medium">
            Why? The applicant sees this.
          </label>
          <textarea
            id={`note-${mentorId}`}
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={() =>
                call(`/api/v1/admin/mentors/${mentorId}`, {
                  decision: "REJECTED",
                  note: note.trim() || undefined,
                })
              }
            >
              Confirm rejection
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy || !canApprove}
            onClick={() => call(`/api/v1/admin/mentors/${mentorId}`, { decision: "ACTIVE" })}
          >
            Approve and list
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setRejecting(true)}>
            Reject
          </Button>
          {!canApprove ? (
            <span className="self-center text-xs text-faint">
              Verify a credential first.
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
