import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, streamText, type LanguageModel } from "ai";
import type { BehaviorMemoryRecord, OrgMemoryRecord, ProviderRecord, SessionUser, TenantRecord, UserMemoryRecord } from "@/lib/db";

export type CoreMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatOrgMemory = OrgMemoryRecord & {
  liveContent?: string;
  liveFetchFailed?: boolean;
};

export type ChatLiveLink = {
  url: string;
  content: string;
  status: "success" | "failed";
  error?: string | null;
};

export type ChatContext = {
  tenant: TenantRecord;
  provider: ProviderRecord | null;
  user: SessionUser;
  orgMemories: ChatOrgMemory[];
  userMemories: UserMemoryRecord[];
  behaviorMemories: BehaviorMemoryRecord[];
  liveLinks: ChatLiveLink[];
};

export function providerLabel(provider: ProviderRecord | null) {
  if (!provider) return "Sem modelo configurado";
  return `${provider.modelAlias || provider.name} / ${provider.model || "modelo não definido"}`;
}

function hasUsableCredentials(provider: ProviderRecord) {
  if (!provider.model.trim()) return false;
  if (provider.kind === "ollama") return !!provider.endpointUrl;
  if (provider.kind === "custom") return !!provider.endpointUrl;
  return !!provider.apiKey;
}

function normalizeOpenAIBaseUrl(endpoint: string) {
  const trimmed = endpoint.replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function createModel(provider: ProviderRecord): LanguageModel | null {
  if (!hasUsableCredentials(provider)) return null;

  if (provider.kind === "openai") {
    return createOpenAI({ apiKey: provider.apiKey || undefined })(provider.model);
  }

  if (provider.kind === "anthropic") {
    return createAnthropic({ apiKey: provider.apiKey || undefined })(provider.model);
  }

  if (provider.kind === "google") {
    return createGoogleGenerativeAI({ apiKey: provider.apiKey || undefined })(provider.model);
  }

  const compatible = createOpenAICompatible({
    name: provider.name,
    baseURL: normalizeOpenAIBaseUrl(provider.endpointUrl || ""),
    ...(provider.apiKey ? { apiKey: provider.apiKey } : {}),
  });
  return compatible(provider.model);
}

function compactList(items: string[]) {
  return items.filter(Boolean).join("\n");
}

function truncateText(value: string, limit: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit).trim()}...` : normalized;
}

function orgMemoryPromptLine(memory: ChatOrgMemory) {
  if (memory.sourceType === "link" && memory.liveContent) {
    const source = memory.url ? `: ${memory.url}` : "";
    return `- ${memory.title} (link consultado ao vivo${source}): ${truncateText(memory.liveContent, 2400)}`;
  }

  if (memory.sourceType === "link" && memory.liveFetchFailed) {
    const source = memory.url ? `: ${memory.url}` : "";
    return `- ${memory.title} (link indisponível ao vivo; fallback salvo${source}): ${truncateText(memory.summary || memory.content, 600)}`;
  }

  return `- ${memory.title}: ${truncateText(memory.summary || memory.content, 600)}`;
}

function liveLinkPromptLine(link: ChatLiveLink) {
  if (link.status === "success" && link.content) {
    return `- ${link.url} (link consultado ao vivo): ${truncateText(link.content, 2200)}`;
  }
  return "";
}

export function buildSystemPrompt(context: ChatContext) {
  const org = context.orgMemories
    .map(orgMemoryPromptLine)
    .slice(0, 8);
  const liveLinks = context.liveLinks
    .map(liveLinkPromptLine)
    .filter(Boolean)
    .slice(0, 10);
  const user = context.userMemories
    .map((memory) => `- ${memory.type}: ${memory.summary || memory.content}`)
    .slice(0, 8);
  const behavior = context.behaviorMemories
    .map((memory) => `- ${memory.summary || memory.content}`)
    .slice(0, 8);

  return compactList([
    context.tenant.soul,
    context.tenant.generalBehavior ? `Comportamento geral:\n${context.tenant.generalBehavior}` : "",
    behavior.length ? `Memórias gerais de comportamento:\n${behavior.join("\n")}` : "",
    user.length ? `Memórias do usuário:\n${user.join("\n")}` : "",
    org.length ? `Memórias organizacionais relevantes:\n${org.join("\n")}` : "",
    liveLinks.length ? `Links consultados ao vivo nesta conversa:\n${liveLinks.join("\n")}` : "",
  ]);
}

function fallbackAnswer(messages: CoreMessage[], context: ChatContext) {
  const latest = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const firstMemory = context.orgMemories[0];
  const memoryHint = firstMemory
    ? `\n\nMemória consultada: ${firstMemory.title} - ${truncateText(firstMemory.liveContent || firstMemory.summary || firstMemory.content, 180)}`
    : "";
  return [
    `Não consegui acionar o modelo configurado (${providerLabel(context.provider)}).`,
    latest ? `Ainda assim, registrei sua mensagem e posso responder com base no contexto disponível: "${latest}".` : "Envie uma mensagem para iniciar a conversa.",
    memoryHint,
  ].join(" ");
}

function textResponseStream(text: string) {
  const encoder = new TextEncoder();
  const tokens = text.match(/\S+\s*/g) ?? [text];
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const token of tokens) {
        controller.enqueue(encoder.encode(token));
        await new Promise((resolve) => setTimeout(resolve, 8));
      }
      controller.close();
    },
  });
}

export function createChatStream(messages: CoreMessage[], context: ChatContext, onFinish: (text: string) => void) {
  const model = context.provider ? createModel(context.provider) : null;

  if (!model) {
    const text = fallbackAnswer(messages, context);
    onFinish(text);
    return new Response(textResponseStream(text), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  try {
    const result = streamText({
      model,
      system: buildSystemPrompt(context),
      messages,
      onFinish({ text }) {
        onFinish(text);
      },
    });
    return result.toTextStreamResponse();
  } catch {
    const text = fallbackAnswer(messages, context);
    onFinish(text);
    return new Response(textResponseStream(text), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

export function heuristicCuration(input: string) {
  const words = input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 4);
  const tags = Array.from(new Set(words)).slice(0, 6);
  const summary = input.replace(/\s+/g, " ").trim().slice(0, 240) || "Conteúdo armazenado para consulta futura.";
  return { tags: tags.join(", "), summary };
}

export async function curateMemory(input: string, provider: ProviderRecord | null) {
  const fallback = heuristicCuration(input);
  if (!provider) return fallback;
  const model = createModel(provider);
  if (!model) return fallback;

  try {
    const result = await generateText({
      model,
      system: "Responda somente JSON válido com as chaves tags e summary. tags deve ser array de strings curto.",
      prompt: input.slice(0, 6000),
    });
    const parsed = JSON.parse(result.text) as { tags?: unknown; summary?: unknown };
    const tags = Array.isArray(parsed.tags) ? parsed.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 8).join(", ") : fallback.tags;
    const summary = typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim() : fallback.summary;
    return { tags, summary };
  } catch {
    return fallback;
  }
}
