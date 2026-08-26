"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";

/**
 * The landing page's single input.
 *
 * It used to fork: a signed-in visitor's question went to the assistant, a
 * signed-out one's went to search. There is no assistant now, so it does not
 * fork — everything goes to search, which reads the same corpus the assistant
 * was grounded in and shows the guides themselves rather than a paraphrase of
 * them. Where search finds nothing, it offers a mentor.
 */
export function AskBox({ examples, signedIn }: { examples: string[]; signedIn: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  function submit(question: string) {
    const trimmed = question.trim();
    if (!trimmed) return;
    setBusy(true);
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(value);
        }}
        className="rounded-md border bg-[var(--surface)] p-2 focus-within:border-brand-500"
      >
        <label htmlFor="ask" className="sr-only">
          Tell us about yourself and what you want to achieve
        </label>
        <textarea
          id="ask"
          rows={3}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              submit(value);
            }
          }}
          placeholder="Tell us about yourself — your education, interests, budget, and what you want to achieve."
          className="w-full resize-none bg-transparent px-3 py-2.5 text-[15px] outline-none placeholder:text-faint"
        />
        <div className="flex items-center justify-between gap-2 px-1 pb-1">
          <p className="hidden text-xs text-faint sm:block">
            {signedIn ? "Searches every guide on the platform." : "No account needed to look around."}
          </p>
          <Button type="submit" disabled={busy || !value.trim()} size="sm">
            {busy ? "Working…" : "Search the guides"}
          </Button>
        </div>
      </form>

      <div className="mt-4">
        <p className="mb-2 text-xs uppercase tracking-wider text-faint">Or start with one of these</p>
        <ul className="flex flex-wrap justify-center gap-2">
          {examples.map((example) => (
            <li key={example}>
              <button
                type="button"
                onClick={() => {
                  setValue(example);
                  submit(example);
                }}
                className="rounded-full border bg-[var(--surface)] px-3 py-1.5 text-left text-xs text-muted transition-colors hover:border-brand-400 hover:text-[var(--text)]"
              >
                {example}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
