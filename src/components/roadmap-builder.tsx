"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Callout, Card } from "@/components/ui";

const LEVELS = [
  { value: "none", label: "Complete beginner" },
  { value: "beginner", label: "Some exposure" },
  { value: "intermediate", label: "Working knowledge" },
  { value: "advanced", label: "Already experienced" },
];

export function RoadmapBuilder({
  careerSlug,
  careerName,
  typicalMonthsMin,
  typicalMonthsMax,
  defaultHoursPerDay,
  defaultTargetIncome,
}: {
  careerSlug: string;
  careerName: string;
  typicalMonthsMin: number | null;
  typicalMonthsMax: number | null;
  defaultHoursPerDay: number;
  defaultTargetIncome: number | null;
}) {
  const router = useRouter();
  const [timelineMonths, setTimelineMonths] = useState(
    String(typicalMonthsMin ?? 24),
  );
  const [hoursPerDay, setHoursPerDay] = useState(String(defaultHoursPerDay));
  const [currentLevel, setCurrentLevel] = useState("none");
  const [targetIncome, setTargetIncome] = useState(defaultTargetIncome?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function build(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/roadmaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          careerSlug,
          timelineMonths: Number(timelineMonths),
          hoursPerDay: Number(hoursPerDay),
          currentLevel,
          targetIncome: targetIncome ? Number(targetIncome) : null,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? "Couldn't build that roadmap.");
        return;
      }
      router.push(`/dashboard/roadmaps/${body.data.roadmap.id}`);
    } catch {
      setError("Couldn't reach the server. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand-500";

  return (
    <Card>
      <form onSubmit={build} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="timeline" className="mb-1 block text-sm font-medium">
              How many months are you giving yourself?
            </label>
            <input
              id="timeline"
              type="number"
              min={1}
              max={240}
              value={timelineMonths}
              onChange={(event) => setTimelineMonths(event.target.value)}
              className={field}
              required
            />
            {typicalMonthsMin ? (
              <p className="mt-1 text-xs text-faint">
                This path typically takes {typicalMonthsMin}
                {typicalMonthsMax && typicalMonthsMax !== typicalMonthsMin ? `–${typicalMonthsMax}` : ""} months.
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="hours" className="mb-1 block text-sm font-medium">
              Hours a day you can commit
            </label>
            <input
              id="hours"
              type="number"
              min={0.5}
              max={16}
              step={0.5}
              value={hoursPerDay}
              onChange={(event) => setHoursPerDay(event.target.value)}
              className={field}
              required
            />
          </div>

          <div>
            <label htmlFor="level" className="mb-1 block text-sm font-medium">
              Where you&rsquo;re starting from
            </label>
            <select
              id="level"
              value={currentLevel}
              onChange={(event) => setCurrentLevel(event.target.value)}
              className={field}
            >
              {LEVELS.map((level) => (
                <option key={level.value} value={level.value}>
                  {level.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="income" className="mb-1 block text-sm font-medium">
              Income you&rsquo;re targeting (₹/year, optional)
            </label>
            <input
              id="income"
              type="number"
              min={0}
              value={targetIncome}
              onChange={(event) => setTargetIncome(event.target.value)}
              placeholder="e.g. 800000"
              className={field}
            />
          </div>
        </div>

        {error ? (
          <Callout tone="danger">
            <p>{error}</p>
          </Callout>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy} size="lg">
            {busy ? "Building…" : `Build my ${careerName} roadmap`}
          </Button>
          <p className="text-sm text-muted">
            We&rsquo;ll check the arithmetic and tell you if the timeline doesn&rsquo;t work.
          </p>
        </div>
      </form>
    </Card>
  );
}
