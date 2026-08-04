import { describe, expect, it } from "vitest";
import { llmErrorCode, llmRetryAfterSeconds } from "../src/server/llm/index";

// Shape of what the OpenAI / Anthropic SDKs actually throw: a status plus a
// message, sometimes with the provider payload hanging off `error`.
function providerError(status: number, message: string, error?: unknown) {
  return Object.assign(new Error(message), { status, error });
}

describe("llmErrorCode", () => {
  it("returns null for errors we don't special-case", () => {
    expect(llmErrorCode(providerError(500, "internal server error"))).toBeNull();
    expect(llmErrorCode(new Error("socket hang up"))).toBeNull();
    expect(llmErrorCode(undefined)).toBeNull();
  });

  it.each([401, 403])("maps %i to byok_invalid_key", (status) => {
    expect(llmErrorCode(providerError(status, "Invalid API Key"))).toBe(
      "byok_invalid_key",
    );
  });

  it("maps a retired model to model_unavailable", () => {
    // Verbatim from Groq after llama-4-scout was shut down.
    const err = providerError(
      404,
      "The model `meta-llama/llama-4-scout-17b-16e-instruct` does not exist or you do not have access to it.",
    );
    expect(llmErrorCode(err)).toBe("model_unavailable");
  });

  it("leaves an unrelated 404 alone", () => {
    expect(llmErrorCode(providerError(404, "endpoint not available"))).toBeNull();
  });

  it("treats a per-minute token overflow as a rate limit", () => {
    // Groq reports this as 413, not 429.
    const err = providerError(
      413,
      "Request too large for model `openai/gpt-oss-120b` on tokens per minute (TPM): Limit 8000, Requested 8173",
    );
    expect(llmErrorCode(err)).toBe("model_rate_limited");
  });

  it("distinguishes an exhausted quota from a burst rate limit", () => {
    const quota = providerError(429, "You exceeded your current quota");
    const burst = providerError(429, "Rate limit reached for requests");
    expect(llmErrorCode(quota)).toBe("model_quota");
    expect(llmErrorCode(burst)).toBe("model_rate_limited");
  });

  // Groq closes every rate-limit body with an upsell link containing the word
  // "billing", so the daily and the per-minute limit have to be told apart by
  // the limit they name, not by that link.
  it("reads a per-day limit as spent quota", () => {
    const err = providerError(
      429,
      "Rate limit reached for model `llama-3.3-70b-versatile` on tokens per day (TPD): Limit 100000, Used 99964, Requested 6036. Please try again in 1h26m24s. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing",
    );
    // 1h26m24s, carried through so the UI can say when the model frees up.
    expect(llmErrorCode(err)).toBe("model_quota:5184");
  });

  it("reads a per-minute limit as a transient rate limit despite the upsell link", () => {
    const err = providerError(
      429,
      "Rate limit reached for model `llama-3.3-70b-versatile` on tokens per minute (TPM): Limit 12000, Used 11800, Requested 900. Please try again in 20s. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing",
    );
    expect(llmErrorCode(err)).toBe("model_rate_limited:20");
  });

  it("reads the quota signal out of a nested provider payload", () => {
    const err = providerError(429, "429 status code", {
      error: { code: "insufficient_quota" },
    });
    expect(llmErrorCode(err)).toBe("model_quota");
  });
});

describe("llmRetryAfterSeconds", () => {
  it("prefers the retry-after header", () => {
    const err = Object.assign(new Error("429"), {
      status: 429,
      headers: { "retry-after": "20" },
    });
    expect(llmRetryAfterSeconds(err)).toBe(20);
  });

  it("reads a Headers instance too", () => {
    const err = Object.assign(new Error("429"), {
      status: 429,
      headers: new Headers({ "retry-after": "45" }),
    });
    expect(llmRetryAfterSeconds(err)).toBe(45);
  });

  it.each([
    ["Please try again in 1h26m24s", 5184],
    ["Please try again in 20s", 20],
    ["Please try again in 2m30s", 150],
    ["Please try again in 7.66s", 8],
  ])("parses %s out of the body", (message, expected) => {
    expect(llmRetryAfterSeconds(new Error(message))).toBe(expected);
  });

  it("returns null when the provider said nothing", () => {
    expect(llmRetryAfterSeconds(new Error("boom"))).toBeNull();
    expect(llmRetryAfterSeconds(undefined)).toBeNull();
  });

  it("appends the wait to the limit codes so the UI can show it", () => {
    const err = Object.assign(
      new Error(
        "Rate limit reached on tokens per day (TPD). Please try again in 1h26m24s.",
      ),
      { status: 429 },
    );
    expect(llmErrorCode(err)).toBe("model_quota:5184");
  });

  it("leaves the code bare when there is no wait to report", () => {
    const err = Object.assign(new Error("You exceeded your current quota"), {
      status: 429,
    });
    expect(llmErrorCode(err)).toBe("model_quota");
  });
});
