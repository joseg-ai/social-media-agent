import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { getAllSettings } from "@/lib/settings";
import { db } from "@/db";
import { oauthTokens } from "@/db/schema";
import { SettingsForm } from "./_components/SettingsForm";

// Always server-render — reads live DB state and sits behind the auth gate.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Settings — Social Media Agent",
};

export interface LinkedInStatus {
  connected: boolean;
  /** True if the stored access token has passed its expiry timestamp. */
  expired: boolean;
  expiresAt: string | null;
}

export default async function SettingsPage() {
  const [rawSettings, tokenRows] = await Promise.all([
    getAllSettings(),
    db
      .select({ expiresAt: oauthTokens.expiresAt })
      .from(oauthTokens)
      .where(eq(oauthTokens.provider, "linkedin"))
      .limit(1),
  ]);

  const token = tokenRows[0] ?? null;
  const linkedIn: LinkedInStatus = {
    connected: token !== null,
    expired:
      token !== null &&
      token.expiresAt !== null &&
      token.expiresAt < new Date(),
    expiresAt: token?.expiresAt?.toISOString() ?? null,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          Configure posting behaviour, scoring thresholds, and LinkedIn
          connection.
        </p>
      </div>

      <SettingsForm initialSettings={rawSettings} linkedIn={linkedIn} />
    </div>
  );
}
