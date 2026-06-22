import type { ProviderId } from "@/lib/ai/config";

type ChatRequest = {
  messages?: { role: "user" | "assistant"; content: string }[];
  provider?: ProviderId;
  model?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as ChatRequest;
  const latest = body.messages?.filter((message) => message.role === "user").at(-1);
  const encoder = new TextEncoder();

  const text = [
    `Resposta local via ${body.provider ?? "openai"}/${body.model ?? "modelo"}.`,
    latest?.content
      ? ` Voce disse: "${latest.content}".`
      : " Envie uma mensagem para iniciar.",
    " Quando as dependencias forem instaladas, esta rota pode delegar para o Vercel AI SDK e transmitir tokens reais.",
  ].join("");

  const words = text.split(" ");

  const stream = new ReadableStream({
    async start(controller) {
      for (const word of words) {
        controller.enqueue(encoder.encode(`${word} `));
        await new Promise((resolve) => setTimeout(resolve, 18));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
