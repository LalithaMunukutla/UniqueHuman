import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { buildUserContext, formatContextForPrompt } from "./context";
import type { Insight, Plan, PlanCheckIn } from "./types";

const PLAN_MODEL = process.env.CHAT_MODEL || "claude-sonnet-4-5";
const PLANS_PATH = path.join(process.cwd(), "cache", "plans.json");

const LLMPlanSchema = z.object({
  title: z.string().min(4),
  duration_days: z.number().int().min(1).max(90),
  rationale: z.string().min(20),
  tasks: z
    .array(z.object({ description: z.string(), cadence: z.string() }))
    .min(2)
    .max(5),
  success_metric: z.object({
    description: z.string(),
    target: z.string().optional(),
  }),
  daily_check_in_prompt: z.string().min(8),
});

const CheckInSchema = z.object({
  verdict: z.enum(["on_track", "off_track", "mixed", "too_early"]),
  body: z.string().min(20),
});

function tryParseJson(text: string): unknown {
  const trimmed = text.trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) throw new Error("No JSON object found");
  return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
}

function loadAllPlans(): { by_user: Record<string, Plan[]> } {
  if (!fs.existsSync(PLANS_PATH)) return { by_user: {} };
  return JSON.parse(fs.readFileSync(PLANS_PATH, "utf8"));
}

function saveAllPlans(data: { by_user: Record<string, Plan[]> }) {
  fs.mkdirSync(path.dirname(PLANS_PATH), { recursive: true });
  fs.writeFileSync(PLANS_PATH, JSON.stringify(data, null, 2));
}

export function getPlansFor(userId: string): Plan[] {
  return loadAllPlans().by_user[userId] ?? [];
}

export function getPlan(userId: string, planId: string): Plan | null {
  return getPlansFor(userId).find((p) => p.id === planId) ?? null;
}

function appendPlan(plan: Plan) {
  const all = loadAllPlans();
  all.by_user[plan.user_id] = [plan, ...(all.by_user[plan.user_id] ?? [])];
  saveAllPlans(all);
}

function appendCheckIn(userId: string, planId: string, ci: PlanCheckIn) {
  const all = loadAllPlans();
  const list = all.by_user[userId] ?? [];
  const idx = list.findIndex((p) => p.id === planId);
  if (idx === -1) throw new Error(`Plan ${planId} not found`);
  list[idx] = { ...list[idx], check_ins: [...list[idx].check_ins, ci] };
  all.by_user[userId] = list;
  saveAllPlans(all);
}

const PLAN_SYSTEM_PROMPT = `You are UniqueHuman, helping a person with a chronic condition turn one of your proactive alerts into a structured short-term plan they can actually execute.

You will be given the user's full health context and one specific alert (with its suggested action). Generate a concrete, time-boxed plan tailored to this person.

What makes a great plan:
- **Time-boxed.** 7, 14, or 21 days typically. Long enough to see signal, short enough to feel doable.
- **Specific tasks.** Each task names *what* and *when* — "Cap exercise minutes at 15 on weekdays" beats "exercise less."
- **A measurable success metric.** Something that can be checked against the wearable or labs. "HRV stays ≥ 28ms on at least 5 of 7 days" beats "feel better."
- **A daily check-in prompt.** A single short question the user could be asked each day to self-rate adherence. E.g., "Did you stay under your activity ceiling today?"
- **Honest scope.** Don't promise the moon. If the alert is mild, the plan should be light.

Output ONLY valid JSON matching this schema:
{
  "title": "string (≤60 chars, action-oriented, e.g. '14-day PEM pacing protocol')",
  "duration_days": integer 1-90,
  "rationale": "string, 2-3 sentences explaining *why this plan, for this person, right now*, grounded in their specific data",
  "tasks": [
    { "description": "string", "cadence": "daily | weekdays | every other day | weekly | by end of week | etc." }
  ],
  "success_metric": {
    "description": "string, what we're tracking",
    "target": "string, optional concrete target (e.g. 'HRV ≥ 28ms on 5 of 7 days')"
  },
  "daily_check_in_prompt": "string, one short question"
}

No markdown, no commentary. JSON only.`;

