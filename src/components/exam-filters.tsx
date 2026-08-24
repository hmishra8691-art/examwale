"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";

export function ExamFilters({
  current,
}: {
  current: { q: string; age: string; category?: string };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(current.q);
  const [age, setAge] = useState(current.age);

  function apply(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (!value) next.delete(key);
      else next.set(key, value);
    }
    next.delete("page");
    router.push(`/exams?${next.toString()}`);
  }

  return (
    <form
      className="card flex flex-wrap items-end gap-3 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        apply({ q: query, age });
      }}
    >
      <div className="min-w-[200px] flex-1">
        <label htmlFor="exam-search" className="mb-1 block text-xs font-medium text-muted">
          Search exams
        </label>
        <input
          id="exam-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="e.g. UPSC, banking, railways"
          className="w-full rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
      </div>

      <div>
        <label htmlFor="exam-age" className="mb-1 block text-xs font-medium text-muted">
          Your age
        </label>
        <input
          id="exam-age"
          type="number"
          min={15}
          max={60}
          value={age}
          onChange={(event) => setAge(event.target.value)}
          placeholder="e.g. 25"
          className="w-28 rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
      </div>

      <Button type="submit" size="sm">
        Apply
      </Button>

      {(current.q || current.age) && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setQuery("");
            setAge("");
            router.push(current.category ? `/exams?category=${current.category}` : "/exams");
          }}
        >
          Clear
        </Button>
      )}

      <p className="w-full text-xs text-faint">
        Age filtering uses the general-category limits on record. Most exams offer relaxations by
        category — check the notification before ruling yourself out.
      </p>
    </form>
  );
}
