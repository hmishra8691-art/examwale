"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button, cx } from "@/components/ui";

const TYPES = [
  { value: "FULL_TIME", label: "Full time" },
  { value: "PART_TIME", label: "Part time" },
  { value: "CONTRACT", label: "Contract" },
  { value: "INTERNSHIP", label: "Internship" },
  { value: "APPRENTICESHIP", label: "Apprenticeship" },
];

const REMOTE = [
  { value: "ONSITE", label: "On-site" },
  { value: "HYBRID", label: "Hybrid" },
  { value: "REMOTE", label: "Remote" },
];

export function JobFilters({
  regions,
  current,
}: {
  regions: string[];
  current: { q: string; region: string; type: string[]; remote: string[]; sort: string; exp: string };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(current.q);

  function apply(changes: Record<string, string | string[] | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      next.delete(key);
      if (Array.isArray(value)) {
        if (value.length) next.set(key, value.join(","));
      } else if (value) {
        next.set(key, value);
      }
    }
    next.delete("page");
    router.push(`/jobs?${next.toString()}`);
  }

  function toggle(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  return (
    <div className="card space-y-4 p-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          apply({ q: query });
        }}
      >
        <div className="min-w-[220px] flex-1">
          <label htmlFor="job-search" className="mb-1 block text-xs font-medium text-muted">
            Search by title, company or skill
          </label>
          <input
            id="job-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="e.g. accountant, python, nurse"
            className="w-full rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </div>

        <div>
          <label htmlFor="job-region" className="mb-1 block text-xs font-medium text-muted">
            State
          </label>
          <select
            id="job-region"
            value={current.region}
            onChange={(event) => apply({ region: event.target.value || null })}
            className="rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand-500"
          >
            <option value="">Anywhere in India</option>
            {regions.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="job-exp" className="mb-1 block text-xs font-medium text-muted">
            Your experience
          </label>
          <select
            id="job-exp"
            value={current.exp}
            onChange={(event) => apply({ exp: event.target.value || null })}
            className="rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand-500"
          >
            <option value="">Any</option>
            <option value="0">Fresher</option>
            <option value="2">Up to 2 years</option>
            <option value="5">Up to 5 years</option>
            <option value="10">Up to 10 years</option>
          </select>
        </div>

        <div>
          <label htmlFor="job-sort" className="mb-1 block text-xs font-medium text-muted">
            Sort
          </label>
          <select
            id="job-sort"
            value={current.sort}
            onChange={(event) => apply({ sort: event.target.value })}
            className="rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand-500"
          >
            <option value="recent">Most recent</option>
            <option value="salary">Highest salary</option>
          </select>
        </div>

        <Button type="submit" size="sm">
          Search
        </Button>
      </form>

      <div className="flex flex-wrap gap-4">
        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-muted">Job type</legend>
          <div className="flex flex-wrap gap-1.5">
            {TYPES.map((type) => {
              const active = current.type.includes(type.value);
              return (
                <button
                  key={type.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => apply({ type: toggle(current.type, type.value) })}
                  className={cx(
                    "rounded-full border px-3 py-1 text-sm transition-colors",
                    active
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "hover:bg-[var(--surface-raised)]",
                  )}
                >
                  {type.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-muted">Work style</legend>
          <div className="flex flex-wrap gap-1.5">
            {REMOTE.map((option) => {
              const active = current.remote.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => apply({ remote: toggle(current.remote, option.value) })}
                  className={cx(
                    "rounded-full border px-3 py-1 text-sm transition-colors",
                    active
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "hover:bg-[var(--surface-raised)]",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>
    </div>
  );
}
