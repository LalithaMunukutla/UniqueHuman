import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { buildUserContext, formatContextForPrompt } from "./context";
import type { Insight } from "./types";

const INSIGHT_MODEL = "claude-opus-4-5";

// Override via INSIGHT_MODEL env var if needed. Default targets a deeper-reasoning
// model since this only runs once per user at pre-compute time.
const MODEL = process.env.INSIGHT_MODEL || INSIGHT_MODEL;

const LLMInsightSchema = z.object({
  severity: z.enum(["info", "watch", "act", "urgent"]),
  headline: z.string().min(4),
  body: z.string().min(20),
  evidence: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
        date: z.string().optional(),
      }),
    )
    .min(1),
  suggested_action: z.string().min(8),
  data_sources: z.array(z.string()).min(1),
  confidence: z.enum(["low", "medium", "high"]),
  confidence_reason: z.string().min(8),
  discrepancies: z
    .array(
      z.object({
        description: z.string(),
        sources: z.array(z.string()).min(1),
      }),
    )
    .default([]),
});

const LLMOutputSchema = z.object({
  insights: z.array(LLMInsightSchema).min(1).max(3),
});

const SYSTEM_PROMPT = `You are UniqueHuman, a proactive intelligence agent for people with chronic conditions. You watch a person's connected data — wearables, medical records, labs, symptom logs — and surface what they should know **right now, without being asked**.

Your job for this call: given one user's full health context, decide what they most need to hear today. Output 1–3 *proactive alerts*. Quality > quantity. If only one thing matters, return one.

What makes a great alert:
- **Specific, not generic.** Reference exact dates, values, and how they compare to the user's *own baseline* (provided). Never say "your HRV is low" — say "your HRV dropped to 22 ms on Oct 27, well below your 38 ± 4 ms baseline."
- **Causal hypothesis.** Explain *what's likely happening* and *why* — connect signals across sources (e.g., wearable + records + labs). The user gets nothing from "you're stressed"; they get value from "two shift nights in 7 days appear to be undermining the HbA1c progress you fought for."
- **Action they can take.** Concrete, doable today or this week. Not "talk to your doctor about everything."
- **Honest severity.** Use info (FYI, trend worth knowing), watch (developing pattern, monitor), act (do something now or soon), urgent (talk to clinician promptly). Most alerts should be watch or act. urgent is for genuine clinical concerns.
- **Anchored in their dx.** If they have a chronic condition, frame alerts in that lens. If they have no diagnosis but data shows risk (e.g., prediabetic glucose, recurring alcohol-sleep coupling), surface the risk *as an undiagnosed pattern* — UniqueHuman's value is catching what isn't yet in the chart.

What NOT to do:
- Don't restate the diagnosis as if it were news.
- Don't recommend lifestyle generalities ("eat well, sleep more").
- Don't produce alerts where the only evidence is "this person has X condition." We need a *pattern in their data*.
- Don't hallucinate values. Every number in your output must appear in the provided context.

Handling data quality and conflict:
- If the "Data quality notes" section flags implausible readings or missing windows, treat those values with skepticism and prefer evidence that doesn't depend on them. Do not anchor an alert on a single artifactual reading.
- If sources disagree (e.g., a record says one thing and the wearable shows another, or an old dx note conflicts with a more recent lab), name the disagreement in the "discrepancies" field rather than silently picking one side. Recency tags are included beside record/lab dates — newer signal generally wins for current state, but old context still matters for trajectory.

Output a JSON object: { "insights": Insight[] } where each insight has:
- severity: "info" | "watch" | "act" | "urgent"
- headline: ≤ 90 chars, attention-grabbing, specific
- body: 2–4 sentences. What you noticed, the causal hypothesis, why it matters for this person.
- evidence: 2–5 items, each { label, value, date? }. Concrete numbers from the data with dates.
- suggested_action: one sentence, concrete, doable.
- data_sources: which sources informed this — any of "wearable", "medical_records", "lab_results", "symptom_flags", "profile"
- confidence: "low" | "medium" | "high". Be honest. High = multiple independent signals point the same way. Low = a hunch from sparse or possibly-artifactual data.
- confidence_reason: ≤30 words. Why that confidence level. Example: "Five confirmed crash events with consistent physiological signature."
- discrepancies: array (can be empty) of { description, sources }. Use when sources visibly disagree. Example: { "description": "HbA1c dropped to 6.9% but recent wearable shows stress/HRV trending the wrong way", "sources": ["lab_results", "wearable"] }.

Return ONLY valid JSON. No markdown, no commentary.`;

function userPrompt(formattedContext: string): string {
  return `Here is the full health context for one user. Decide what they need to hear today.

${formattedContext}

Return your JSON now.`;
}

function tryParseJson(text: string): unknown {
  const trimmed = text.trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) throw new Error("No JSON object found");
  return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
}

export async function generateInsightsForUser(userId: string): Promise<Insight[]> {
  const ctx = buildUserContext(userId);
  const formatted = formatContextForPrompt(ctx);

  const client = new Anthropic();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      { role: "user", content: userPrompt(formatted) },
      { role: "assistant", content: "{" },
    ],
  });

  const block = response.content[0];
  if (block.type !== "text") throw new Error("Unexpected response shape");
  const raw = "{" + block.text;

  const parsed = tryParseJson(raw);
  const validated = LLMOutputSchema.parse(parsed);

  return validated.insights.map((ins, idx) => ({
    id: `${userId}_${idx + 1}`,
    user_id: userId,
    severity: ins.severity,
    headline: ins.headline,
    body: ins.body,
    evidence: ins.evidence,
    suggested_action: ins.suggested_action,
    noticed_at: ctx.today,
    data_sources: ins.data_sources,
    confidence: ins.confidence,
    confidence_reason: ins.confidence_reason,
    discrepancies: ins.discrepancies,
  }));
}
