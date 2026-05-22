import { NextRequest } from "next/server";
import { getPlansFor } from "@/lib/plan";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: { userId: string } },
) {
  const plans = getPlansFor(params.userId);
  return Response.json({ user_id: params.userId, plans });
}
