/**
 * Home — minimal placeholder dashboard.
 * Full dashboard UI is WI-14 (Trinity). The LinkedIn card here is the
 * minimal affordance from WI-19; full settings UI is WI-23.
 *
 * LinkedIn status is shown via the `linkedin` query param set by the
 * callback/disconnect redirects. Real-time connected/disconnected state
 * lives in WI-23 (settings page).
 */
import { type SearchParams } from "next/dist/server/request/search-params";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const linkedinStatus = typeof params.linkedin === "string" ? params.linkedin : null;

  return (
    <main className="min-h-screen p-8 font-sans">
      <h1 className="text-2xl font-semibold mb-6">social-media-agent</h1>

      {/* LinkedIn connection status — minimal affordance (full UI: WI-23) */}
      <section className="border rounded-lg p-6 max-w-sm">
        <h2 className="font-medium mb-1">LinkedIn</h2>

        {linkedinStatus === "connected" && (
          <p className="text-sm text-green-600 mb-3">Connected successfully.</p>
        )}
        {linkedinStatus === "disconnected" && (
          <p className="text-sm text-gray-500 mb-3">Disconnected.</p>
        )}
        {linkedinStatus === "denied" && (
          <p className="text-sm text-yellow-600 mb-3">Authorization denied.</p>
        )}
        {linkedinStatus === "error" && (
          <p className="text-sm text-red-600 mb-3">Something went wrong. Try again.</p>
        )}

        <div className="flex gap-3">
          <a
            href="/api/linkedin/auth"
            className="text-sm px-4 py-2 border rounded hover:bg-gray-50 inline-block"
          >
            Connect LinkedIn
          </a>
          <form action="/api/linkedin/disconnect" method="POST" className="inline">
            <button
              type="submit"
              className="text-sm px-4 py-2 border rounded hover:bg-gray-50"
            >
              Disconnect
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}