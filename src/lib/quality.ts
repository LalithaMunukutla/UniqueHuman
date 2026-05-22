import type { WearableRow } from "./types";

export type DataQualityNote =
  | { kind: "implausible"; field: string; date: string; value: number; reason: string }
  | { kind: "missing_window"; from: string; to: string; days: number }
  | { kind: "stale_record"; record_date: string; years_ago: number; note: string };

const PLAUSIBLE: Partial<Record<keyof WearableRow, [number, number]>> = {
  resting_hr_bpm: [30, 130],
  hrv_ms: [5, 200],
  spo2_pct: [70, 100],
  sleep_hours: [0, 14],
  sleep_efficiency_pct: [20, 100],
  stress_level: [0, 10],
  steps: [0, 60000],
  exercise_minutes: [0, 360],
};

const RULES_LABEL: Partial<Record<keyof WearableRow, string>> = {
  resting_hr_bpm: "resting HR",
  hrv_ms: "HRV",
  spo2_pct: "SpO2",
  sleep_hours: "sleep hours",
  sleep_efficiency_pct: "sleep efficiency",
  stress_level: "stress",
  steps: "steps",
  exercise_minutes: "exercise minutes",
};

export function scanWearable(rows: WearableRow[]): DataQualityNote[] {
  const notes: DataQualityNote[] = [];

  for (const r of rows) {
    for (const [field, range] of Object.entries(PLAUSIBLE) as [
      keyof WearableRow,
      [number, number],
    ][]) {
      const v = r[field] as number | null;
      if (v === null || v === undefined) continue;
      const [lo, hi] = range;
      if (v < lo || v > hi) {
        notes.push({
          kind: "implausible",
          field: RULES_LABEL[field] ?? String(field),
          date: r.date,
          value: v,
          reason: `outside plausible range [${lo}–${hi}]`,
        });
      }
    }
  }

  // Missing-day detection. Sort by date and look for gaps > 1 day.
  if (rows.length >= 2) {
    const sorted = rows
      .map((r) => r.date)
      .filter(Boolean)
      .sort();
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1] + "T00:00:00Z").getTime();
      const cur = new Date(sorted[i] + "T00:00:00Z").getTime();
      const days = (cur - prev) / (24 * 3600 * 1000);
      if (days > 1.5) {
        notes.push({
          kind: "missing_window",
          from: sorted[i - 1],
          to: sorted[i],
          days: Math.round(days - 1),
        });
      }
    }
  }
  return notes;
}

export function formatQualityNotes(notes: DataQualityNote[]): string {
  if (notes.length === 0) {
    return "No data-quality concerns detected (no implausible values, no missing days).";
  }
  const lines: string[] = [];
  const implausible = notes.filter((n) => n.kind === "implausible");
  const missing = notes.filter((n) => n.kind === "missing_window");

  if (implausible.length) {
    lines.push(
      `- Possibly artifactual readings (${implausible.length}): ` +
        implausible
          .slice(0, 5)
          .map((n) =>
            n.kind === "implausible"
              ? `${n.field} = ${n.value} on ${n.date} (${n.reason})`
              : "",
          )
          .join("; ") +
        (implausible.length > 5 ? ` … +${implausible.length - 5} more` : ""),
    );
  }
  if (missing.length) {
    lines.push(
      `- Missing-data windows (${missing.length}): ` +
        missing
          .slice(0, 5)
          .map((n) =>
            n.kind === "missing_window"
              ? `${n.days}-day gap ${n.from} → ${n.to}`
              : "",
          )
          .join("; "),
    );
  }
  return lines.join("\n");
}

export function recencyTag(dateStr: string, anchorDateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z").getTime();
  const anchor = new Date(anchorDateStr + "T00:00:00Z").getTime();
  if (!Number.isFinite(d) || !Number.isFinite(anchor)) return "";
  const days = Math.floor((anchor - d) / (24 * 3600 * 1000));
  if (days < 0) return " (future)";
  if (days < 30) return ` (${days} days ago)`;
  if (days < 365) return ` (~${Math.round(days / 30)} months ago)`;
  const years = (days / 365).toFixed(1);
  return ` (${years} years ago)`;
}
