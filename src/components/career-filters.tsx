"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";

export function CareerFilters({
  current,
  budgets,
}: {
  /** Currency-appropriate bands — see `budgetBands` in modules/shared/format. */
  budgets: { label: string; value: number }[];
  current: {
    q: string;
    sort: string;
    remote: boolean;
    self: boolean;
    maxCost?: number;
    group?: string;
  };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(current.q);

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    next.delete("page");
    router.push(`/careers?${next.toString()}`);
  }

  const hasFilters = current.q || current.remote || current.self || current.maxCost;

  return (
    <div className="card mb-2 flex flex-wrap items-end gap-3 p-4">
      <form
        className="min-w-[200px] flex-1"
        onSubmit={(event) => {
          event.preventDefault();
          update({ q: query });
        }}
      >
        <label htmlFor="career-search" className="mb-1 block text-xs font-medium text-muted">
          Search careers
        </label>
        <input
          id="career-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="e.g. nurse, data, electrician"
          className="w-full rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
      </form>

      <div>
        <label htmlFor="career-sort" className="mb-1 block text-xs font-medium text-muted">
          Sort by
        </label>
        <select
          id="career-sort"
          value={current.sort}
          onChange={(event) => update({ sort: event.target.value })}
          className="rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand-500"
        >
          <option value="demand">Future demand</option>
          <option value="salary">Highest entry pay</option>
          <option value="cost">Lowest cost</option>
          <option value="name">Name (A–Z)</option>
        </select>
      </div>

      <div>
        <label htmlFor="career-budget" className="mb-1 block text-xs font-medium text-muted">
          Education budget
        </label>
        <select
          id="career-budget"
          value={current.maxCost ?? ""}
          onChange={(event) => update({ maxCost: event.target.value || null })}
          className="rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand-500"
        >
          <option value="">Any budget</option>
          {budgets.map((budget) => (
            <option key={budget.value} value={budget.value}>
              {budget.label}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="flex items-center gap-4 pb-2">
        <legend className="sr-only">Work style filters</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={current.remote}
            onChange={(event) => update({ remote: event.target.checked ? "1" : null })}
            className="size-4 rounded border-2 accent-brand-600"
          />
          Remote possible
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={current.self}
            onChange={(event) => update({ self: event.target.checked ? "1" : null })}
            className="size-4 rounded border-2 accent-brand-600"
          />
          Can work for myself
        </label>
      </fieldset>

      {hasFilters ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQuery("");
            router.push(current.group ? `/careers?group=${current.group}` : "/careers");
          }}
        >
          Clear
        </Button>
      ) : null}
    </div>
  );
}
