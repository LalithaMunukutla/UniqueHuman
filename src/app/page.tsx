import fs from "node:fs";
import path from "node:path";
import { getUserProfiles } from "@/lib/data";
import type { Insight, UserProfile } from "@/lib/types";
import App, { type InsightEvalSlim } from "./App";

function readInsightCounts(): Record<string, number> {
  const p = path.join(process.cwd(), "cache", "insights.json");
  if (!fs.existsSync(p)) return {};
  const data = JSON.parse(fs.readFileSync(p, "utf8")) as {
    by_user: Record<string, Insight[]>;
  };
  const out: Record<string, number> = {};
  for (const [uid, list] of Object.entries(data.by_user)) {
    out[uid] = list.length;
  }
  return out;
}

type ReportShape = {
  by_insight: Record<
    string,
    {
      judge_avg: number;
      grounding: { total_numbers: number; grounded_numbers: number };
      judge: {
        specificity: { score: number };
        grounding: { score: number };
        actionability: { score: number };
        safety: { score: number };
      };
    }
  >;
};

function readEvalReport(): Record<string, InsightEvalSlim> {
  const p = path.join(process.cwd(), "cache", "eval-report.json");
  if (!fs.existsSync(p)) return {};
  const data = JSON.parse(fs.readFileSync(p, "utf8")) as ReportShape;
  const out: Record<string, InsightEvalSlim> = {};
  for (const [id, e] of Object.entries(data.by_insight)) {
    out[id] = {
      judge_avg: e.judge_avg,
      grounding_pct:
        e.grounding.total_numbers === 0
          ? 100
          : Math.round(
              (e.grounding.grounded_numbers / e.grounding.total_numbers) * 100,
            ),
      per_axis: {
        specificity: e.judge.specificity.score,
        grounding: e.judge.grounding.score,
        actionability: e.judge.actionability.score,
        safety: e.judge.safety.score,
      },
    };
  }
  return out;
}

export default function Page() {
  const profiles: UserProfile[] = getUserProfiles();
  const counts = readInsightCounts();
  const evals = readEvalReport();
  return <App profiles={profiles} insightCounts={counts} evalByInsight={evals} />;
}
