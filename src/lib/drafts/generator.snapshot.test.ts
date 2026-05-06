/**
 * Snapshot tests ΓÇö NBSP spacing contract for the draft generator (WI-21)
 *
 * LinkedIn renders blank lines between paragraphs ONLY when the spacing
 * character is U+00A0 (non-breaking space). A plain double-newline (\n\n)
 * is collapsed in the LinkedIn feed.
 *
 * Contract (established by WI-09 / generator.ts):
 *   - The LLM prompt instructs the model to emit U+00A0 for blank lines.
 *   - The expected blank-line pattern is:  paragraph1\n\u00A0\nparagraph2
 *   - sanitizeBody() PRESERVES the NBSP character (it is NOT in the
 *     zero-width strip list ΓÇö zero-width chars U+200BΓÇô200D, FEFF, U+00AD
 *     are stripped, but U+00A0 is intentionally kept).
 *   - sanitizeBody() does NOT upgrade plain \n\n to \n\u00A0\n.
 *     If the LLM fails to emit NBSP, blank lines will collapse on LinkedIn.
 *     This is a prompt-level contract, not a sanitizer enforcement.
 *
 * These tests lock in that behaviour.  If a future refactor accidentally
 * strips NBSP from sanitizeBody(), these snapshots fail loudly.
 * To intentionally change the contract, update the inline snapshots here
 * and document the change in .squad/decisions/.
 */

// Mock DB and LLM modules before importing generator so the module-level
// singleton creation in @/db (postgres client) and @/lib/llm (AzureOpenAI)
// does not try to connect during unit tests.
import { vi, describe, it, expect } from "vitest";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/llm", () => ({
  chat: vi.fn(),
}));

vi.mock("@/lib/prompts", () => ({
  getActivePrompt: vi.fn(),
  renderPrompt: vi.fn(),
}));

import { sanitizeBody } from "./generator";

// ΓöÇΓöÇ Helper ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

/**
 * Render a string with explicit Unicode escape notation for U+00A0 so that
 * inline snapshot literals are human-readable and the NBSP is unambiguous.
 *
 * Example:  "hello\u{00A0}world"  rather than  "hello world" (visually identical)
 */
function withExplicitNbsp(s: string): string {
  return s.replace(/\u00A0/g, "\\u{00A0}");
}

// ΓöÇΓöÇ Fixtures ΓÇö canonical LLM output scenarios ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

// LinkedIn blank-line pattern emitted by the LLM: newline + NBSP + newline.
const NBSP = "\u00A0";
const BLANK = `\n${NBSP}\n`; // "\n\u00A0\n"

const SINGLE_PARA =
  "Excited to share that Azure AI Foundry is now generally available! " +
  "This means enterprise-grade model deployment for every Azure customer. " +
  "#Azure #AI";

const TWO_PARA =
  "Azure AI Foundry just hit GA ΓÇö and the implications are massive." +
  BLANK +
  "Enterprise teams can now deploy models with the same reliability guarantees " +
  "they get from every other Azure service. #Azure #AI";

const THREE_PARA =
  "Big news from Microsoft: Azure AI Foundry is generally available." +
  BLANK +
  "What does GA mean in practice? SLAs, compliance certifications, and " +
  "dedicated support ΓÇö all the things enterprise buyers need to say yes." +
  BLANK +
  "If you're evaluating AI platforms for your org, this changes the calculus. " +
  "#AzureAI #MicrosoftAzure #AIFoundry";

// ΓöÇΓöÇ 1. Single paragraph ΓÇö no blank line needed ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("sanitizeBody ΓÇö single paragraph", () => {
  it("preserves the text unchanged (no NBSP needed)", () => {
    const result = sanitizeBody(SINGLE_PARA);
    expect(result).toBe(SINGLE_PARA);
    expect(withExplicitNbsp(result)).toMatchInlineSnapshot(
      `"Excited to share that Azure AI Foundry is now generally available! This means enterprise-grade model deployment for every Azure customer. #Azure #AI"`,
    );
  });

  it("does not contain any NBSP", () => {
    expect(sanitizeBody(SINGLE_PARA)).not.toContain(NBSP);
  });
});

// ΓöÇΓöÇ 2. Two paragraphs ΓÇö one blank line (must be NBSP) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("sanitizeBody ΓÇö two paragraphs with NBSP blank line", () => {
  it("preserves the exact NBSP blank-line pattern", () => {
    const result = sanitizeBody(TWO_PARA);
    expect(withExplicitNbsp(result)).toMatchInlineSnapshot(
      `
      "Azure AI Foundry just hit GA ΓÇö and the implications are massive.
      \\u{00A0}
      Enterprise teams can now deploy models with the same reliability guarantees they get from every other Azure service. #Azure #AI"
    `,
    );
  });

  it("contains exactly one U+00A0 character", () => {
    const result = sanitizeBody(TWO_PARA);
    const nbspCount = [...result].filter((c) => c === NBSP).length;
    expect(nbspCount).toBe(1);
  });

  it("blank line is \\n + U+00A0 + \\n, not bare \\n\\n", () => {
    const result = sanitizeBody(TWO_PARA);
    // Must contain the NBSP sandwich
    expect(result).toContain(`\n${NBSP}\n`);
    // Must NOT contain a bare double-newline (which collapses on LinkedIn)
    expect(result).not.toMatch(/\n\n/);
  });
});

