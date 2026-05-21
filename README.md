# UniqueHuman

A proactive intelligence demo for people with chronic conditions. Built for the UniqueHuman take-home assessment — 3-hour build.

The product wedge: **the system speaks first**, then lets you interrogate any alert through chat. Open a person, see what UniqueHuman noticed for them *today* across wearable + medical records + labs + symptom flags, then dig in.

## Run it

```bash
pnpm install
cp .env.local.example .env.local        # then paste your Claude API key
pnpm run insights                        # one-time: generates cache/insights.json
pnpm dev                                 # open http://localhost:3000
```

`pnpm run insights` calls the Anthropic API once per user (~25–35s each, ~5 min total) and writes the result to `cache/insights.json`. The dev server reads from this cache, so demo loads are instant and reproducible. Rerun anytime you tweak the prompt.

## What's in the demo

10 users with rich, heterogeneous health data:

| User | Condition | What UniqueHuman catches |
|---|---|---|
| user_001 Sarah | Migraine with aura | HRV/stress prodrome before attacks |
| user_002 Marcus | Type 2 diabetes | Shift-work pattern threatening hard-won HbA1c gains |
| user_003 Priya | ME/CFS | Activity ceiling breaches → PEM crash 24–48h ahead |
| user_004 James | OSA | CPAP non-compliance pattern in sleep efficiency |
| user_005 Elena | Generalized anxiety | HRV trend changes preceding anxiety flares |
| user_006 David | Hypertension | Non-dipper / sleep → BP coupling |
| user_007 Aisha | Asthma | AQI + exercise interaction risks |
| user_008 Tom | None (athlete) | Overtraining / HRV trend monitoring |
| user_009 Nina | None reported | Prediabetic phenotype emerging silently |
| user_010 Carlos | None reported | Recurring alcohol → sleep → cardiac coupling |

Each user sees 1–3 personalized alerts. Click any alert to:

- **Chat about it** — UniqueHuman has full context (profile, every record, every lab, 90 days of wearable data, baselines) every turn.
- **Share it with your care network** — one click drafts the same alert as a clinical brief for your doctor, a plain-English note for your partner, and a casual heads-up for a friend. Same evidence, calibrated tone. Copy or open in your mail/SMS client.

## Architecture

```
data/                            source-of-truth: 4 files from the assignment
cache/insights.json              pre-computed alerts, regenerated via `pnpm run insights`
scripts/precompute-insights.ts   `pnpm run insights` entrypoint
src/lib/
  data.ts                        load + cache the 4 files in memory at server start
  baselines.ts                   per-user mean/std for HR/HRV/sleep/stress/SpO2
  context.ts                     buildUserContext(userId) → markdown-formatted full context
  insights.ts                    Claude Opus call, structured JSON out, Zod-validated
  chat.ts                        Claude Sonnet streaming chat, full context every turn
  share.ts                       Claude Sonnet — drafts an alert as a message for {doctor|partner|friend}
src/app/
  page.tsx                       server component: load users + insight counts
  App.tsx                        client component: rail + inbox + chat + share modal
  api/chat/route.ts              POST streaming chat endpoint
  api/insights/[userId]/route.ts GET cached insights
  api/share/route.ts             POST: draft a share-with-care-network message
```

### Key design decisions

**1. Pre-compute insights, cache to disk.** One Claude call per user, results committed to `cache/insights.json`. Three reasons: demo loads are instant, the recorded walkthrough is reproducible, API spend is bounded (~$0.10 per regenerate). Re-run any time with `pnpm run insights`.

**2. Per-user baselines, not cohort thresholds.** Resting HRV varies wildly across this cohort (Sarah ~50ms; Priya ~28ms). The prompt receives each user's *own* mean ± std for the metrics it might cite, so "your HRV dropped to 22 ms" lands as a deviation, not a generic concern.

**3. The LLM is the analyst, not the narrator.** The insight prompt does *not* hand Claude a pre-detected pattern and ask for a nice sentence. It hands Claude the full structured context — 90 days of wearable, every record, every lab, baselines, symptom flags — and asks: *what's the most important thing this user should know today, and why?* The model decides what to surface. Output is structured JSON, validated with Zod.

**4. Full context every chat turn.** No RAG, no vector DB. The full user context fits comfortably in Claude's window, so the system prompt is rebuilt every turn. The assistant never forgets who it's talking to or which alert started the thread. Sonnet 4.5, streaming.

**5. Models: Opus for offline reasoning, Sonnet for online chat.** Opus 4.5 generates insights once at pre-compute time (deeper reasoning matters; latency doesn't). Sonnet 4.5 handles chat (fast streaming matters; output quality is plenty).

**6. "Speak first" framing.** No empty state, no "ask me anything." Opening a user immediately shows their alerts with a relative timestamp ("noticed this morning"). The top alert is auto-selected as the chat anchor. The product walks up to you, not the other way around.

## What I didn't build (deliberately)

- Auth, signup, settings, profile editing
- A database (in-memory + JSON cache is plenty for 10 users)
- Charts (evidence is text + chips, faster to read at a glance)
- Mobile responsiveness
- A second screen of any kind

The brief said skip CRUD/auth and spend time on what's unique. The unique slice is the proactive alert + grounded chat loop.

## Eval criteria mapping

- **Systems thinking** — single in-memory store, per-user baselines, offline/online model split, pre-compute cache vs. live chat.
- **Agentic reasoning** — the model decides what's worth flagging, severity, and the action. No hard-coded detection rules.
- **Product sense** — alerts you can act on (specific dates, specific numbers, specific actions), chat that knows you.
- **Implementation** — works end-to-end for all 10 users.
- **AI fluency** — LLM for both analysis and conversation, prompt-as-spec with Zod validation, prompt assertions in the system message ("never invent values, every number must appear in the context").

## License

This is a take-home submission. Code, prompts, and design are mine. Data is from the assignment.
