import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import fs from "node:fs";
import path from "node:path";
import { getUserProfiles } from "../src/lib/data";
import { generateInsightsForUser } from "../src/lib/insights";
import type { Insight } from "../src/lib/types";

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY missing. Set it in .env.local or export it.");
    process.exit(1);
  }

  const profiles = getUserProfiles();
  console.log(`Generating insights for ${profiles.length} users using ${process.env.INSIGHT_MODEL || "default"}...`);

  const cachePath = path.join(process.cwd(), "cache", "insights.json");
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });

  const all: Record<string, Insight[]> = {};
  const write = () =>
    fs.writeFileSync(
      cachePath,
      JSON.stringify({ generated_at: new Date().toISOString(), by_user: all }, null, 2),
    );

  for (const p of profiles) {
    const start = Date.now();
    process.stdout.write(`  ${p.id} (${p.name})... `);
    try {
      const insights = await generateInsightsForUser(p.id);
      all[p.id] = insights;
      console.log(`${insights.length} insights in ${((Date.now() - start) / 1000).toFixed(1)}s`);
    } catch (err) {
      console.log(`FAILED: ${(err as Error).message}`);
      all[p.id] = [];
    }
    write();
  }

  console.log(`\nWrote ${cachePath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
