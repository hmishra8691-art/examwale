"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Callout } from "@/components/ui";
import { formatDate } from "@/modules/shared/format";

type Row = {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  sourceName: string | null;
  lastVerifiedAt: string | null;
  href: string;
};

const STATUS_TONE: Record<string, "good" | "warn" | "neutral" | "bad"> = {
  PUBLISHED: "good",
  NEEDS_REVIEW: "warn",
  DRAFT: "neutral",
  ARCHIVED: "bad",
};

export function PublishTable({
  entityType,
  rows: initialRows,
  sources,
}: {
  entityType: "career" | "exam" | "exam_edition" | "scholarship";
  rows: Row[];
  sources: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "good" | "danger"; text: string } | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
  const [filter, setFilter] = useState("");

  async function toggle(row: Row) {
    const action = row.status === "PUBLISHED" ? "unpublish" : "publish";
    setBusyId(row.id);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/admin/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId: row.id, action }),
      });
      const body = await response.json();
      if (!response.ok) {
        setMessage({ tone: "danger", text: body?.error?.message ?? "That didn't work." });
        return;
      }
      setRows((current) =>
        current.map((item) => (item.id === row.id ? { ...item, status: body.data.status } : item)),
      );
      setMessage({
        tone: "good",
        text: `${row.title} is now ${body.data.status.toLowerCase().replace(/_/g, " ")}.`,
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function verify(row: Row) {
    if (!sourceId) return;
    setBusyId(row.id);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/admin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType,
          entityId: row.id,
          sourceId,
          validForDays: 180,
          note: "Verified from the admin console.",
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setMessage({ tone: "danger", text: body?.error?.message ?? "Couldn't record that." });
        return;
      }
      setRows((current) =>
        current.map((item) =>
          item.id === row.id
            ? {
                ...item,
                lastVerifiedAt: new Date().toISOString(),
                sourceName: sources.find((source) => source.id === sourceId)?.name ?? item.sourceName,
              }
            : item,
        ),
      );
      setVerifyingId(null);
      setMessage({ tone: "good", text: `Verification recorded for ${row.title}.` });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  const visible = filter
    ? rows.filter((row) =>
        `${row.title} ${row.subtitle} ${row.status}`.toLowerCase().includes(filter.toLowerCase()),
      )
    : rows;

  return (
    <div className="space-y-3">
      {message ? (
        <Callout tone={message.tone === "good" ? "good" : "danger"}>
          <p>{message.text}</p>
        </Callout>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <label htmlFor="admin-filter" className="mb-1 block text-xs font-medium text-muted">
            Filter
          </label>
          <input
            id="admin-filter"
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search by name, slug or status"
            className="w-full rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </div>
        <div>
          <label htmlFor="verify-source" className="mb-1 block text-xs font-medium text-muted">
            Source to verify against
          </label>
          <select
            id="verify-source"
            value={sourceId}
            onChange={(event) => setSourceId(event.target.value)}
            className="rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand-500"
          >
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted">
              <th className="p-3 font-medium">Record</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium">Source</th>
              <th className="p-3 font-medium">Last verified</th>
              <th className="p-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id} className="border-b last:border-0">
                <td className="p-3">
                  <Link href={row.href} className="font-medium hover:text-brand-600">
                    {row.title}
                  </Link>
                  <span className="block text-xs text-faint">{row.subtitle}</span>
                </td>
                <td className="p-3">
                  <Badge tone={STATUS_TONE[row.status] ?? "neutral"}>
                    {row.status.toLowerCase().replace(/_/g, " ")}
                  </Badge>
                </td>
                <td className="p-3">
                  {row.sourceName ?? <span className="text-red-600 dark:text-red-400">None</span>}
                </td>
                <td className="p-3 tabular-nums">
                  {row.lastVerifiedAt ? formatDate(row.lastVerifiedAt) : "—"}
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={row.status === "PUBLISHED" ? "secondary" : "primary"}
                      onClick={() => toggle(row)}
                      disabled={busyId === row.id}
                    >
                      {row.status === "PUBLISHED" ? "Unpublish" : "Publish"}
                    </Button>
                    {verifyingId === row.id ? (
                      <Button size="sm" variant="primary" onClick={() => verify(row)} disabled={busyId === row.id}>
                        Confirm
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setVerifyingId(row.id)}>
                        Re-verify
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted">Nothing matched that filter.</p>
      ) : null}
    </div>
  );
}
