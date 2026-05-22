import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { buildUserContext, formatContextForPrompt } from "./context";
import type { Forecast } from "./types";

const FORECAST_MODEL = process.env.FORECAST_MODEL || "claude-opus-4-5";

const LLMForecastSchema = z.object({
  summary: z.string().min(20),
  watch_for: z.array(z.string()).min(1).max(4),
  days: z
    .array(
      z.object({
        date: z.string(),
        day_label: z.string(),
        risk: z.enum(["low", "watch", "elevated", "high"]),
        one_liner: z.string().min(8),
        drivers: z.array(z.string()).min(1).max(4),
      }),
    )
    .length(7),
});

const SYSTEM_PROMPT = `You are UniqueHuman, projecting the next 7 days for one person with a chronic condition based on patterns visible in their data.

You will be given the user's full health context including 90 days of wearable data, medical records, labs, and any cyclical patterns. Generate a forward-looking 7-day risk forecast.

What "risk" means here: the likelihood of a symptomatic event or destabilization in their condition over each of the next 7 days, given their patterns. Not abstract risk — the *specific kind of thing this person gets in trouble with*. For Priya (ME/CFS), that's PEM crashes. For Marcus (T2D), glucose dysregulation. For Sarah (migraine), an attack. For Carlos (no diagnosis), the recurring alcohol-sleep coupling.

What makes a great forecast:
- **Anchored in their patterns.** If the user has a 14-day PEM rhythm with crashes on Aug 9 / 23 / Sep 8 / 24 / Oct 12, the next one lands Oct 26±2. Say that.
- **Calibrated levels.** Most days should be "low" or "watch". "high" should be reserved for days where multiple drivers stack (e.g., predicted cycle window + currently-elevated baseline). Don't cry wolf.
- **Specific drivers.** Each day lists 1-4 reasons that contribute to its level (e.g., "Day 12 of stable stretch", "Recent HRV trending down", "Two shift nights this week — known glucose disruptor").
- **No invented data.** If you don't have a basis for a prediction, say "low" with reason "no specific destabilizing pattern in this window."
- **Watch-for items** are 1-4 things the user should keep an eye on this week (e.g., "HRV dropping below 28ms two mornings in a row → preempt crash"). Distinct from the per-day forecast.

The anchor date is provided in the context. Generate forecasts for the 7 days *after* the anchor (anchor+1 through anchor+7). Use day labels like "Wed Oct 30", "Thu Oct 31", etc.

Output ONLY valid JSON:
{
  "summary": "string, 2-3 sentences — the high-level read on the week",
  "watch_for": ["string", ...],
  "days": [
    {
      "date": "YYYY-MM-DD",
      "day_label": "string like 'Wed Oct 30'",
      "risk": "low | watch | elevated | high",
      "one_liner": "string — one sentence summary",
      "drivers": ["string", ...]
    },
    ... 7 of these
  ]
}

No markdown, no commentary. JSON only.`;

function tryParseJson(text: string): unknown {
  const trimmed = text.trim();
  const f = trimmed.indexOf("{");
  const l = trimmed.lastIndexOf("}");
  if (f === -1 || l === -1) throw new Error("No JSON object found");
  return JSON.parse(trimmed.slice(f, l + 1));
}

export async function generateForecastForUser(userId: string): Promise<Forecast> {
  const ctx = buildUserContext(userId);
  const formatted = formatContextForPrompt(ctx);

  const client = new Anthropic();
  const response = await client.messages.create({
    model: FORECAST_MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `${formatted}

Generate the 7-day forecast JSON now (days = anchor+1 through anchor+7). Anchor date: ${ctx.today}.`,
      },
      { role: "assistant", content: "{" },
    ],
  });

  const block = response.content[0];
  if (block.type !== "text") throw new Error("Unexpected response shape");
  const parsed = tryParseJson("{" + block.text);
  const validated = LLMForecastSchema.parse(parsed);

  return {
    user_id: userId,
    generated_for: ctx.today,
    summary: validated.summary,
    watch_for: validated.watch_for,
    days: validated.days,
  };
}
