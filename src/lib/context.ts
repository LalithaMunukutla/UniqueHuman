import {
  getLabsFor,
  getRecordsFor,
  getUserProfile,
  getWearableFor,
} from "./data";
import { computeBaselines } from "./baselines";
import type { UserContext, WearableRow } from "./types";

const RECENT_DAYS = 30;

export function buildUserContext(userId: string): UserContext {
  const profile = getUserProfile(userId);
  if (!profile) throw new Error(`Unknown user: ${userId}`);

  const records = getRecordsFor(userId);
  const labs = getLabsFor(userId);
  const wearable = getWearableFor(userId);

  const today = wearable.at(-1)?.date ?? new Date().toISOString().slice(0, 10);
  const wearable_recent = wearable.slice(-RECENT_DAYS);

  const symptom_flag_events = wearable
    .filter((w) => w.symptom_flag && w.symptom_flag.trim() !== "")
    .map((w) => ({ date: w.date, flag: w.symptom_flag as string }));

  const baselines = computeBaselines(wearable);

  return {
    profile,
    records,
    labs,
    wearable_recent,
    wearable_all_count: wearable.length,
    symptom_flag_events,
    baselines,
    today,
  };
}

export function formatWearableRowsAsTable(rows: WearableRow[]): string {
  const header = [
    "date",
    "steps",
    "rest_hr",
    "hrv",
    "spo2",
    "sleep_h",
    "sleep_eff",
    "awake",
    "stress",
    "exer_min",
    "aqi",
    "cpap_used",
    "cpap_h",
    "inhaler",
    "symptom_flag",
  ].join(" | ");

  const body = rows
    .map((r) =>
      [
        r.date,
        r.steps ?? "",
        r.resting_hr_bpm ?? "",
        r.hrv_ms ?? "",
        r.spo2_pct ?? "",
        r.sleep_hours ?? "",
        r.sleep_efficiency_pct ?? "",
        r.awakenings ?? "",
        r.stress_level ?? "",
        r.exercise_minutes ?? "",
        r.aqi ?? "",
        r.cpap_used ?? "",
        r.cpap_hours ?? "",
        r.rescue_inhaler_used ?? "",
        r.symptom_flag ?? "",
      ].join(" | "),
    )
    .join("\n");

  return `${header}\n${body}`;
}

export function formatContextForPrompt(ctx: UserContext): string {
  const { profile, records, labs, wearable_recent, baselines, symptom_flag_events, today } = ctx;

  const profileBlock = `## Profile
- id: ${profile.id}
- name: ${profile.name}
- age/sex: ${profile.age} / ${profile.sex}
- primary condition: ${profile.condition ?? "none reported"}
- current medications: ${profile.medications.length ? profile.medications.join("; ") : "none"}
- known triggers: ${profile.known_triggers.length ? profile.known_triggers.join("; ") : "none reported"}`;

  const recordsBlock = `## Medical records (chronological)
${
    records.length
      ? records
          .map(
            (r) =>
              `- ${r.date} | ${r.visit_type} | ${r.provider.specialty} (${r.provider.name})
  complaint: ${r.chief_complaint}
  vitals: BP ${r.vitals.bp ?? "—"}, HR ${r.vitals.hr ?? "—"}, weight ${r.vitals.weight_lbs ?? "—"} lbs, SpO2 ${r.vitals.spo2_pct ?? "—"}%
  diagnoses: ${r.diagnoses.join("; ")}
  assessment: ${r.assessment}
  plan: ${r.plan}
  medications: ${r.medications.map((m) => `${m.action} ${m.name} ${m.dose ?? ""} (${m.instructions ?? ""})`).join(" | ") || "—"}`,
          )
          .join("\n")
      : "  (no records)"
  }`;

  const labsBlock = `## Lab results
${
    labs.length
      ? labs
          .map(
            (l) =>
              `- ${l.date} | ${l.panel} (ordered by ${l.ordered_by})
${l.tests
  .map(
    (t) =>
      `    ${t.name}: ${t.value} ${t.unit} [${t.interpretation}${t.flag ? ` ${t.flag}` : ""}, ref ${t.reference_range}]`,
  )
  .join("\n")}`,
          )
          .join("\n")
      : "  (no labs available)"
  }`;

  const baselinesBlock = `## Personal baselines (computed from all wearable history, ${ctx.wearable_all_count} days)
- resting HR:        ${baselines.resting_hr_bpm.mean} ± ${baselines.resting_hr_bpm.std} bpm
- HRV:               ${baselines.hrv_ms.mean} ± ${baselines.hrv_ms.std} ms
- sleep:             ${baselines.sleep_hours.mean} ± ${baselines.sleep_hours.std} h
- sleep efficiency:  ${baselines.sleep_efficiency_pct.mean} ± ${baselines.sleep_efficiency_pct.std} %
- stress:            ${baselines.stress_level.mean} ± ${baselines.stress_level.std} /10
- steps:             ${Math.round(baselines.steps.mean)} ± ${Math.round(baselines.steps.std)}
- SpO2:              ${baselines.spo2_pct.mean} ± ${baselines.spo2_pct.std} %`;

  const symptomBlock = `## Symptom flag events (clinician-style labels in wearable stream)
${symptom_flag_events.length ? symptom_flag_events.map((e) => `- ${e.date}: ${e.flag}`).join("\n") : "  (none flagged)"}`;

  const wearableBlock = `## Recent wearable data (last ${wearable_recent.length} days)
${formatWearableRowsAsTable(wearable_recent)}`;

  return [
    `# UniqueHuman context for ${profile.name} (${profile.id})`,
    `Anchor date ("today"): ${today}`,
    profileBlock,
    recordsBlock,
    labsBlock,
    baselinesBlock,
    symptomBlock,
    wearableBlock,
  ].join("\n\n");
}
