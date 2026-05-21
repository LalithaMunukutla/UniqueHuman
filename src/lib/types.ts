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
