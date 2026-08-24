"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";

export function SaveButton({
  itemType,
  itemId,
  label,
  signedIn,
}: {
  itemType: string;
  itemId: string;
  label: string;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    fetch(`/api/v1/users/me/saved?itemType=${itemType}&itemId=${itemId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!cancelled && body?.data) setSaved(Boolean(body.data.saved));
      })
      .finally(() => !cancelled && setChecked(true));
    return () => {
      cancelled = true;
    };
  }, [itemType, itemId, signedIn]);

  async function toggle() {
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/v1/users/me/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemType, itemId, label }),
      });
      const body = await response.json();
      if (body?.data) setSaved(Boolean(body.data.saved));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant={saved ? "primary" : "secondary"}
      size="sm"
      onClick={toggle}
      disabled={busy || (signedIn && !checked)}
      aria-pressed={saved}
    >
      <svg viewBox="0 0 20 20" className="size-4" fill={saved ? "currentColor" : "none"} aria-hidden>
        <path
          d="M5 3.5h10a1 1 0 011 1v12l-6-3.5-6 3.5v-12a1 1 0 011-1z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      {saved ? "Saved" : "Save"}
    </Button>
  );
}
