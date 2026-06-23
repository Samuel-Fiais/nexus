import { requireUser } from "@/lib/auth";
import { jsonError, readJson } from "@/lib/api";
import {
  createConversation,
  getConversation,
  getTenant,
  insertMessage,
  listBehaviorMemories,
  listMessages,
  listOrgMemories,
  listUserMemories,
  normalizeLiveLinkUrl,
  resolveProviderForUser,
  updateConversationAfterMessage,
  type OrgMemoryRecord,
} from "@/lib/db";
import { createChatStream, type ChatLiveLink, type ChatOrgMemory, type CoreMessage } from "@/lib/ai/chat";
import { extractUrlsFromTexts, resolveLiveLinksForConversation, type ResolvedLiveLink } from "@/lib/ai/live-links";

export const runtime = "nodejs";

type ChatBody = {
  conversationId?: string;
  content?: string;
  providerId?: string | null;
};

function withLiveLinkMemories(memories: OrgMemoryRecord[], resolvedLinks: Map<string, ResolvedLiveLink>): ChatOrgMemory[] {
  return memories.map((memory) => {
    const normalizedUrl = memory.url ? normalizeLiveLinkUrl(memory.url) : null;
    if (memory.sourceType !== "link" || !normalizedUrl) return memory;

    const live = resolvedLinks.get(normalizedUrl);
    if (live?.status === "success" && live.content) return { ...memory, liveContent: live.content };
    if (live?.status === "failed") return { ...memory, liveFetchFailed: true };
    return memory;
  });
}

function collectLiveLinkTexts(
  content: string,
  previousMessages: { content: string }[],
  orgMemories: OrgMemoryRecord[],
  userMemories: { content: string; summary: string; tags: string }[],
  behaviorMemories: { content: string; summary: string; tags: string }[],
) {
  return [
    content,
    ...previousMessages.map((message) => message.content),
    ...orgMemories.flatMap((memory) => [
      memory.url ?? "",
      memory.title,
      memory.tags,
      memory.summary,
      memory.content,
    ]),
    ...userMemories.flatMap((memory) => [memory.content, memory.summary, memory.tags]),
    ...behaviorMemories.flatMap((memory) => [memory.content, memory.summary, memory.tags]),
  ];
}

function liveLinksForPrompt(resolvedLinks: Map<string, ResolvedLiveLink>): ChatLiveLink[] {
  return [...resolvedLinks.values()].map((link) => ({
    url: link.url,
    content: link.content,
    status: link.status,
    error: link.error,
  }));
}

function relevantOrgMemories(memories: ChatOrgMemory[], query: string) {
  const terms = new Set(
    query
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .split(/\s+/)
      .filter((term) => term.length > 3),
  );

  return memories
    .map((memory) => {
      const sourceText = memory.sourceType === "link" && memory.liveContent ? memory.liveContent : `${memory.summary} ${memory.content}`;
      const haystack = `${memory.title} ${memory.tags} ${sourceText}`.toLowerCase();
      const score = Array.from(terms).reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { memory, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((item) => item.memory);
}

export async function POST(request: Request) {
  const user = await requireUser();
  const body = await readJson<ChatBody>(request);
  const content = body?.content?.trim();
  if (!content) return jsonError("Informe uma mensagem.");

  const tenant = await getTenant(user.tenantId);
  if (!tenant) return jsonError("Tenant não encontrado.", 404);

  let conversationId = body?.conversationId;
  if (!conversationId || !(await getConversation(user, conversationId))) {
    conversationId = await createConversation(user);
  }

  const previousMessages = await listMessages(user, conversationId);
  const title = previousMessages.length === 0 ? content.slice(0, 60) : undefined;
  await insertMessage(conversationId, "user", content);
  await updateConversationAfterMessage(conversationId, title);

  const provider = await resolveProviderForUser(user, body?.providerId ?? null);
  const userMemories = await listUserMemories(user, user.id);
  const behaviorMemories = await listBehaviorMemories(user.tenantId);
  const allOrgMemories = await listOrgMemories(user.tenantId);
  const liveLinkUrls = extractUrlsFromTexts(collectLiveLinkTexts(content, previousMessages, allOrgMemories, userMemories, behaviorMemories));
  const resolvedLinks = await resolveLiveLinksForConversation(conversationId, liveLinkUrls);
  const orgMemories = relevantOrgMemories(withLiveLinkMemories(allOrgMemories, resolvedLinks), content);
  const messages: CoreMessage[] = [
    ...previousMessages
      .filter((message) => message.role !== "system")
      .map((message) => ({ role: message.role as "user" | "assistant", content: message.content })),
    { role: "user", content },
  ];

  const response = createChatStream(
    messages,
    { tenant, provider, user, orgMemories, userMemories, behaviorMemories, liveLinks: liveLinksForPrompt(resolvedLinks) },
    async (assistantText) => {
      await insertMessage(conversationId, "assistant", assistantText);
      await updateConversationAfterMessage(conversationId);
    },
  );
  response.headers.set("x-conversation-id", conversationId);
  response.headers.set("x-provider-label", encodeURIComponent(provider ? `${provider.modelAlias || provider.name} / ${provider.model}` : "Sem modelo configurado"));
  return response;
}
