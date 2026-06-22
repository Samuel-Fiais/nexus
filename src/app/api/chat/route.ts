import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText } from 'ai';

const providerMap: Record<string, any> = {
  openai,
  anthropic,
  google,
};

export async function POST(request: Request) {
  const { messages, provider, model, baseUrl } = await request.json() as {
    messages: { role: 'user' | 'assistant' | 'system'; content: string }[];
    provider: string;
    model: string;
    baseUrl?: string;
  };

  // Providers nativos (OpenAI, Anthropic, Google)
  const client = providerMap[provider];
  if (client) {
    const result = streamText({
      model: client(model),
      messages,
    });
    return result.toTextStreamResponse();
  }

  // Providers OpenAI-compatible (Ollama, Custom)
  if (provider === 'ollama' || provider === 'custom') {
    if (!baseUrl) {
      return Response.json(
        { error: 'URL base não configurada para este provedor.' },
        { status: 400 },
      );
    }

    const compatible = createOpenAICompatible({
      name: provider,
      baseURL: baseUrl,
    });

    const result = streamText({
      model: compatible(model),
      messages,
    });
    return result.toTextStreamResponse();
  }

  return Response.json(
    { error: `Provedor "${provider}" não reconhecido.` },
    { status: 400 },
  );
}
