/**
 * LLM provider abstraction.
 *
 * Nothing above this file knows which model is in use. Two adapters ship:
 *
 *  - `anthropic` — used when ANTHROPIC_API_KEY is set.
 *  - `offline`   — a deterministic, rule-driven responder used when no key is
 *                  configured. It is not a mock for tests; it is a real
 *                  fallback so the product stays usable (and honest about what
 *                  it is) without a paid dependency. Every response it produces
 *                  is labelled so a user is never told a rule-built answer came
 *                  from a model.
 */
import { env } from "@/modules/shared/env";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type CompletionRequest = {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
};

export type CompletionResult = {
  text: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
};

export type StructuredRequest<T> = {
  system: string;
  messages: ChatMessage[];
  /** JSON Schema the model must satisfy. */
  schema: Record<string, unknown>;
  schemaName: string;
  fallback: () => T;
  maxTokens?: number;
};

export type StructuredResult<T> = {
  value: T;
  provider: string;
  usedFallback: boolean;
};

export interface LlmProvider {
  readonly name: string;
  readonly isModelBacked: boolean;
  complete(request: CompletionRequest): Promise<CompletionResult>;
  stream(request: CompletionRequest): AsyncIterable<string>;
  structured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>>;
}

// ---------------------------------------------------------------------------
// Anthropic adapter
// ---------------------------------------------------------------------------

class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";
  readonly isModelBacked = true;

  private async client() {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    return new Anthropic({ apiKey: env.anthropicApiKey });
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const client = await this.client();
    const response = await client.messages.create({
      model: env.aiModel,
      max_tokens: request.maxTokens ?? 1600,
      temperature: request.temperature ?? 0.4,
      system: request.system,
      messages: request.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    });

    const text = response.content
      .filter((block): block is { type: "text"; text: string } & typeof block => block.type === "text")
      .map((block) => block.text)
      .join("");

    return {
      text,
      provider: this.name,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }

  async *stream(request: CompletionRequest): AsyncIterable<string> {
    const client = await this.client();
    const stream = await client.messages.create({
      model: env.aiModel,
      max_tokens: request.maxTokens ?? 1600,
      temperature: request.temperature ?? 0.4,
      system: request.system,
      messages: request.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      stream: true,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      }
    }
  }

  /**
   * Forces JSON by giving the model a single tool it must call. Validation
   * failures fall back to the caller's deterministic result rather than
   * surfacing a broken shape to the UI.
   */
  async structured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
    try {
      const client = await this.client();
      const response = await client.messages.create({
        model: env.aiModel,
        max_tokens: request.maxTokens ?? 2000,
        system: request.system,
        messages: request.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        tools: [
          {
            name: request.schemaName,
            description: "Return the structured result.",
            input_schema: request.schema as never,
          },
        ],
        tool_choice: { type: "tool", name: request.schemaName },
      });

      const toolUse = response.content.find((block) => block.type === "tool_use");
      if (!toolUse || toolUse.type !== "tool_use") {
        return { value: request.fallback(), provider: this.name, usedFallback: true };
      }
      return { value: toolUse.input as T, provider: this.name, usedFallback: false };
    } catch (error) {
      console.error("[ai] structured call failed, using deterministic fallback", error);
      return { value: request.fallback(), provider: "fallback", usedFallback: true };
    }
  }
}

// ---------------------------------------------------------------------------
// Offline adapter
// ---------------------------------------------------------------------------

/**
 * Composes an answer from the retrieved context alone.
 *
 * It never invents facts: it reports what the database holds for the query and
 * says plainly when it holds nothing. Being unhelpful-but-honest is the correct
 * failure mode for a product that people make education and money decisions on.
 */
class OfflineProvider implements LlmProvider {
  readonly name = "offline";
  readonly isModelBacked = false;

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const text = this.compose(request);
    return { text, provider: this.name, inputTokens: 0, outputTokens: 0 };
  }

  async *stream(request: CompletionRequest): AsyncIterable<string> {
    const text = this.compose(request);
    // Chunked so the client's streaming path is exercised identically.
    const words = text.split(/(\s+)/);
    for (let index = 0; index < words.length; index += 4) {
      yield words.slice(index, index + 4).join("");
      await new Promise((resolve) => setTimeout(resolve, 8));
    }
  }

  async structured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
    return { value: request.fallback(), provider: this.name, usedFallback: true };
  }

  private compose(request: CompletionRequest): string {
    const lastUser = [...request.messages].reverse().find((m) => m.role === "user");
    const question = lastUser?.content ?? "";

    // The system prompt carries the retrieved records under a fixed heading;
    // this pulls them back out to answer from.
    const contextMatch = request.system.match(/<retrieved>([\s\S]*?)<\/retrieved>/);
    const context = contextMatch?.[1]?.trim() ?? "";

    if (!context) {
      return [
        "I don't have anything verified in the database that matches that question yet, so I'm not going to guess at it.",
        "",
        "What would help:",
        "",
        "- Browse the career and exam guides directly — they carry the source and the date each fact was last checked.",
        "- Fill in your profile (education, budget, hours available) so recommendations can be scored against your actual situation.",
        "- For anything about eligibility, dates or fees, check the official notification. That is the only authoritative version.",
        "",
        "_This deployment is running without a language-model key, so this reply was assembled from rules rather than generated._",
      ].join("\n");
    }

    return [
      "Here is what the platform holds that relates to your question. Every item below is drawn from the database, with its source and last-verified date shown on the linked page.",
      "",
      context,
      "",
      "**What to do next**",
      "",
      "- Open the linked guides for the full breakdown: eligibility, cost, time, salary range and the step-by-step roadmap.",
      "- Complete your profile so these can be ranked against your budget, location and available study hours instead of shown generically.",
      "- Verify anything time-sensitive — exam dates, fees, eligibility cut-offs — against the official notification before you act on it.",
      "",
      "_This deployment is running without a language-model key, so this reply was assembled from the retrieved records rather than generated. Set ANTHROPIC_API_KEY for conversational answers._",
    ].join("\n");
  }
}

let cached: LlmProvider | null = null;

export function getProvider(): LlmProvider {
  if (cached) return cached;
  cached = env.anthropicApiKey ? new AnthropicProvider() : new OfflineProvider();
  return cached;
}

/** Test seam. */
export function __setProvider(provider: LlmProvider | null) {
  cached = provider;
}
