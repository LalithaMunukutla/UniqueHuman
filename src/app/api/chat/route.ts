import { NextRequest } from "next/server";
import { streamChat } from "@/lib/chat";
import type { Insight } from "@/lib/types";

export const runtime = "nodejs";

type Body = {
  userId: string;
  alert: Insight | null;
  messages: { role: "user" | "assistant"; content: string }[];
};

export async function POST(req: NextRequest) {
  const { userId, alert, messages } = (await req.json()) as Body;

  const stream = await streamChat(userId, alert, messages);

  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        controller.enqueue(encoder.encode(`\n[stream error: ${(err as Error).message}]`));
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
