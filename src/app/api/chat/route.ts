import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { streamText } from 'ai';

const providerMap: Record<string, any> = {
  openai,
  anthropic,
  google,
};

export async function POST(request: Request) {
  const { messages, provider, model } = await request.json() as {
    messages: { role: 'user' | 'assistant' | 'system'; content: string }[];
    provider: string;
    model: string;
  };

  const client = providerMap[provider];
  if (!client) {
    return Response.json(
      { error: `Provedor "${provider}" não configurado no servidor.` },
      { status: 400 },
    );
  }

  const result = streamText({
    model: client(model),
    messages,
  });

  return result.toTextStreamResponse();
}
