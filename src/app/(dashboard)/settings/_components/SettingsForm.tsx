"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LinkedInStatus } from "../page";

// ── Types ──────────────────────────────────────────────────────────────────────

interface PostingWindows {
  days: number[];
  startHour: number;
  endHour: number;
  tz: string;
}

interface FormValues {
  max_posts_per_day: number;
  min_gap_hours: number;
  jitter_minutes: number;
  posting_windows: PostingWindows;
  relevance_threshold: number;
}

interface Props {
  initialSettings: Record<string, unknown>;
  linkedIn: LinkedInStatus;
}

// ── Defaults ───────────────────────────────────────────────────────────────────

const DEFAULTS: FormValues = {
  max_posts_per_day: 1,
  min_gap_hours: 20,
  jitter_minutes: 30,
  posting_windows: {
    days: [1, 2, 3, 4, 5],
    startHour: 9,
    endHour: 17,
    tz: "UTC",
  },
  relevance_threshold: 70,
};

/**
 * Curated timezone list for the tz <select>.
 * Full Intl.supportedValuesOf('timeZone') returns ~600 entries; this curated
 * list covers the most common zones. Operators needing an unlisted zone can
 * edit the DB row directly.
 * Decision: see .squad/decisions/inbox/trinity-wi-23-settings-ui.md
 */
const COMMON_TZ = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Vancouver",
  "America/Toronto",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
  "Pacific/Auckland",
];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── Helpers ────────────────────────────────────────────────────────────────────

function toInt(raw: unknown, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function parsePostingWindows(raw: unknown): PostingWindows {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    return {
      days: Array.isArray(obj.days)
        ? (obj.days as number[])
        : DEFAULTS.posting_windows.days,
      startHour: toInt(obj.startHour, DEFAULTS.posting_windows.startHour),
      endHour: toInt(obj.endHour, DEFAULTS.posting_windows.endHour),
      tz:
        typeof obj.tz === "string" ? obj.tz : DEFAULTS.posting_windows.tz,
    };
  }
  return DEFAULTS.posting_windows;
}

function initValues(raw: Record<string, unknown>): FormValues {
  return {
    max_posts_per_day: toInt(raw.max_posts_per_day, DEFAULTS.max_posts_per_day),
    min_gap_hours: toInt(raw.min_gap_hours, DEFAULTS.min_gap_hours),
    jitter_minutes: toInt(raw.jitter_minutes, DEFAULTS.jitter_minutes),
    posting_windows: parsePostingWindows(raw.posting_windows),
    relevance_threshold: toInt(
      raw.relevance_threshold,
      DEFAULTS.relevance_threshold,
    ),
  };
}

/** Returns only the keys whose values have changed from the initial snapshot. */
function diffValues(
  current: FormValues,
  initial: FormValues,
): Partial<FormValues> {
  const patch: Partial<FormValues> = {};

  (
    [
      "max_posts_per_day",
      "min_gap_hours",
      "jitter_minutes",
      "relevance_threshold",
    ] as const
  ).forEach((k) => {
    if (current[k] !== initial[k]) patch[k] = current[k];
  });

  if (
    JSON.stringify(current.posting_windows) !==
    JSON.stringify(initial.posting_windows)
  ) {
    patch.posting_windows = current.posting_windows;
  }

  return patch;
}

// ── Shared style constants ────────────────────────────────────────────────────

const INPUT_CLASS =
  "rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus:border-transparent";

const LABEL_CLASS = "block text-sm font-medium mb-1.5";

// ── Component ─────────────────────────────────────────────────────────────────

