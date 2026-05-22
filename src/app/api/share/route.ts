import { NextRequest } from "next/server";
import { generateShareMessage, type Audience } from "@/lib/share";
import type { Insight } from "@/lib/types";

export const runtime = "nodejs";

type Body = {
  userId: string;
  alert: Insight;
  audience: Audience;
};

export async function POST(req: NextRequest) {
  const { userId, alert, audience } = (await req.json()) as Body;
  if (!userId || !alert || !audience) {
    return Response.json({ error: "missing fields" }, { status: 400 });
  }
  const message = await generateShareMessage(userId, alert, audience);
  return Response.json({ message, audience });
}
