import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, stepCountIs, streamText, tool, type LanguageModel, type StepResult, type ToolSet } from "ai";
import { z } from "zod";
import type { BehaviorMemoryRecord, OrgMemoryRecord, ProviderRecord, SessionUser, TenantRecord, UserMemoryRecord } from "@/lib/db";
import {
  upsertUserMemory,
  listUserMemories,
  upsertBehaviorMemory,
  listBehaviorMemories,
  insertOrgMemory,
  listOrgMemories,
  deleteUserMemory,
  deleteBehaviorMemory,
  deleteOrgMemory,
} from "@/lib/db";

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

type TraceStep = {
  text: string;
  toolCalls: { name: string; args: Record<string, unknown>; result: string }[];
};

type TraceData = {
  steps: TraceStep[];
  sources: { number: number; type: string; content: string }[];
};

type MemoryReference = {
  number: number;
  type: string;
  content: string;
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

function userMemoryReferences(context: ChatContext): MemoryReference[] {
  return context.userMemories.slice(0, 8).map((memory, index) => ({
    number: index + 1,
    type: memory.type,
    content: memory.summary || memory.content,
  }));
}

export function buildSystemPrompt(context: ChatContext) {
  const org = context.orgMemories
    .map(orgMemoryPromptLine)
    .slice(0, 8);
  const liveLinks = context.liveLinks
    .map(liveLinkPromptLine)
    .filter(Boolean)
    .slice(0, 10);
  const user = userMemoryReferences(context)
    .map((memory) => `[${memory.number}] ${memory.type}: ${memory.content}`);
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
    "",
    "## Formato de resposta",
    "- Quando você usar informações de uma memória específica, adicione o número de referência entre colchetes ao lado: `[1]`, `[2]`, etc.",
    '- No final da sua resposta, inclua uma seção "## Fontes" listando cada referência usada.',
    '- Exemplo: "O usuário se chama Samuel[1] e prefere design minimalista[2]."',
    "",
    "## Ferramentas disponíveis",
    "Você tem acesso às seguintes ferramentas para gerenciar memórias:",
    "",
    "### Memórias do usuário (fatos, preferências, decisões pessoais)",
    "- `save_user_memory(type, content)` — Salva uma memória pessoal do usuário.",
    "  Use quando o usuário compartilhar informações pessoais, preferências, ou pedir para lembrar algo.",
    "  **Identifique automaticamente**: se o usuário diz 'meu nome é X', 'gosto de Y', 'trabalho com Z'",
    "  — salve como memória. Não espere ele pedir.",
    "- `get_user_memories(type?, query?)` — Busca memórias do usuário.",
    "- `delete_user_memory(id)` — Remove uma memória do usuário.",
    "",
    "### Memórias organizacionais (documentos, links, referências do tenant)",
    "- `save_org_memory(title, content, sourceType, url?)` — Adiciona uma memória organizacional.",
    "  Use quando o usuário pedir para salvar um documento, link ou informação relevante ao negócio.",
    "- `get_org_memories(query?)` — Busca memórias organizacionais.",
    "- `delete_org_memory(id)` — Remove uma memória organizacional.",
    "",
    "### Memórias de comportamento (diretrizes gerais do assistente)",
    "- `save_behavior_memory(content)` — Adiciona uma diretriz de comportamento.",
    "  Use quando o usuário disser como o assistente deve se comportar ou responder.",
    "- `get_behavior_memories(query?)` — Busca diretrizes de comportamento.",
    "- `delete_behavior_memory(id)` — Remove uma diretriz.",
    "",
    "**IMPORTANTE**: Sempre que o usuário compartilhar uma informação pessoal relevante",
    "(nome, preferência, gosto, trabalho, contato, decisão), use save_user_memory automaticamente.",
    "Não apenas confirme verbalmente — execute a ferramenta.",
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

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return { value };
}

function stringifyTraceValue(value: unknown) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function traceStepFromResult(step: StepResult<ToolSet>): TraceStep {
  return {
    text: step.text,
    toolCalls: step.toolCalls.map((call) => {
      const result = step.toolResults.find((item) => item.toolCallId === call.toolCallId);
      return {
        name: call.toolName,
        args: toRecord(call.input),
        result: result ? stringifyTraceValue(result.output) : "",
      };
    }),
  };
}

function referencedSources(text: string, sources: MemoryReference[]) {
  const used = new Set<number>();
  for (const match of text.matchAll(/\[(\d+)\]/g)) {
    used.add(Number(match[1]));
  }
  return sources.filter((source) => used.has(source.number));
}

function traceBlock(trace: TraceData) {
  return `\n\n__TRACE__\n${JSON.stringify(trace)}\n__ENDTRACE__`;
}

function tracedTextResponse(
  textStream: AsyncIterable<string>,
  trace: TraceData,
  onFinish: (text: string) => void | Promise<void>,
) {
  const encoder = new TextEncoder();
  let fullText = "";

  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of textStream) {
            fullText += chunk;
            controller.enqueue(encoder.encode(chunk));
          }

          const block = traceBlock(trace);
          controller.enqueue(encoder.encode(block));
          await onFinish(fullText + block);
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    }),
    {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    },
  );
}

