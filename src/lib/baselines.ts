import type { Baselines, WearableRow } from "./types";

function stats(nums: number[]): { mean: number; std: number } {
  if (nums.length === 0) return { mean: 0, std: 0 };
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
  return { mean: round(mean), std: round(Math.sqrt(variance)) };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

function pick(rows: WearableRow[], key: keyof WearableRow): number[] {
  return rows
    .map((r) => r[key])
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
}

export function computeBaselines(rows: WearableRow[]): Baselines {
  return {
    resting_hr_bpm: stats(pick(rows, "resting_hr_bpm")),
    hrv_ms: stats(pick(rows, "hrv_ms")),
    sleep_hours: stats(pick(rows, "sleep_hours")),
    sleep_efficiency_pct: stats(pick(rows, "sleep_efficiency_pct")),
    stress_level: stats(pick(rows, "stress_level")),
    steps: stats(pick(rows, "steps")),
    spo2_pct: stats(pick(rows, "spo2_pct")),
  };
}
