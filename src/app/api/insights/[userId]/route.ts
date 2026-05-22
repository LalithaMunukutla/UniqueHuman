import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import type { Insight } from "@/lib/types";

export const runtime = "nodejs";

function loadCache(): { generated_at: string; by_user: Record<string, Insight[]> } {
  const p = path.join(process.cwd(), "cache", "insights.json");
  if (!fs.existsSync(p)) return { generated_at: "", by_user: {} };
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { userId: string } },
) {
  const data = loadCache();
  return Response.json({
    user_id: params.userId,
    generated_at: data.generated_at,
    insights: data.by_user[params.userId] ?? [],
  });
}
