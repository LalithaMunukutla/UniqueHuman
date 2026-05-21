import { NextRequest } from "next/server";
import { checkInOnPlan } from "@/lib/plan";

export const runtime = "nodejs";

type Body = { userId: string; planId: string };

export async function POST(req: NextRequest) {
  const { userId, planId } = (await req.json()) as Body;
  if (!userId || !planId) {
    return Response.json({ error: "missing fields" }, { status: 400 });
  }
  try {
    const ci = await checkInOnPlan(userId, planId);
    return Response.json({ check_in: ci });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
