import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import fs from "node:fs";
import path from "node:path";
import { evaluateInsight, summarize } from "../src/lib/eval";
import type { Insight } from "../src/lib/types";
import type { EvalReport, InsightEval } from "../src/lib/eval";

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY missing. Set it in .env.local.");
    process.exit(1);
  }

  const cachePath = path.join(process.cwd(), "cache", "insights.json");
  if (!fs.existsSync(cachePath)) {
    console.error("cache/insights.json missing — run `pnpm run insights` first.");
    process.exit(1);
  }
  const cache = JSON.parse(fs.readFileSync(cachePath, "utf8")) as {
    by_user: Record<string, Insight[]>;
  };

  const insights: Insight[] = Object.values(cache.by_user).flat();
  console.log(`Evaluating ${insights.length} insights across ${Object.keys(cache.by_user).length} users\n`);

  const byInsight: Record<string, InsightEval> = {};
  for (const ins of insights) {
    const start = Date.now();
    process.stdout.write(`  ${ins.id}... `);
    try {
      const result = await evaluateInsight(ins);
      byInsight[ins.id] = result;
      const ms = Date.now() - start;
      console.log(
        `judge ${result.judge_avg.toFixed(1)}/5 · grounded ${result.grounding.grounded_numbers}/${result.grounding.total_numbers}` +
          (result.grounding.ungrounded.length
            ? ` · ungrounded: [${result.grounding.ungrounded.join(", ")}]`
            : "") +
          ` · ${(ms / 1000).toFixed(1)}s`,
      );
    } catch (err) {
      console.log(`FAILED: ${(err as Error).message}`);
    }
  }

  const evals = Object.values(byInsight);
  const cohort = summarize(evals);
  const report: EvalReport = {
    generated_at: new Date().toISOString(),
    cohort_summary: cohort,
    by_insight: byInsight,
  };

  const out = path.join(process.cwd(), "cache", "eval-report.json");
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${out}\n`);

  console.log("─── Cohort summary ─".padEnd(60, "─"));
  console.log(`  Total insights evaluated:   ${cohort.total_insights}`);
  console.log(`  Avg judge score (0-5):      ${cohort.avg_judge_score}`);
  console.log(`  Avg grounding %:            ${cohort.avg_grounding_pct}%`);
  console.log(`  Distinct headlines:         ${cohort.distinct_headlines}/${cohort.total_insights}`);
  if (cohort.duplicate_headlines.length > 0) {
    console.log(`  ⚠ Duplicate headlines:      ${cohort.duplicate_headlines.length}`);
    for (const h of cohort.duplicate_headlines)
      console.log(`      "${h.slice(0, 70)}…"`);
  }
  console.log(`\n  Per-axis (0-5):`);
  for (const [axis, score] of Object.entries(cohort.per_axis)) {
    console.log(`    ${axis.padEnd(18)} ${score}`);
  }
  console.log("─".repeat(60));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