export function createChatStream(messages: CoreMessage[], context: ChatContext, onFinish: (text: string) => void | Promise<void>) {
  const model = context.provider ? createModel(context.provider) : null;

  if (!model) {
    const text = fallbackAnswer(messages, context);
    onFinish(text);
    return new Response(textResponseStream(text), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  try {
    const memorySources = userMemoryReferences(context);
    const trace: TraceData = {
      steps: [],
      sources: [],
    };
    const result = streamText({
      model,
      system: buildSystemPrompt(context),
      messages,
      tools: {
        // ── User memories ──
        save_user_memory: tool({
          description: "Salva uma memória do usuário (fato, preferência ou decisão). Use automaticamente quando o usuário compartilhar informações pessoais.",
          inputSchema: z.object({
            type: z.enum(["fact", "preference", "decision"]).describe("Tipo da memória"),
            content: z.string().min(1).describe("Conteúdo da memória a ser salva"),
          }),
          execute: async ({ type, content }) => {
            await upsertUserMemory(context.user, { type, content });
            return `Memória salva com sucesso (${type}).`;
          },
        }),
        get_user_memories: tool({
          description: "Busca memórias do usuário, opcionalmente filtradas por tipo ou palavra-chave.",
          inputSchema: z.object({
            type: z.enum(["fact", "preference", "decision"]).optional().describe("Filtrar por tipo de memória"),
            query: z.string().optional().describe("Palavra-chave para buscar no conteúdo das memórias"),
          }),
          execute: async ({ type, query }) => {
            const memories = await listUserMemories(context.user, context.user.id);
            let filtered = memories;
            if (type) filtered = filtered.filter((m) => m.type === type);
            if (query) {
              const q = query.toLowerCase();
              filtered = filtered.filter((m) => m.content.toLowerCase().includes(q) || m.summary.toLowerCase().includes(q) || m.tags.toLowerCase().includes(q));
            }
            return filtered.slice(0, 10).map((m) => `[${m.type}] ${m.summary || m.content}`).join("\n") || "Nenhuma memória encontrada.";
          },
        }),
        delete_user_memory: tool({
          description: "Remove uma memória do usuário pelo ID.",
          inputSchema: z.object({
            id: z.string().min(1).describe("ID da memória a ser removida"),
          }),
          execute: async ({ id }) => {
            await deleteUserMemory(context.user, id);
            return "Memória removida.";
          },
        }),

        // ── Org memories ──
        save_org_memory: tool({
          description: "Adiciona uma memória organizacional (documento, link, texto). Requer role admin.",
          inputSchema: z.object({
            title: z.string().min(1).describe("Título da memória"),
            content: z.string().min(1).describe("Conteúdo da memória"),
            sourceType: z.enum(["text", "link", "pdf", "image"]).describe("Tipo de conteúdo"),
            url: z.string().optional().describe("URL opcional"),
          }),
          execute: async ({ title, content, sourceType, url }) => {
            if (context.user.role !== "admin") return "Apenas administradores podem criar memórias organizacionais.";
            await insertOrgMemory(context.user, { title, content, sourceType, url: url ?? null, tags: "", summary: "", filePath: null, fileName: null, mimeType: null });
            return `Memória organizacional "${title}" criada.`;
          },
        }),
        get_org_memories: tool({
          description: "Busca memórias organizacionais por palavra-chave.",
          inputSchema: z.object({
            query: z.string().optional().describe("Palavra-chave para buscar"),
          }),
          execute: async ({ query }) => {
            const memories = await listOrgMemories(context.user.tenantId);
            let filtered = memories;
            if (query) {
              const q = query.toLowerCase();
              filtered = filtered.filter((m) => m.title.toLowerCase().includes(q) || m.content.toLowerCase().includes(q) || m.summary.toLowerCase().includes(q) || m.tags.toLowerCase().includes(q));
            }
            return filtered.slice(0, 10).map((m) => `[${m.sourceType}] ${m.title}: ${truncateText(m.summary || m.content, 200)}`).join("\n") || "Nenhuma memória organizacional encontrada.";
          },
        }),
        delete_org_memory: tool({
          description: "Remove uma memória organizacional pelo ID. Requer role admin.",
          inputSchema: z.object({
            id: z.string().min(1).describe("ID da memória a ser removida"),
          }),
          execute: async ({ id }) => {
            if (context.user.role !== "admin") return "Apenas administradores podem remover memórias organizacionais.";
            await deleteOrgMemory(context.user, id);
            return "Memória organizacional removida.";
          },
        }),

        // ── Behavior memories ──
        save_behavior_memory: tool({
          description: "Adiciona uma diretriz de comportamento para o assistente. Requer role admin.",
          inputSchema: z.object({
            content: z.string().min(1).describe("Conteúdo da diretriz de comportamento"),
          }),
          execute: async ({ content }) => {
            if (context.user.role !== "admin") return "Apenas administradores podem criar diretrizes de comportamento.";
            await upsertBehaviorMemory(context.user, { content });
            return "Diretriz de comportamento salva.";
          },
        }),
        get_behavior_memories: tool({
          description: "Busca diretrizes de comportamento por palavra-chave.",
          inputSchema: z.object({
            query: z.string().optional().describe("Palavra-chave para buscar"),
          }),
          execute: async ({ query }) => {
            const memories = await listBehaviorMemories(context.user.tenantId);
            let filtered = memories;
            if (query) {
              const q = query.toLowerCase();
              filtered = filtered.filter((m) => m.content.toLowerCase().includes(q) || m.summary.toLowerCase().includes(q));
            }
            return filtered.slice(0, 10).map((m) => `- ${m.summary || m.content}`).join("\n") || "Nenhuma diretriz encontrada.";
          },
        }),
        delete_behavior_memory: tool({
          description: "Remove uma diretriz de comportamento pelo ID. Requer role admin.",
          inputSchema: z.object({
            id: z.string().min(1).describe("ID da diretriz a ser removida"),
          }),
          execute: async ({ id }) => {
            if (context.user.role !== "admin") return "Apenas administradores podem remover diretrizes de comportamento.";
            await deleteBehaviorMemory(context.user, id);
            return "Diretriz de comportamento removida.";
          },
        }),
      },
      stopWhen: stepCountIs(5),
      onStepFinish(step) {
        trace.steps.push(traceStepFromResult(step));
      },
      onFinish({ text }) {
        trace.sources = referencedSources(text, memorySources);
      },
    });
    return tracedTextResponse(result.textStream, trace, onFinish);
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
