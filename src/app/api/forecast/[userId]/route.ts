import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import type { Forecast } from "@/lib/types";

export const runtime = "nodejs";

function loadAll(): { by_user: Record<string, Forecast> } {
  const p = path.join(process.cwd(), "cache", "forecasts.json");
  if (!fs.existsSync(p)) return { by_user: {} };
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { userId: string } },
) {
  const all = loadAll();
  const forecast = all.by_user[params.userId] ?? null;
  return Response.json({ user_id: params.userId, forecast });
}
