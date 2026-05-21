import Anthropic from "@anthropic-ai/sdk";
import { buildUserContext, formatContextForPrompt } from "./context";
import type { Insight } from "./types";

const SHARE_MODEL = process.env.CHAT_MODEL || "claude-sonnet-4-5";

export type Audience = "doctor" | "partner" | "friend";

const AUDIENCE_BRIEFS: Record<Audience, string> = {
  doctor: `Audience: a primary care physician or specialist who treats this person. Tone: clinical, precise, respectful of their time.
Length: 100–140 words.
Structure (no headers — flowing paragraphs):
1. One-sentence summary of the pattern.
2. Specific evidence: baselines, the observed values with dates, and any relevant lab/record context.
3. The patient's interpretation (this is the *patient* writing — frame accordingly).
4. A focused ask. One question or one decision needed.
Vocabulary: dx codes, medication names, ranges are fine. No exclamation marks. No "I just wanted to reach out".
Sign-off: short, first-person.`,

  partner: `Audience: the person's spouse, partner, or live-in caregiver. They love this person and want to help, but aren't a clinician.
Tone: warm, plain English, calm. Not dramatic.
Length: 70–100 words.
Structure: what's happening, why now, and 1–2 specific things they could do this week (or stop doing). Avoid jargon — say "my body's recovery score" not "HRV".
Open with their name placeholder: "Hey [name],"
Avoid: medical terminology, scary verbs ("crashing", "spiking"), long explanations of mechanism.`,

  friend: `Audience: a close friend who knows about the condition at a high level but isn't part of the user's daily medical reality.
Tone: casual, short, real.
Length: 2–4 sentences (40–70 words).
Structure: what's up, what it means for plans this week, and either an ask or just a heads-up. No drama.
Open with "Hey —" or similar low-stakes opener.
Avoid: oversharing data, listing symptoms, asking for sympathy.`,
};

function systemPromptFor(audience: Audience, userName: string, condition: string | null): string {
  const brief = AUDIENCE_BRIEFS[audience];
  return `You are drafting a message *as ${userName}* (the patient/person), not as a third party or as UniqueHuman. The message is to be sent from ${userName} to the audience described below. Write in first person from ${userName}'s perspective.

${condition ? `${userName} lives with ${condition}.` : `${userName} has no diagnosed chronic condition; the pattern below is something UniqueHuman detected from their data.`}

${brief}

Hard constraints:
- Never invent values. Every number you cite must appear in the context provided.
- Never include the literal text "UniqueHuman" in the message — this is a personal message from the user. You can reference "my tracker" or "the data from my watch" if it helps the audience trust the source.
- Do not include subject lines, signatures with placeholder fields, or markdown formatting. Plain prose only.
- Do not start with "Dear" or formal salutations unless the audience is the doctor.
- Output only the message itself. No preamble, no commentary, no quotation marks around it.`;
}

function userPromptFor(formattedContext: string, alert: Insight): string {
  return `Here is the full health context for me, followed by the specific alert that prompted this share. Draft the message now.

${formattedContext}

# The alert I want to share

Severity: ${alert.severity}
Headline: ${alert.headline}
Body: ${alert.body}
Evidence: ${alert.evidence.map((e) => `${e.label}: ${e.value}${e.date ? ` (${e.date})` : ""}`).join("; ")}
Suggested action: ${alert.suggested_action}

Write the message below — message only, nothing else:`;
}

export async function generateShareMessage(
  userId: string,
  alert: Insight,
  audience: Audience,
): Promise<string> {
  const ctx = buildUserContext(userId);
  const formatted = formatContextForPrompt(ctx);

  const client = new Anthropic();
  const response = await client.messages.create({
    model: SHARE_MODEL,
    max_tokens: 700,
    system: systemPromptFor(audience, ctx.profile.name, ctx.profile.condition),
    messages: [{ role: "user", content: userPromptFor(formatted, alert) }],
  });

  const block = response.content[0];
  if (block.type !== "text") throw new Error("Unexpected response shape");
  return block.text.trim();
}
