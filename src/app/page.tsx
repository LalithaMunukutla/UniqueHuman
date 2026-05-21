import fs from "node:fs";
import path from "node:path";
import { getUserProfiles } from "@/lib/data";
import type { Insight, UserProfile } from "@/lib/types";
import App from "./App";

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

export default function Page() {
  const profiles: UserProfile[] = getUserProfiles();
  const counts = readInsightCounts();
  return <App profiles={profiles} insightCounts={counts} />;
}
