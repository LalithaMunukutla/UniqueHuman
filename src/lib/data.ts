import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import type {
  LabPanel,
  LabResults,
  MedicalRecord,
  UserProfile,
  WearableRow,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");

function readJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), "utf8")) as T;
}

function parseNum(v: string | undefined | null): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseStr(v: string | undefined | null): string | null {
  if (v === undefined || v === null || v === "") return null;
  return String(v);
}

let cached: {
  profiles: UserProfile[];
  records: MedicalRecord[];
  labs: LabResults[];
  wearable: WearableRow[];
} | null = null;

export function loadAll() {
  if (cached) return cached;

  const profiles = readJson<{ users: UserProfile[] }>("user_profiles.json").users;
  const records = readJson<{ medical_records: MedicalRecord[] }>(
    "medical_records.json",
  ).medical_records;
  const labs = readJson<{ lab_results: LabResults[] }>("lab_results.json").lab_results;

  const csvText = fs.readFileSync(path.join(DATA_DIR, "wearable_data.csv"), "utf8");
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const wearable: WearableRow[] = parsed.data.map((r) => ({
    user_id: r.user_id,
    date: r.date,
    steps: parseNum(r.steps),
    resting_hr_bpm: parseNum(r.resting_hr_bpm),
    max_hr_bpm: parseNum(r.max_hr_bpm),
    hrv_ms: parseNum(r.hrv_ms),
    spo2_pct: parseNum(r.spo2_pct),
    sleep_hours: parseNum(r.sleep_hours),
    sleep_efficiency_pct: parseNum(r.sleep_efficiency_pct),
    deep_sleep_hours: parseNum(r.deep_sleep_hours),
    rem_sleep_hours: parseNum(r.rem_sleep_hours),
    awakenings: parseNum(r.awakenings),
    active_calories: parseNum(r.active_calories),
    exercise_minutes: parseNum(r.exercise_minutes),
    stress_level: parseNum(r.stress_level),
    weight_lbs: parseNum(r.weight_lbs),
    wrist_temp_f: parseNum(r.wrist_temp_f),
    cpap_used: parseStr(r.cpap_used),
    cpap_hours: parseNum(r.cpap_hours),
    rescue_inhaler_used: parseStr(r.rescue_inhaler_used),
    aqi: parseNum(r.aqi),
    symptom_flag: parseStr(r.symptom_flag),
  }));

  cached = { profiles, records, labs, wearable };
  return cached;
}

export function getUserProfiles(): UserProfile[] {
  return loadAll().profiles;
}

export function getUserProfile(userId: string): UserProfile | undefined {
  return loadAll().profiles.find((p) => p.id === userId);
}

export function getRecordsFor(userId: string): MedicalRecord[] {
  return loadAll()
    .records.filter((r) => r.user_id === userId)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function getLabsFor(userId: string): LabPanel[] {
  const block = loadAll().labs.find((l) => l.user_id === userId);
  return block ? block.results.slice().sort((a, b) => a.date.localeCompare(b.date)) : [];
}

export function getWearableFor(userId: string): WearableRow[] {
  return loadAll()
    .wearable.filter((w) => w.user_id === userId)
    .sort((a, b) => a.date.localeCompare(b.date));
}
