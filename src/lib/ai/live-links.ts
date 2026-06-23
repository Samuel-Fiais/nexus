import "server-only";

import {
  listLiveLinkExtractions,
  normalizeLiveLinkUrl,
  upsertLiveLinkExtraction,
  type LiveLinkExtractionRecord,
} from "@/lib/db";

const LIVE_LINK_TEXT_LIMIT = 30000;
const LIVE_LINK_FETCH_TIMEOUT_MS = 8000;

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/gi;

type LiveLinkFetchResult = {
  status: "success" | "failed";
  content: string;
  error: string | null;
};

export type ResolvedLiveLink = {
  url: string;
  status: "success" | "failed";
  content: string;
  error: string | null;
  fetchedAt: string;
};

function decodeHtmlEntities(value: string) {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\"",
  };

  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    const fromCodePoint = (codePoint: number) =>
      Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match;
    const lower = entity.toLowerCase();
    if (lower.startsWith("#x")) return fromCodePoint(Number.parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return fromCodePoint(Number.parseInt(lower.slice(1), 10));
    return namedEntities[lower] ?? match;
  });
}

export function normalizeExtractedText(value: string) {
  return decodeHtmlEntities(value)
    .replace(/\r/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, LIVE_LINK_TEXT_LIMIT);
}

export function extractUsefulTextFromHtml(html: string) {
  const text = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(article|aside|blockquote|br|dd|div|dl|dt|figcaption|figure|footer|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return normalizeExtractedText(text);
}

export function extractUrlsFromText(value: string) {
  const urls = new Set<string>();
  for (const match of value.matchAll(URL_PATTERN)) {
    const normalized = normalizeLiveLinkUrl(match[0]);
    if (normalized) urls.add(normalized);
  }
  return [...urls];
}

export function extractUrlsFromTexts(values: string[]) {
  const urls = new Set<string>();
  for (const value of values) {
    for (const url of extractUrlsFromText(value)) urls.add(url);
  }
  return [...urls];
}

async function fetchLiveLinkText(url: string): Promise<LiveLinkFetchResult> {
  const normalizedUrl = normalizeLiveLinkUrl(url);
  if (!normalizedUrl) {
    return { status: "failed", content: "", error: "URL inválida." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LIVE_LINK_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(normalizedUrl, {
      cache: "no-store",
      headers: {
        accept: "text/html, text/plain;q=0.9, */*;q=0.8",
        "user-agent": "NexusLiveExtract/1.0",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return { status: "failed", content: "", error: `HTTP ${response.status}` };
    }

    const contentType = response.headers.get("content-type") ?? "";
    const body = await response.text();
    const content = contentType.includes("text/html") || /<\/?[a-z][\s\S]*>/i.test(body)
      ? extractUsefulTextFromHtml(body)
      : normalizeExtractedText(body);

    if (!content) return { status: "failed", content: "", error: "Sem texto útil extraído." };
    return { status: "success", content, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao buscar URL.";
    return { status: "failed", content: "", error: message };
  } finally {
    clearTimeout(timeout);
  }
}

function resolvedFromRecord(record: LiveLinkExtractionRecord): ResolvedLiveLink {
  return {
    url: record.url,
    status: record.status,
    content: record.content,
    error: record.error,
    fetchedAt: record.fetchedAt,
  };
}

export async function resolveLiveLinksForConversation(conversationId: string, urls: string[]) {
  const normalizedUrls = [...new Set(urls.map((url) => normalizeLiveLinkUrl(url)).filter((url): url is string => !!url))];
  const cachedByUrl = new Map((await listLiveLinkExtractions(conversationId)).map((record) => [record.url, record]));
  const resolved = new Map<string, ResolvedLiveLink>();

  for (const url of normalizedUrls) {
    const cached = cachedByUrl.get(url);
    if (cached) {
      resolved.set(url, resolvedFromRecord(cached));
      continue;
    }

    const live = await fetchLiveLinkText(url);
    const stored = await upsertLiveLinkExtraction(conversationId, { url, ...live });
    resolved.set(
      url,
      stored
        ? resolvedFromRecord(stored)
        : {
            url,
            status: live.status,
            content: live.content,
            error: live.error,
            fetchedAt: new Date().toISOString(),
          },
    );
  }

  return resolved;
}
