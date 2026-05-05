import type { APIError } from "openai";

/**
 * All LLM error conditions fall into one of these categories.
 * Callers use the category to decide retry vs abort vs surface-to-user.
 */
export type LLMErrorCategory =
  | "auth" //         401 / 403 — bad key, expired token, wrong deployment RBAC
  | "ratelimit" //    429 — TPM or RPM exceeded; caller should back off
  | "content_filter" // Azure content policy blocked the request or response
  | "transient" //    5xx, network errors — safe to retry with backoff
  | "fatal"; //       everything else — programming errors, malformed requests

export class AppError extends Error {
  readonly category: LLMErrorCategory;
  readonly cause: unknown;

  constructor(message: string, category: LLMErrorCategory, cause?: unknown) {
    super(message);
    this.name = "AppError";
    this.category = category;
    this.cause = cause;
  }
}

function isAPIError(err: unknown): err is APIError {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    "message" in err
  );
}

/**
 * Normalise any thrown value from the `openai` SDK (or network layer) into
 * an AppError with a classified category.  Never throws — always returns.
 */
export function normalizeLLMError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (isAPIError(err)) {
    const status = err.status ?? 0;

    if (status === 401 || status === 403) {
      return new AppError(
        `LLM auth error (${status}): ${err.message}`,
        "auth",
        err,
      );
    }

    if (status === 429) {
      return new AppError(
        `LLM rate-limit (429): ${err.message}`,
        "ratelimit",
        err,
      );
    }

    // Azure content-filter can surface as 400 with a specific error code, or
    // as a finish_reason on the completion — both paths end up here.
    const code = (err as { code?: string }).code ?? "";
    if (
      status === 400 &&
      (code === "content_filter" || err.message.includes("content_filter"))
    ) {
      return new AppError(
        `LLM content filter: ${err.message}`,
        "content_filter",
        err,
      );
    }

    if (status >= 500) {
      return new AppError(
        `LLM transient error (${status}): ${err.message}`,
        "transient",
        err,
      );
    }

    return new AppError(
      `LLM fatal error (${status}): ${err.message}`,
      "fatal",
      err,
    );
  }

  // Network / timeout errors thrown before an HTTP response arrives.
  if (err instanceof TypeError && err.message.includes("fetch")) {
    return new AppError(`LLM network error: ${err.message}`, "transient", err);
  }

  const msg = err instanceof Error ? err.message : String(err);
  return new AppError(`LLM unknown error: ${msg}`, "fatal", err);
}
