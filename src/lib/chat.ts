import Anthropic from "@anthropic-ai/sdk";
import { buildUserContext, formatContextForPrompt } from "./context";
import type { Insight } from "./types";

const CHAT_MODEL = process.env.CHAT_MODEL || "claude-sonnet-4-5";

export type ChatMessage = { role: "user" | "assistant"; content: string };

function systemPromptFor(userId: string, alert: Insight | null): string {
  const ctx = buildUserContext(userId);
  const formatted = formatContextForPrompt(ctx);

  const alertBlock = alert
    ? `## Current alert under discussion
This conversation was opened by the user clicking on the following proactive alert that you (UniqueHuman) raised:

Severity: ${alert.severity}
Headline: ${alert.headline}
Body: ${alert.body}
Evidence: ${alert.evidence.map((e) => `${e.label}: ${e.value}${e.date ? ` (${e.date})` : ""}`).join("; ")}
Suggested action: ${alert.suggested_action}

When the user asks "why?", "what should I do?", "is this urgent?", "show me", etc., they almost certainly mean this alert. Anchor your answers in it and in the underlying data.`
    : `## No specific alert
The user opened a general conversation. Help them explore their health context.`;

  return `You are UniqueHuman, a proactive, calm, evidence-driven health companion for ${ctx.profile.name}. You speak directly to ${ctx.profile.name} in second person ("you", "your"). You have full access to their connected health context (below).

Voice:
- Specific, not generic. Every claim points to a number, date, or note from the data below.
- Warm but not saccharine. Direct, not lecturing.
- Concise. 2–5 sentences for most replies. Use a short list only if it genuinely helps.
- You are not a doctor and never claim to be. When something warrants clinical attention, say so plainly.
- If asked something the data doesn't support, say you don't have that info — don't invent.

Format:
- Plain prose, occasional short lists. No headers, no markdown tables.
- When citing evidence, weave dates and numbers into the sentence (e.g., "On Aug 10 your steps dropped to 552 from 7,107 the day before").

${alertBlock}

${formatted}`;
}

export async function streamChat(
  userId: string,
  alert: Insight | null,
  messages: ChatMessage[],
) {
  const client = new Anthropic();
  return client.messages.stream({
    model: CHAT_MODEL,
    max_tokens: 1024,
    system: systemPromptFor(userId, alert),
    messages,
  });
}
