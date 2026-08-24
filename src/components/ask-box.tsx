"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";

/**
 * The landing page's single input. A natural-language question routes into the
 * assistant when the user is signed in, and into search when they aren't —
 * browsing is deliberately open, and the sign-in wall only appears where the
 * answer becomes personal.
 */
export function AskBox({ examples, signedIn }: { examples: string[]; signedIn: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  function submit(question: string) {
    const trimmed = question.trim();
    if (!trimmed) return;
    setBusy(true);
    const target = signedIn
      ? `/chat?q=${encodeURIComponent(trimmed)}`
      : `/search?q=${encodeURIComponent(trimmed)}`;
    router.push(target);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(value);
        }}
        className="rounded-2xl border bg-[var(--surface)] p-2 shadow-sm focus-within:border-brand-500"
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
            {signedIn ? "Answers use your profile." : "No account needed to look around."}
          </p>
          <Button type="submit" disabled={busy || !value.trim()} size="sm">
            {busy ? "Working…" : signedIn ? "Ask" : "Find answers"}
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
