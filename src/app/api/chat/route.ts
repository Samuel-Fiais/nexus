import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText } from 'ai';

const providerMap: Record<string, (modelId: string) => ReturnType<typeof openai>> = {
  openai: (modelId) => openai(modelId),
  anthropic: (modelId) => anthropic(modelId) as ReturnType<typeof openai>,
  google: (modelId) => google(modelId) as ReturnType<typeof openai>,
};

export async function POST(request: Request) {
  const { messages, provider, model, baseUrl, apiKey } = await request.json() as {
    messages: { role: 'user' | 'assistant' | 'system'; content: string }[];
    provider: string;
    model: string;
    baseUrl?: string;
    apiKey?: string;
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
      ...(apiKey ? { apiKey } : {}),
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