// ΓöÇΓöÇ 3. Three paragraphs ΓÇö two blank lines ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("sanitizeBody ΓÇö three paragraphs with two NBSP blank lines", () => {
  it("preserves both NBSP blank-line patterns", () => {
    const result = sanitizeBody(THREE_PARA);
    expect(withExplicitNbsp(result)).toMatchInlineSnapshot(
      `
      "Big news from Microsoft: Azure AI Foundry is generally available.
      \\u{00A0}
      What does GA mean in practice? SLAs, compliance certifications, and dedicated support ΓÇö all the things enterprise buyers need to say yes.
      \\u{00A0}
      If you're evaluating AI platforms for your org, this changes the calculus. #AzureAI #MicrosoftAzure #AIFoundry"
    `,
    );
  });

  it("contains exactly two U+00A0 characters", () => {
    const result = sanitizeBody(THREE_PARA);
    const nbspCount = [...result].filter((c) => c === NBSP).length;
    expect(nbspCount).toBe(2);
  });

  it("every blank line uses \\n + U+00A0 + \\n ΓÇö no bare \\n\\n", () => {
    const result = sanitizeBody(THREE_PARA);
    expect(result.split(`\n${NBSP}\n`)).toHaveLength(3); // 2 separators ΓåÆ 3 parts
    expect(result).not.toMatch(/\n\n/);
  });
});

// ΓöÇΓöÇ 4. Round-trip: JSON serialization preserves NBSP ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("NBSP round-trip through JSON serialization", () => {
  it("survives JSON.stringify ΓåÆ JSON.parse", () => {
    const original = sanitizeBody(TWO_PARA);
    const serialized = JSON.stringify({ body: original });
    const restored = (JSON.parse(serialized) as { body: string }).body;
    expect(restored).toBe(original);
    expect(restored).toContain(NBSP);
  });

  it("JSON.stringify encodes NBSP as either raw char or \\u00a0 escape", () => {
    // Both representations are valid JSON and round-trip cleanly.
    // We verify that the raw escaped form is also safe.
    const escaped = '{"body":"para1\\n\\u00a0\\npara2"}';
    const parsed = (JSON.parse(escaped) as { body: string }).body;
    expect(parsed).toContain(NBSP);
    expect(parsed).toBe(`para1\n${NBSP}\npara2`);
  });
});

// ΓöÇΓöÇ 5. Negative test ΓÇö plain \n\n is NOT upgraded to NBSP ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
//
// CONTRACT: sanitizeBody() preserves, not injects, NBSP.
// The LLM is responsible for emitting \n\u00A0\n in its output.
// If the model returns plain \n\n, sanitizeBody() leaves it as-is.
// Consequence: blank lines will collapse in the LinkedIn feed.
// This is documented here so future contributors understand the pipeline contract.
// The fix for "LLM returned \n\n" is to improve the prompt, NOT the sanitizer.

describe("sanitizeBody ΓÇö negative: plain \\n\\n is NOT upgraded to NBSP", () => {
  const plainDoubleNewline = `paragraph one\n\nparagraph two`;

  it("leaves \\n\\n unchanged ΓÇö NBSP is NOT injected by the sanitizer", () => {
    const result = sanitizeBody(plainDoubleNewline);
    // The sanitizer preserves whatever the LLM emits; it does not fix missing NBSP.
    expect(result).toBe(plainDoubleNewline);
    expect(result).not.toContain(NBSP);
    // Document the LinkedIn consequence: blank line will collapse in the feed.
    expect(result).toMatch(/\n\n/);
  });

  it("snapshot of sanitizer pass-through for plain double-newline", () => {
    expect(sanitizeBody(plainDoubleNewline)).toMatchInlineSnapshot(
      `"paragraph one\n\nparagraph two"`,
    );
  });
});

// ΓöÇΓöÇ 6. Byte-level verification ΓÇö NBSP is U+00A0, not a lookalike ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

describe("NBSP identity ΓÇö byte-level verification", () => {
  it("U+00A0 code point is 160 decimal", () => {
    expect(NBSP.codePointAt(0)).toBe(160); // 0xA0
  });

  it("sanitizeBody does not confuse NBSP with regular space (U+0020)", () => {
    const withNbsp = `hello${NBSP}world`;
    const withSpace = "hello world";
    expect(sanitizeBody(withNbsp)).not.toBe(sanitizeBody(withSpace));
  });

  it("NBSP survives all other sanitize passes (strip bold/italic/headings/ZWJ)", () => {
    // Realistic LLM output: markdown noise around NBSP-separated paragraphs
    const messyLlmOutput =
      `**Exciting news!** Azure AI is here.` +
      `\n${NBSP}\n` +
      `*Check it out* at the link below. #Azure`;

    const result = sanitizeBody(messyLlmOutput);

    // Markdown stripped
    expect(result).not.toContain("**");
    expect(result).not.toContain("*");
    // NBSP still present
    expect(result).toContain(NBSP);
    expect(withExplicitNbsp(result)).toMatchInlineSnapshot(
      `
      "Exciting news! Azure AI is here.
      \\u{00A0}
      Check it out at the link below. #Azure"
    `,
    );
  });
});
