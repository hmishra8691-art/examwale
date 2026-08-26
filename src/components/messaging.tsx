"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Avatar } from "@/components/avatar";
import { Button, Callout } from "@/components/ui";

const inputClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

export type ThreadMessage = {
  id: string;
  senderId: string;
  body: string | null;
  createdAt: string;
  deletedAt: string | null;
};

const REPORT_REASONS: [string, string][] = [
  ["harassment", "Harassment or abuse"],
  ["spam", "Spam or advertising"],
  ["scam", "Asking for money, or a scam"],
  ["contact_off_platform", "Pushing to move off the platform"],
  ["inappropriate", "Sexual or otherwise inappropriate content"],
  ["impersonation", "Pretending to be someone else"],
  ["other", "Something else"],
];

function timeLabel(iso: string): string {
  const when = new Date(iso);
  const today = new Date();
  const sameDay = when.toDateString() === today.toDateString();
  return sameDay
    ? when.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : `${when.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${when.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * One conversation.
 *
 * Polls rather than holding a socket. A websocket for a message every few
 * minutes is infrastructure for a problem this product does not have yet, and on
 * a serverless host it is infrastructure it cannot cheaply have at all. Twelve
 * seconds is quick enough to feel live in a thread somebody is actually reading,
 * and the poll stops entirely when the tab is hidden.
 */
export function Thread({
  conversationId,
  viewerId,
  other,
  initialMessages,
  blocked,
  locked,
}: {
  conversationId: string;
  viewerId: string;
  other: { id: string; name: string | null; avatarHash: string | null } | null;
  initialMessages: ThreadMessage[];
  blocked: boolean;
  locked: string | null;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialMessages);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [reporting, setReporting] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [items.length]);

  // Mark read on open, and again whenever new messages arrive while looking.
  useEffect(() => {
    void fetch(`/api/v1/messages/${conversationId}/read`, { method: "POST" });
  }, [conversationId, items.length]);

  useEffect(() => {
    if (blocked || locked) return;
    let stopped = false;

    async function poll() {
      if (document.hidden) return;
      try {
        const response = await fetch(`/api/v1/messages/${conversationId}`);
        if (!response.ok) return;
        const payload = await response.json();
        if (!stopped) setItems(payload.data.messages);
      } catch {
        // A failed poll is not worth telling anybody about; the next one may work.
      }
    }

    const timer = setInterval(poll, 12_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [conversationId, blocked, locked]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/messages/${conversationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? "That didn't send.");
      setItems([...items, payload.data.message]);
      setDraft("");
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(messageId: string) {
    const response = await fetch(`/api/v1/messages/items/${messageId}`, { method: "DELETE" });
    if (response.ok) {
      setItems(items.map((m) => (m.id === messageId ? { ...m, body: null, deletedAt: "now" } : m)));
    } else {
      const payload = await response.json().catch(() => null);
      setError(payload?.error?.message ?? "Couldn't remove that.");
    }
  }

  return (
    <div className="flex min-h-[24rem] flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto scroll-slim pb-4">
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            No messages yet. Say what you need — the other person can see what this is about.
          </p>
        ) : null}

        {items.map((message) => {
          const mine = message.senderId === viewerId;
          return (
            <div key={message.id} className={`flex gap-2.5 ${mine ? "flex-row-reverse" : ""}`}>
              {!mine && other ? (
                <Avatar userId={other.id} name={other.name} hash={other.avatarHash} size="xs" />
              ) : null}
              <div className={`min-w-0 max-w-[75%] ${mine ? "text-right" : ""}`}>
                <div
                  className={`inline-block rounded-lg px-3.5 py-2 text-left text-[14.5px] leading-relaxed ${
                    message.deletedAt
                      ? "border border-dashed text-faint"
                      : mine
                        ? "bg-brand-600 text-white"
                        : "bg-[var(--surface-raised)]"
                  }`}
                >
                  {message.deletedAt ? (
                    // A gap that says a message was here, rather than a silent
                    // rewrite of the conversation.
                    <span className="italic">Message removed</span>
                  ) : (
                    <span className="whitespace-pre-wrap break-words">{message.body}</span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-faint">
                  <span className="tabular-nums">{timeLabel(message.createdAt)}</span>
                  {mine && !message.deletedAt ? (
                    <button
                      type="button"
                      onClick={() => remove(message.id)}
                      className="hover:underline"
                    >
                      Remove
                    </button>
                  ) : null}
                  {!mine && !message.deletedAt ? (
                    <button
                      type="button"
                      onClick={() => setReporting(message.id)}
                      className="hover:underline"
                    >
                      Report
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      {reporting ? (
        <ReportDialog
          subjectType="MESSAGE"
          subjectId={reporting}
          onClose={() => setReporting(null)}
          onDone={() => {
            setReporting(null);
            router.refresh();
          }}
        />
      ) : null}

      {error ? (
        <div className="mb-2">
          <Callout tone="danger">{error}</Callout>
        </div>
      ) : null}

      {locked ? (
        <Callout tone="warn" title="This conversation is closed">
          <p>{locked}</p>
        </Callout>
      ) : blocked ? (
        <Callout tone="warn" title="Contact is blocked">
          <p>
            Neither of you can send messages here. Unblock from your message settings if you want to
            continue — the history stays either way.
          </p>
        </Callout>
      ) : (
        <form onSubmit={send} className="flex items-end gap-2 border-t pt-3">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends; Shift+Enter is a new line. The reverse surprises
              // people who have used any other messaging app.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={2}
            maxLength={4000}
            placeholder="Write a message…"
            className={`${inputClass} resize-none`}
          />
          <Button type="submit" disabled={busy || !draft.trim()}>
            {busy ? "Sending…" : "Send"}
          </Button>
        </form>
      )}
    </div>
  );
}

/**
 * Report something, and stop it at the same time.
 *
 * Blocking is checked by default: somebody reporting harassment wants it to stop
 * now, not after a review. They can uncheck it — an employer reporting spam may
 * still need the channel — but the safe option is the one already chosen.
 */
export function ReportDialog({
  subjectType,
  subjectId,
  onClose,
  onDone,
}: {
  subjectType: "MESSAGE" | "USER";
  subjectId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("harassment");
  const [detail, setDetail] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectType, subjectId, reason, detail: detail.trim() || null, alsoBlock }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? "That didn't send.");
      onDone();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-3">
      <form onSubmit={submit} className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold">Report this {subjectType === "MESSAGE" ? "message" : "person"}</h3>
          <button type="button" onClick={onClose} className="text-xs text-muted hover:underline">
            Cancel
          </button>
        </div>

        {error ? <Callout tone="danger">{error}</Callout> : null}

        <label className="block">
          <span className="text-xs font-medium">What is wrong?</span>
          <select
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className={`mt-1 ${inputClass}`}
          >
            {REPORT_REASONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium">Anything else we should know? (optional)</span>
          <textarea
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
            rows={3}
            maxLength={2000}
            className={`mt-1 ${inputClass}`}
          />
        </label>

        <label className="flex items-start gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={alsoBlock}
            onChange={(event) => setAlsoBlock(event.target.checked)}
            className="mt-0.5"
          />
          <span>
            Block them as well, so neither of you can send anything while this is looked at.
          </span>
        </label>

        <p className="text-xs leading-relaxed text-faint">
          A person reads this — nothing is decided automatically. They can see the messages in this
          conversation, including any that were removed. You will hear the outcome either way.
        </p>

        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Sending…" : "Send report"}
        </Button>
      </form>
    </div>
  );
}

/** Unblock somebody from the message settings. */
export function BlockedList({
  initial,
}: {
  initial: { user: { id: string; name: string | null }; since: string }[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function unblock(userId: string) {
    setBusy(true);
    try {
      await fetch("/api/v1/messages/blocks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      setRows(rows.filter((row) => row.user.id !== userId));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted">You have not blocked anybody.</p>;
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.user.id} className="flex items-center justify-between gap-3 border-b pb-2">
          <span className="text-sm">{row.user.name ?? "Someone"}</span>
          <button
            type="button"
            onClick={() => unblock(row.user.id)}
            disabled={busy}
            className="text-sm text-brand-600 hover:underline dark:text-brand-300"
          >
            Unblock
          </button>
        </li>
      ))}
    </ul>
  );
}
