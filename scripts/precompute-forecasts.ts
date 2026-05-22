import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import fs from "node:fs";
import path from "node:path";
import { getUserProfiles } from "../src/lib/data";
import { generateForecastForUser } from "../src/lib/forecast";
import type { Forecast } from "../src/lib/types";

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY missing.");
    process.exit(1);
  }

  const profiles = getUserProfiles();
  console.log(`Generating 7-day forecasts for ${profiles.length} users...`);

  const cachePath = path.join(process.cwd(), "cache", "forecasts.json");
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });

  const all: Record<string, Forecast> = {};
  const write = () =>
    fs.writeFileSync(
      cachePath,
      JSON.stringify({ generated_at: new Date().toISOString(), by_user: all }, null, 2),
    );

  for (const p of profiles) {
    const start = Date.now();
    process.stdout.write(`  ${p.id} (${p.name})... `);
    try {
      const forecast = await generateForecastForUser(p.id);
      all[p.id] = forecast;
      const elevated = forecast.days.filter(
        (d) => d.risk === "elevated" || d.risk === "high",
      ).length;
      console.log(
        `${forecast.days.length}d (${elevated} elevated/high) in ${((Date.now() - start) / 1000).toFixed(1)}s`,
      );
    } catch (err) {
      console.log(`FAILED: ${(err as Error).message}`);
    }
    write();
  }

  console.log(`\nWrote ${cachePath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
