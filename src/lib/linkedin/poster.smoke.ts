/**
 * Smoke tests for poster.ts — WI-12
 *
 * Tests request shape, headers, body construction, and error mapping.
 * No real network calls — fetch is replaced with a stub before each test.
 *
 * Run with: npx tsx src/lib/linkedin/poster.smoke.ts
 */

// ── Fetch stub infrastructure ─────────────────────────────────────────────────

type FetchStub = (url: string | URL | Request, init?: RequestInit) => Promise<Response>;

let stubbedFetch: FetchStub | null = null;

(globalThis as unknown as Record<string, unknown>).fetch = async (
  url: string | URL | Request,
  init?: RequestInit,
): Promise<Response> => {
  if (!stubbedFetch) throw new Error("fetch called but no stub is installed");
  return stubbedFetch(url, init);
};

import { db } from "@/db";

// ── Constants ─────────────────────────────────────────────────────────────────

const PERSON_URN = "urn:li:person:TestPerson123";

const TEST_POST = {
  id: "post-uuid-1",
  draftText: "Hello LinkedIn from WI-12 smoke test!",
  editedText: null,
  state: "posting",
} as unknown as Parameters<typeof import("./poster").postToLinkedIn>[0];

const ACCESS_TOKEN = "fake-access-token";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let capturedRequests: Array<{ url: string; init: RequestInit | undefined }> = [];

function installFetch(
  responses: Array<Response | ((url: string, init?: RequestInit) => Response)>,
): void {
  let idx = 0;
  capturedRequests = [];

  stubbedFetch = async (url, init) => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    capturedRequests.push({ url: urlStr, init });

    const entry = responses[idx++];
    if (!entry) throw new Error(`Unexpected fetch call #${idx} to ${urlStr}`);
    return typeof entry === "function" ? entry(urlStr, init) : entry;
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

// ── DB patch ──────────────────────────────────────────────────────────────────

function patchDb(personUrn: string | null): () => void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const origSelect = db.select.bind(db) as any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (db as any).select = (fields?: unknown) => {
    const isTokenQuery =
      fields &&
      typeof fields === "object" &&
      "linkedinPersonUrn" in (fields as object);

    if (isTokenQuery) {
      return {
        from: () => ({
          where: () => ({
            limit: () =>
              Promise.resolve(
                personUrn !== null
                  ? [{ id: "token-row-id", linkedinPersonUrn: personUrn }]
                  : [],
              ),
          }),
        }),
      };
    }

    return origSelect(fields);
  };

  return () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).select = origSelect;
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function testHappyPath(): Promise<void> {
  console.log("[smoke] test 1: happy path — 201 response with post URN");

  const LINKEDIN_POST_URN = "urn:li:share:7000000000000001";
  const restoreDb = patchDb(PERSON_URN);

  installFetch([makeResponse(201, { id: LINKEDIN_POST_URN })]);

  const { postToLinkedIn } = await import("./poster");
  const result = await postToLinkedIn(TEST_POST, ACCESS_TOKEN);

  assert(result.linkedinPostId === LINKEDIN_POST_URN, `Expected ${LINKEDIN_POST_URN}, got ${result.linkedinPostId}`);
  assert(capturedRequests.length === 1, `Expected 1 fetch call, got ${capturedRequests.length}`);

  const req = capturedRequests[0]!;
  assert(req.url === "https://api.linkedin.com/v2/ugcPosts", `Wrong URL: ${req.url}`);

  const headers = req.init?.headers as Record<string, string>;
  assert(headers["Authorization"] === `Bearer ${ACCESS_TOKEN}`, "Missing Authorization header");
  assert(headers["Content-Type"] === "application/json", "Missing Content-Type header");
  assert(headers["X-Restli-Protocol-Version"] === "2.0.0", "Missing X-Restli-Protocol-Version");

  const bodyParsed = JSON.parse(req.init?.body as string) as {
    author: string;
    lifecycleState: string;
    specificContent: { "com.linkedin.ugc.ShareContent": { shareCommentary: { text: string }; shareMediaCategory: string } };
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": string };
  };

  assert(bodyParsed.author === PERSON_URN, `Wrong author: ${bodyParsed.author}`);
  assert(bodyParsed.lifecycleState === "PUBLISHED", "Wrong lifecycleState");
  assert(
    bodyParsed.specificContent["com.linkedin.ugc.ShareContent"].shareCommentary.text === TEST_POST.draftText,
    "Wrong share text",
  );
  assert(bodyParsed.specificContent["com.linkedin.ugc.ShareContent"].shareMediaCategory === "NONE", "Wrong shareMediaCategory");
  assert(bodyParsed.visibility["com.linkedin.ugc.MemberNetworkVisibility"] === "PUBLIC", "Wrong visibility");

  restoreDb();
  console.log("[smoke] OK test 1 passed");
}

