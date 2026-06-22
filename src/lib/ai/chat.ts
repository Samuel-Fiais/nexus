"use server";

import type { ProviderId } from "./config";

export interface CoreMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function chat(
  messages: CoreMessage[],
  provider: ProviderId,
  model: string,
) {
  const latest = [...messages].reverse().find((message) => message.role === "user");

  return [
    `Simulacao local para ${provider}/${model}.`,
    latest?.content
      ? `Recebi: "${latest.content}". Instale o Vercel AI SDK para conectar streaming real.`
      : "Envie uma mensagem para iniciar a conversa.",
  ].join(" ");
}