const CHECK_IN_SYSTEM_PROMPT = `You are UniqueHuman, giving the user a calibrated progress update on a plan they committed to. You have full access to their context and the plan.

Your job: look at the last ~7 days of their wearable data against the plan's success metric, and write a short progress note (2-4 sentences).

Tone: warm, direct, evidence-based. Cite specific numbers and dates. Never invent values.

Output ONLY valid JSON:
{
  "verdict": "on_track" | "off_track" | "mixed" | "too_early",
  "body": "string, 2-4 sentences. Lead with the bottom-line read, then the evidence, then optionally one specific next step."
}

Use "too_early" only if there genuinely isn't enough post-start data (e.g., plan started today).
No markdown, no commentary, JSON only.`;

export async function generatePlanFromAlert(
  userId: string,
  alert: Insight,
): Promise<Plan> {
  const ctx = buildUserContext(userId);
  const formatted = formatContextForPrompt(ctx);

  const client = new Anthropic();
  const response = await client.messages.create({
    model: PLAN_MODEL,
    max_tokens: 1024,
    system: PLAN_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `User context:

${formatted}

# The alert this plan is built from

Severity: ${alert.severity}
Headline: ${alert.headline}
Body: ${alert.body}
Evidence: ${alert.evidence.map((e) => `${e.label}: ${e.value}${e.date ? ` (${e.date})` : ""}`).join("; ")}
Suggested action: ${alert.suggested_action}

Generate the JSON plan now.`,
      },
      { role: "assistant", content: "{" },
    ],
  });

  const block = response.content[0];
  if (block.type !== "text") throw new Error("Unexpected response shape");
  const parsed = tryParseJson("{" + block.text);
  const validated = LLMPlanSchema.parse(parsed);

  const plan: Plan = {
    id: `plan_${userId}_${Date.now()}`,
    user_id: userId,
    alert_id: alert.id,
    source_alert_headline: alert.headline,
    title: validated.title,
    duration_days: validated.duration_days,
    rationale: validated.rationale,
    tasks: validated.tasks,
    success_metric: validated.success_metric,
    daily_check_in_prompt: validated.daily_check_in_prompt,
    created_at: ctx.today,
    check_ins: [],
  };
  appendPlan(plan);
  return plan;
}

export async function checkInOnPlan(
  userId: string,
  planId: string,
): Promise<PlanCheckIn> {
  const ctx = buildUserContext(userId);
  const plan = getPlan(userId, planId);
  if (!plan) throw new Error(`Plan ${planId} not found`);
  const formatted = formatContextForPrompt(ctx);

  const client = new Anthropic();
  const response = await client.messages.create({
    model: PLAN_MODEL,
    max_tokens: 600,
    system: CHECK_IN_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `User context:

${formatted}

# The plan being checked

Title: ${plan.title}
Started: ${plan.created_at}
Duration: ${plan.duration_days} days
Rationale: ${plan.rationale}
Tasks:
${plan.tasks.map((t) => `- ${t.description} (${t.cadence})`).join("\n")}
Success metric: ${plan.success_metric.description}${plan.success_metric.target ? ` — target: ${plan.success_metric.target}` : ""}

Note: the wearable data anchor date ("today") is ${ctx.today}. The plan was started on ${plan.created_at}. If the plan just started, you can still give the user a useful read on their pre-plan baseline (the last ~7 days of data) against the success metric — frame it as "where you're starting from."

Generate the JSON check-in now.`,
      },
      { role: "assistant", content: "{" },
    ],
  });

  const block = response.content[0];
  if (block.type !== "text") throw new Error("Unexpected response shape");
  const parsed = tryParseJson("{" + block.text);
  const validated = CheckInSchema.parse(parsed);

  const ci: PlanCheckIn = {
    at: new Date().toISOString(),
    body: validated.body,
    verdict: validated.verdict,
  };
  appendCheckIn(userId, planId, ci);
  return ci;
}