async function testUnauthorized401(): Promise<void> {
  console.log("[smoke] test 2: 401 -> LinkedInAuthError after one retry");

  const restoreDb = patchDb(PERSON_URN);
  installFetch([
    makeResponse(401, { message: "Unauthorized" }),
    makeResponse(401, { message: "Unauthorized" }),
  ]);

  const tokensModule = await import("@/lib/linkedin/tokens");
  const origGetToken = tokensModule.getValidAccessToken;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (tokensModule as any).getValidAccessToken = async () => "refreshed-token";

  const { postToLinkedIn, LinkedInAuthError } = await import("./poster");

  let threw = false;
  try {
    await postToLinkedIn(TEST_POST, ACCESS_TOKEN);
  } catch (err) {
    assert(err instanceof LinkedInAuthError, `Expected LinkedInAuthError, got ${String(err)}`);
    threw = true;
  }
  assert(threw, "Expected LinkedInAuthError to be thrown");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (tokensModule as any).getValidAccessToken = origGetToken;
  restoreDb();
  console.log("[smoke] OK test 2 passed");
}

async function test422PostError(): Promise<void> {
  console.log("[smoke] test 3: 422 -> LinkedInPostError with response body");

  const restoreDb = patchDb(PERSON_URN);
  installFetch([makeResponse(422, { message: "Content policy violation", status: 422 })]);

  const { postToLinkedIn, LinkedInPostError } = await import("./poster");

  let threw = false;
  try {
    await postToLinkedIn(TEST_POST, ACCESS_TOKEN);
  } catch (err) {
    assert(err instanceof LinkedInPostError, `Expected LinkedInPostError, got ${String(err)}`);
    assert((err as { status: number }).status === 422, "Wrong status");
    threw = true;
  }
  assert(threw, "Expected LinkedInPostError to be thrown");
  restoreDb();
  console.log("[smoke] OK test 3 passed");
}

async function test500TransientError(): Promise<void> {
  console.log("[smoke] test 4: 500 -> LinkedInTransientError");

  const restoreDb = patchDb(PERSON_URN);
  installFetch([makeResponse(500, { message: "Internal Server Error" })]);

  const { postToLinkedIn, LinkedInTransientError } = await import("./poster");

  let threw = false;
  try {
    await postToLinkedIn(TEST_POST, ACCESS_TOKEN);
  } catch (err) {
    assert(err instanceof LinkedInTransientError, `Expected LinkedInTransientError, got ${String(err)}`);
    assert((err as { status: number }).status === 500, "Wrong status");
    threw = true;
  }
  assert(threw, "Expected LinkedInTransientError to be thrown");
  restoreDb();
  console.log("[smoke] OK test 4 passed");
}

async function testUserinfoFallback(): Promise<void> {
  console.log("[smoke] test 5: URN cache miss -> calls userinfo, caches result");

  const restoreDb = patchDb(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const origUpdate = db.update.bind(db) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (db as any).update = () => ({
    set: () => ({ where: () => Promise.resolve([]) }),
  });

  installFetch([
    makeResponse(200, { sub: "TestPerson123" }),
    makeResponse(201, { id: "urn:li:share:7000000000000002" }),
  ]);

  const { postToLinkedIn } = await import("./poster");
  const result = await postToLinkedIn(TEST_POST, ACCESS_TOKEN);

  assert(result.linkedinPostId === "urn:li:share:7000000000000002", `Wrong URN: ${result.linkedinPostId}`);
  assert(capturedRequests.length === 2, `Expected 2 fetch calls, got ${capturedRequests.length}`);
  assert(capturedRequests[0]!.url === "https://api.linkedin.com/v2/userinfo", "Expected userinfo URL first");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (db as any).update = origUpdate;
  restoreDb();
  console.log("[smoke] OK test 5 passed");
}

// ── Runner ────────────────────────────────────────────────────────────────────

async function runSmoke(): Promise<void> {
  await testHappyPath();
  await testUnauthorized401();
  await test422PostError();
  await test500TransientError();
  await testUserinfoFallback();
  console.log("\n[smoke] all poster smoke tests passed");
}

runSmoke()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("[smoke] poster smoke test failed:", err);
    process.exit(1);
  });