export function SettingsForm({ initialSettings, linkedIn }: Props) {
  const router = useRouter();
  const initial = initValues(initialSettings);
  const [values, setValues] = useState<FormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [disconnecting, setDisconnecting] = useState(false);
  const [linkedInError, setLinkedInError] = useState<string | null>(null);
  const [linkedInStatus, setLinkedInStatus] = useState(linkedIn);

  const dirty = Object.keys(diffValues(values, initial)).length > 0;

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function setNum(key: keyof Omit<FormValues, "posting_windows">, raw: string) {
    const n = parseInt(raw, 10);
    if (!isNaN(n)) {
      setValues((v) => ({ ...v, [key]: n }));
      setSaveSuccess(false);
    }
  }

  function setWindow<K extends keyof PostingWindows>(
    key: K,
    val: PostingWindows[K],
  ) {
    setValues((v) => ({
      ...v,
      posting_windows: { ...v.posting_windows, [key]: val },
    }));
    setSaveSuccess(false);
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  async function handleSave() {
    const patch = diffValues(values, initial);
    if (Object.keys(patch).length === 0) return;

    setSaving(true);
    setApiError(null);
    setFieldErrors({});
    setSaveSuccess(false);

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      if (res.ok) {
        setSaveSuccess(true);
        router.refresh();
        return;
      }

      const data = (await res.json()) as {
        error?: string;
        issues?: { path: (string | number)[]; message: string }[];
      };

      if (res.status === 400 && data.issues) {
        const errs: Record<string, string> = {};
        for (const issue of data.issues) {
          const key = issue.path.join(".");
          errs[key] = issue.message;
        }
        setFieldErrors(errs);
      } else {
        setApiError(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setApiError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // ── LinkedIn disconnect ───────────────────────────────────────────────────────

  async function handleDisconnect() {
    setDisconnecting(true);
    setLinkedInError(null);

    try {
      const res = await fetch("/api/linkedin/disconnect", {
        method: "POST",
        credentials: "include",
      });

      const finalUrl = res.url ? new URL(res.url) : null;
      const status = finalUrl?.searchParams.get("linkedin");

      if (status === "disconnected" || (res.ok && status !== "error")) {
        setLinkedInStatus({ connected: false, expired: false, expiresAt: null });
        router.refresh();
      } else {
        setLinkedInError("Disconnect failed. Please try again.");
      }
    } catch {
      setLinkedInError("Network error. Please try again.");
    } finally {
      setDisconnecting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* ── Posting Cadence ─────────────────────────────────────────────────── */}
      <Section
        title="Posting cadence"
        description="How often the agent is allowed to post."
      >
        <div className="grid gap-6 sm:grid-cols-3">
          <Field
            label="Max posts / day"
            hint="1 – 10"
            error={fieldErrors["max_posts_per_day"]}
          >
            <input
              type="number"
              min={1}
              max={10}
              className={INPUT_CLASS + " w-full"}
              value={values.max_posts_per_day}
              onChange={(e) => setNum("max_posts_per_day", e.target.value)}
            />
          </Field>

          <Field
            label="Min gap (hours)"
            hint="0 – 168"
            error={fieldErrors["min_gap_hours"]}
          >
            <input
              type="number"
              min={0}
              max={168}
              className={INPUT_CLASS + " w-full"}
              value={values.min_gap_hours}
              onChange={(e) => setNum("min_gap_hours", e.target.value)}
            />
          </Field>

          <Field
            label="Jitter (minutes)"
            hint="0 – 60"
            error={fieldErrors["jitter_minutes"]}
          >
            <input
              type="number"
              min={0}
              max={60}
              className={INPUT_CLASS + " w-full"}
              value={values.jitter_minutes}
              onChange={(e) => setNum("jitter_minutes", e.target.value)}
            />
          </Field>
        </div>
      </Section>

      {/* ── Posting Windows ─────────────────────────────────────────────────── */}
      <Section
        title="Posting window"
        description="Days and hours (UTC) during which the agent may publish."
      >
        <div className="space-y-5">
          {/* Days */}
          <div>
            <p className={LABEL_CLASS}>Allowed days</p>
            <div className="flex flex-wrap gap-3">
              {DAY_LABELS.map((label, idx) => {
                const checked = values.posting_windows.days.includes(idx);
                return (
                  <label
                    key={idx}
                    className="flex items-center gap-1.5 cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                      checked={checked}
                      onChange={() => {
                        const next = checked
                          ? values.posting_windows.days.filter(
                              (d) => d !== idx,
                            )
                          : [
                              ...values.posting_windows.days,
                              idx,
                            ].sort((a, b) => a - b);
                        setWindow("days", next);
                      }}
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                );
              })}
            </div>
            {fieldErrors["posting_windows.days"] && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {fieldErrors["posting_windows.days"]}
              </p>
            )}
          </div>

          {/* Hours + TZ */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Start hour (UTC)"
              hint="0 – 23"
              error={fieldErrors["posting_windows.startHour"]}
            >
              <select
                className={INPUT_CLASS + " w-full"}
                value={values.posting_windows.startHour}
                onChange={(e) =>
                  setWindow("startHour", parseInt(e.target.value, 10))
                }
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="End hour (UTC)"
              hint="0 – 23, exclusive"
              error={fieldErrors["posting_windows.endHour"]}
            >
              <select
                className={INPUT_CLASS + " w-full"}
                value={values.posting_windows.endHour}
                onChange={(e) =>
                  setWindow("endHour", parseInt(e.target.value, 10))
                }
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Time zone label"
              hint="Informational — comparisons use UTC"
              error={fieldErrors["posting_windows.tz"]}
            >
              <select
                className={INPUT_CLASS + " w-full"}
                value={values.posting_windows.tz}
                onChange={(e) => setWindow("tz", e.target.value)}
              >
                {COMMON_TZ.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      </Section>

      {/* ── Relevance Threshold ──────────────────────────────────────────────── */}
      <Section
        title="Relevance threshold"
        description="Articles scoring below this value are rejected and will not be drafted."
      >
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              className="flex-1 accent-blue-600"
              value={values.relevance_threshold}
              onChange={(e) => {
                setValues((v) => ({
                  ...v,
                  relevance_threshold: parseInt(e.target.value, 10),
                }));
                setSaveSuccess(false);
              }}
            />
            <span className="w-12 text-right tabular-nums font-medium">
              {values.relevance_threshold}
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Range 0 – 100. DB setting overrides the{" "}
            <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">
              RELEVANCE_THRESHOLD
            </code>{" "}
            environment variable when set.
          </p>
          {fieldErrors["relevance_threshold"] && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {fieldErrors["relevance_threshold"]}
            </p>
          )}
        </div>
      </Section>

      {/* ── Save bar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>

        {saveSuccess && (
          <p role="status" className="text-sm text-green-600 dark:text-green-400">
            ✓ Settings saved
          </p>
        )}

        {apiError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {apiError}
          </p>
        )}
      </div>

      {/* ── LinkedIn Account ─────────────────────────────────────────────────── */}
      <Section
        title="LinkedIn account"
        description="Connect your LinkedIn account to allow the agent to post on your behalf."
      >
        <div className="space-y-4">
          {/* Status badge */}
          <div className="flex items-center gap-3">
            <span
              className={
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium " +
                (linkedInStatus.connected && !linkedInStatus.expired
                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                  : linkedInStatus.connected && linkedInStatus.expired
                    ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                    : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400")
              }
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
              {linkedInStatus.connected && !linkedInStatus.expired
                ? "Connected"
                : linkedInStatus.connected && linkedInStatus.expired
                  ? "Token expired"
                  : "Not connected"}
            </span>

            {linkedInStatus.expiresAt && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {linkedInStatus.expired ? "Expired" : "Expires"}{" "}
                {new Date(linkedInStatus.expiresAt).toLocaleDateString()}
              </span>
            )}
          </div>

          {/* Action button */}
          <div className="flex items-center gap-3 flex-wrap">
            {!linkedInStatus.connected || linkedInStatus.expired ? (
              <a
                href="/api/linkedin/auth"
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors"
              >
                {linkedInStatus.expired
                  ? "Reconnect LinkedIn"
                  : "Connect LinkedIn"}
              </a>
            ) : (
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="rounded-lg border border-red-300 dark:border-red-700 px-4 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {disconnecting ? "Disconnecting…" : "Disconnect"}
              </button>
            )}
          </div>

          {linkedInError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {linkedInError}
            </p>
          )}
        </div>
      </Section>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && (
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            {description}
          </p>
        )}
      </div>
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        {children}
      </div>
    </section>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className={LABEL_CLASS}>{label}</label>
      {children}
      {hint && !error && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p>
      )}
      {error && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
