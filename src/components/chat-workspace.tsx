"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Callout, ConfidenceBadge, cx } from "@/components/ui";
import type { AiMode } from "@/modules/ai/types";

type Conversation = { id: string; title: string; mode: string; updatedAt: string };
type Citation = { label: string; kind: string; slug: string; sourceName?: string; lastVerifiedAt?: string };
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[] | null;
  streaming?: boolean;
};

const HREF_BY_KIND: Record<string, string> = {
  career: "/careers",
  exam: "/exams",
  business: "/business",
  job: "/jobs",
  resource: "/careers",
};

export function ChatWorkspace({
  modes,
  conversations: initialConversations,
  usage,
  plan,
  initialQuestion,
  initialConversationId,
  modelBacked,
}: {
  modes: { value: AiMode; label: string; blurb: string }[];
  conversations: Conversation[];
  usage: { used: number; limit: number; remaining: number };
  plan: string;
  initialQuestion: string;
  initialConversationId?: string;
  modelBacked: boolean;
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(initialConversationId ?? null);
  const [mode, setMode] = useState<AiMode>("GENERAL");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState(initialQuestion);
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(usage.remaining);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sentInitial = useRef(false);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  useEffect(scrollToBottom, [messages, scrollToBottom]);

  const loadConversation = useCallback(async (conversationId: string) => {
    setActiveId(conversationId);
    setSidebarOpen(false);
    const response = await fetch(`/api/v1/ai/conversations/${conversationId}`);
    if (!response.ok) return;
    const body = await response.json();
    setMessages(
      body.data.messages.map((message: { id: string; role: string; content: string; citations: Citation[] | null }) => ({
        id: message.id,
        role: message.role as "user" | "assistant",
        content: message.content,
        citations: message.citations,
      })),
    );
    setMode(body.data.conversation.mode);
  }, []);

  const send = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || busy) return;

      setBusy(true);
      setError(null);
      setInput("");

      const userMessage: Message = { id: `local-${Date.now()}`, role: "user", content: trimmed };
      const assistantMessage: Message = {
        id: `local-${Date.now()}-a`,
        role: "assistant",
        content: "",
        streaming: true,
      };
      setMessages((current) => [...current, userMessage, assistantMessage]);

      try {
        const response = await fetch("/api/v1/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, conversationId: activeId, mode }),
        });

        if (!response.ok || !response.body) {
          const body = await response.json().catch(() => null);
          setError(body?.error?.message ?? "The assistant couldn't answer just now.");
          setMessages((current) => current.filter((message) => !message.streaming));
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const event of events) {
            const line = event.split("\n").find((part) => part.startsWith("data: "));
            if (!line) continue;
            const payload = JSON.parse(line.slice(6));

            if (payload.type === "meta") {
              setActiveId(payload.conversationId);
              if (payload.remaining !== undefined) setRemaining(payload.remaining);
            } else if (payload.type === "delta") {
              accumulated += payload.text;
              setMessages((current) =>
                current.map((message) =>
                  message.streaming ? { ...message, content: accumulated } : message,
                ),
              );
            } else if (payload.type === "done") {
              setMessages((current) =>
                current.map((message) =>
                  message.streaming
                    ? {
                        ...message,
                        content: payload.text ?? accumulated,
                        citations: payload.citations ?? null,
                        streaming: false,
                      }
                    : message,
                ),
              );
              if (payload.conversation) {
                setConversations((current) => {
                  const without = current.filter((item) => item.id !== payload.conversation.id);
                  return [payload.conversation, ...without];
                });
              }
            } else if (payload.type === "error") {
              setError(payload.message);
              setMessages((current) => current.filter((message) => !message.streaming));
            }
          }
        }
      } catch {
        setError("Lost connection to the assistant. Try again in a moment.");
        setMessages((current) => current.filter((message) => !message.streaming));
      } finally {
        setBusy(false);
      }
    },
    [activeId, busy, mode],
  );

  useEffect(() => {
    if (initialConversationId && !sentInitial.current) {
      sentInitial.current = true;
      void loadConversation(initialConversationId);
      return;
    }
    if (initialQuestion && !sentInitial.current) {
      sentInitial.current = true;
      void send(initialQuestion);
    }
  }, [initialQuestion, initialConversationId, loadConversation, send]);

  function startNew(nextMode: AiMode) {
    setActiveId(null);
    setMessages([]);
    setMode(nextMode);
    setSidebarOpen(false);
  }

  const activeMode = modes.find((item) => item.value === mode);

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      {/* Sidebar */}
      <aside
        className={cx(
          "space-y-4 lg:block",
          sidebarOpen ? "block" : "hidden",
        )}
      >
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">
            Start a conversation
          </h2>
          <ul className="space-y-1">
            {modes.map((item) => (
              <li key={item.value}>
                <button
                  type="button"
                  onClick={() => startNew(item.value)}
                  className={cx(
                    "w-full rounded-lg px-3 py-2 text-left transition-colors",
                    mode === item.value && !activeId
                      ? "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-100"
                      : "hover:bg-[var(--surface-raised)]",
                  )}
                >
                  <span className="block text-sm font-medium">{item.label}</span>
                  <span className="block text-xs text-muted">{item.blurb}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {conversations.length ? (
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">History</h2>
            <ul className="space-y-0.5">
              {conversations.slice(0, 20).map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => loadConversation(conversation.id)}
                    className={cx(
                      "w-full truncate rounded-lg px-3 py-2 text-left text-sm transition-colors",
                      activeId === conversation.id
                        ? "bg-[var(--surface-sunken)] font-medium"
                        : "text-muted hover:bg-[var(--surface-raised)]",
                    )}
                  >
                    {conversation.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </aside>

      {/* Main */}
      <div className="flex min-h-[70vh] flex-col">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
              {activeMode?.label ?? "Assistant"}
            </h1>
            <p className="text-sm text-muted">{activeMode?.blurb}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSidebarOpen((value) => !value)}
              className="rounded-lg border px-3 py-1.5 text-sm lg:hidden"
            >
              {sidebarOpen ? "Hide" : "Topics"}
            </button>
            <Badge tone={remaining <= 3 ? "warn" : "neutral"}>
              {remaining} of {usage.limit} questions left today
            </Badge>
          </div>
        </header>

        {!modelBacked ? (
          <Callout tone="warn" title="Running without a language model">
            <p>
              No <code>ANTHROPIC_API_KEY</code> is configured, so answers are assembled from the
              database rather than generated. Retrieval, citations and safety checks all still work
              — the replies are just far more mechanical. Every response says so.
            </p>
          </Callout>
        ) : null}

        <div className="mt-4 flex-1 space-y-4 overflow-y-auto scroll-slim pr-1">
          {messages.length === 0 ? (
            <div className="card p-6">
              <h2 className="font-semibold">Ask anything about your career, education or plans</h2>
              <p className="mt-1 text-sm text-muted">
                Answers use your profile and the platform&rsquo;s verified records. Where we
                don&rsquo;t have something, we&rsquo;ll say so rather than make it up.
              </p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {[
                  "I have a B.Com and don't know what to do next",
                  "Can I become a software developer without a CS degree?",
                  "Which government exams can I apply for at 27?",
                  "I want to learn full-stack in 30 days and get a ₹20 lakh job",
                  "What does it really cost to become a doctor?",
                ].map((example) => (
                  <li key={example}>
                    <button
                      type="button"
                      onClick={() => send(example)}
                      className="rounded-full border px-3 py-1.5 text-left text-sm text-muted hover:border-brand-400 hover:text-[var(--text)]"
                    >
                      {example}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {messages.map((message) => (
            <div
              key={message.id}
              className={cx("flex", message.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cx(
                  "max-w-[85ch] rounded-2xl px-4 py-3",
                  message.role === "user"
                    ? "bg-brand-600 text-white"
                    : "card animate-fade-up",
                )}
              >
                {message.role === "assistant" ? (
                  <>
                    <div className="prose-plain text-[15px]">
                      <Markdown text={message.content} />
                      {message.streaming ? (
                        <span className="ml-1 inline-block size-2 animate-pulse-dot rounded-full bg-brand-500" />
                      ) : null}
                    </div>
                    {!message.streaming ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-2">
                        <ConfidenceBadge level={message.citations?.length ? "ESTIMATED" : "AI_JUDGEMENT"} size="xs" />
                        {message.citations?.map((citation) => (
                          <Link
                            key={`${citation.kind}-${citation.slug}`}
                            href={`${HREF_BY_KIND[citation.kind] ?? "/search"}/${citation.slug}`}
                            className="rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-[11px] hover:underline"
                          >
                            {citation.label}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="whitespace-pre-wrap text-[15px]">{message.content}</p>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {error ? (
          <div className="mt-3">
            <Callout tone="danger">
              <p>{error}</p>
              {remaining <= 0 ? (
                <p className="mt-1">
                  {plan === "FREE" ? (
                    <>Your free questions reset tomorrow.</>
                  ) : (
                    <>Today&rsquo;s limit has been reached.</>
                  )}
                </p>
              ) : null}
            </Callout>
          </div>
        ) : null}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send(input);
          }}
          className="mt-4 rounded-2xl border bg-[var(--surface)] p-2 focus-within:border-brand-500"
        >
          <label htmlFor="chat-input" className="sr-only">
            Your question
          </label>
          <textarea
            id="chat-input"
            rows={2}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(input);
              }
            }}
            placeholder="Ask about careers, exams, jobs, business — or your own situation."
            className="w-full resize-none bg-transparent px-3 py-2 text-[15px] outline-none placeholder:text-faint"
            disabled={busy || remaining <= 0}
          />
          <div className="flex items-center justify-between gap-2 px-1 pb-1">
            <p className="text-xs text-faint">Enter to send · Shift+Enter for a new line</p>
            <Button type="submit" size="sm" disabled={busy || !input.trim() || remaining <= 0}>
              {busy ? "Thinking…" : "Send"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Minimal markdown renderer for assistant output.
 *
 * Deliberately hand-rolled and escaping-first rather than pulling in a parser:
 * model output is untrusted text, and the safe subset here (headings, bold,
 * lists, links, rules) covers everything the prompts ask for.
 */
function Markdown({ text }: { text: string }) {
  const escape = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const inline = (value: string) =>
    escape(value)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\[([^\]]+)\]\((\/[^)\s]*)\)/g, '<a href="$2">$1</a>');

  const blocks: string[] = [];
  let listBuffer: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const flushList = () => {
    if (!listBuffer.length || !listType) return;
    blocks.push(`<${listType}>${listBuffer.map((item) => `<li>${item}</li>`).join("")}</${listType}>`);
    listBuffer = [];
    listType = null;
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      flushList();
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      flushList();
      blocks.push("<hr />");
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushList();
      const level = Math.min(4, heading[1].length + 1);
      blocks.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      if (listType !== "ul") flushList();
      listType = "ul";
      listBuffer.push(inline(bullet[1]));
      continue;
    }

    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (numbered) {
      if (listType !== "ol") flushList();
      listType = "ol";
      listBuffer.push(inline(numbered[1]));
      continue;
    }

    flushList();
    blocks.push(`<p>${inline(line)}</p>`);
  }
  flushList();

  return <div dangerouslySetInnerHTML={{ __html: blocks.join("") }} />;
}
