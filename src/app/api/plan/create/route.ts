import { NextRequest } from "next/server";
import { generatePlanFromAlert } from "@/lib/plan";
import type { Insight } from "@/lib/types";

export const runtime = "nodejs";

type Body = { userId: string; alert: Insight };

export async function POST(req: NextRequest) {
  const { userId, alert } = (await req.json()) as Body;
  if (!userId || !alert) {
    return Response.json({ error: "missing fields" }, { status: 400 });
  }
  try {
    const plan = await generatePlanFromAlert(userId, alert);
    return Response.json({ plan });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
