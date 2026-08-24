"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Callout, Card } from "@/components/ui";

export function ApplyPanel({
  jobId,
  jobSlug,
  signedIn,
  applyUrl,
}: {
  jobId: string;
  jobSlug: string;
  signedIn: boolean;
  applyUrl?: string | null;
}) {
  const [coverLetter, setCoverLetter] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  if (!signedIn) {
    return (
      <Callout tone="info">
        <p>
          <Link href={`/login?next=/jobs/${jobSlug}`} className="font-medium underline">
            Sign in
          </Link>{" "}
          to apply through ExamWale and keep track of your applications in one place.
        </p>
      </Callout>
    );
  }

  if (status === "sent") {
    return (
      <Callout tone="good" title="Application recorded">
        <p>
          It&rsquo;s saved to{" "}
          <Link href="/dashboard/applications" className="font-medium underline">
            your applications
          </Link>
          . We&rsquo;ll keep the status here as it moves.
        </p>
      </Callout>
    );
  }

  async function apply(event: React.FormEvent) {
    event.preventDefault();
    setStatus("sending");
    try {
      const response = await fetch(`/api/v1/jobs/${jobId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverLetter: coverLetter.trim() || undefined }),
      });
      const body = await response.json();
      if (!response.ok) {
        setStatus("error");
        setMessage(body?.error?.message ?? "Couldn't record that application.");
        return;
      }
      setStatus("sent");
    } catch {
      setStatus("error");
      setMessage("Couldn't reach the server. Try again in a moment.");
    }
  }

  return (
    <Card>
      <form onSubmit={apply} className="space-y-3">
        <div>
          <label htmlFor="cover" className="mb-1 block text-sm font-medium">
            A short note to the employer <span className="font-normal text-muted">(optional)</span>
          </label>
          <textarea
            id="cover"
            rows={4}
            value={coverLetter}
            onChange={(event) => setCoverLetter(event.target.value)}
            placeholder="Two or three sentences on why this role, and what you'd bring to it. Specific beats enthusiastic."
            className="w-full rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand-500"
            maxLength={2000}
          />
          <p className="mt-1 text-xs text-faint">{coverLetter.length}/2000</p>
        </div>

        {status === "error" ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {message}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={status === "sending"}>
            {status === "sending" ? "Recording…" : "Apply"}
          </Button>
          {applyUrl ? (
            <a
              href={applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-brand-600 underline"
            >
              Or apply on the employer&rsquo;s site ↗
            </a>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
