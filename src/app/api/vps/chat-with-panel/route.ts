// VPS-backend endpoint: called by server actions, not the browser.
// Streams a panel chat reply as plain text; each chunk is the full text
// accumulated so far, not a delta.

import { NextRequest } from "next/server";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";

export async function POST(req: NextRequest) {
  const { responses, synthesis, message, history } = await req.json();

  const llmService = LlmServiceImpl.createFromEnv("openrouter");
  const responseStream = llmService.chatWithPanelStream(
    responses ?? [],
    synthesis || null,
    message,
    history ?? [],
  );

  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        let fullText = "";
        for await (const chunk of responseStream) {
          fullText += chunk;
          controller.enqueue(encoder.encode(fullText));
        }
        controller.close();
      } catch (error) {
        console.error("[chat-with-panel] Stream error:", error);
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              step: "ERROR",
              error: (error as Error).message,
            }),
          ),
        );
        controller.close();
      }
    },
  });

  return new Response(readableStream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
