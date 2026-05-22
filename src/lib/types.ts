export type UserProfile = {
  id: string;
  name: string;
  age: number;
  sex: "male" | "female" | string;
  condition: string | null;
  medications: string[];
  known_triggers: string[];
};

export type Vitals = {
  bp?: string;
  hr?: number;
  weight_lbs?: number;
  temp_f?: number;
  spo2_pct?: number;
};

export type MedicationEntry = {
  action: string;
  name: string;
  dose?: string;
  instructions?: string;
};

export type MedicalRecord = {
  record_id: string;
  user_id: string;
  date: string;
  visit_type: string;
  provider: { name: string; specialty: string };
  chief_complaint: string;
  vitals: Vitals;
  assessment: string;
  diagnoses: string[];
  medications: MedicationEntry[];
  lab_orders: string[];
  plan: string;
  follow_up?: string;
};

export type LabTest = {
  name: string;
  value: number | string;
  unit: string;
  reference_range: string;
  interpretation: string;
  flag: string | null;
};

export type LabPanel = {
  lab_id: string;
  date: string;
  ordered_by: string;
  panel: string;
  tests: LabTest[];
};

export type LabResults = {
  user_id: string;
  results: LabPanel[];
};

export type WearableRow = {
  user_id: string;
  date: string;
  steps: number | null;
  resting_hr_bpm: number | null;
  max_hr_bpm: number | null;
  hrv_ms: number | null;
  spo2_pct: number | null;
  sleep_hours: number | null;
  sleep_efficiency_pct: number | null;
  deep_sleep_hours: number | null;
  rem_sleep_hours: number | null;
  awakenings: number | null;
  active_calories: number | null;
  exercise_minutes: number | null;
  stress_level: number | null;
  weight_lbs: number | null;
  wrist_temp_f: number | null;
  cpap_used: string | null;
  cpap_hours: number | null;
  rescue_inhaler_used: string | null;
  aqi: number | null;
  symptom_flag: string | null;
};

export type Baselines = {
  resting_hr_bpm: { mean: number; std: number };
  hrv_ms: { mean: number; std: number };
  sleep_hours: { mean: number; std: number };
  sleep_efficiency_pct: { mean: number; std: number };
  stress_level: { mean: number; std: number };
  steps: { mean: number; std: number };
  spo2_pct: { mean: number; std: number };
};

export type Severity = "info" | "watch" | "act" | "urgent";

export type RiskLevel = "low" | "watch" | "elevated" | "high";

export type ForecastDay = {
  date: string;
  day_label: string;
  risk: RiskLevel;
  one_liner: string;
  drivers: string[];
};

export type Forecast = {
  user_id: string;
  generated_for: string;
  summary: string;
  watch_for: string[];
  days: ForecastDay[];
};

export type Confidence = "low" | "medium" | "high";

export type Discrepancy = {
  description: string;
  sources: string[];
};

export type Insight = {
  id: string;
  user_id: string;
  severity: Severity;
  headline: string;
  body: string;
  evidence: { label: string; value: string; date?: string }[];
  suggested_action: string;
  noticed_at: string;
  data_sources: string[];
  confidence?: Confidence;
  confidence_reason?: string;
  discrepancies?: Discrepancy[];
};

export type PlanTask = {
  description: string;
  cadence: string;
};

export type PlanSuccessMetric = {
  description: string;
  target?: string;
};

export type Plan = {
  id: string;
  user_id: string;
  alert_id: string;
  source_alert_headline: string;
  title: string;
  duration_days: number;
  rationale: string;
  tasks: PlanTask[];
  success_metric: PlanSuccessMetric;
  daily_check_in_prompt: string;
  created_at: string;
  check_ins: PlanCheckIn[];
};

export type PlanCheckIn = {
  at: string;
  body: string;
  verdict: "on_track" | "off_track" | "mixed" | "too_early";
};

export type UserContext = {
  profile: UserProfile;
  records: MedicalRecord[];
  labs: LabPanel[];
  wearable_recent: WearableRow[];
  wearable_all_count: number;
  symptom_flag_events: { date: string; flag: string }[];
  baselines: Baselines;
  today: string;
};
