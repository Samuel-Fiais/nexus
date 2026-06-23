import { requireAdmin } from "@/lib/auth";
import { jsonError, readJson } from "@/lib/api";

export const runtime = "nodejs";

type OllamaBody = {
  endpointUrl?: string;
  apiKey?: string | null;
};

function normalizeEndpoint(endpoint: string) {
  return endpoint.replace(/\/+$/, "").replace(/\/v1$/, "");
}

async function getJson(url: string, apiKey?: string | null) {
  const response = await fetch(url, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

export async function POST(request: Request) {
  await requireAdmin();
  const body = await readJson<OllamaBody>(request);
  if (!body?.endpointUrl) return jsonError("Informe a URL do Ollama.");

  const endpoint = normalizeEndpoint(body.endpointUrl);
  try {
    const tags = await getJson(`${endpoint}/api/tags`, body.apiKey);
    const models = Array.isArray((tags as { models?: unknown }).models)
      ? ((tags as { models: Array<{ name?: unknown; model?: unknown }> }).models)
          .map((model) => (typeof model.name === "string" ? model.name : typeof model.model === "string" ? model.model : ""))
          .filter(Boolean)
      : [];
    return Response.json({ models });
  } catch {
    try {
      const data = await getJson(`${endpoint}/v1/models`, body.apiKey);
      const models = Array.isArray((data as { data?: unknown }).data)
        ? ((data as { data: Array<{ id?: unknown }> }).data)
            .map((model) => (typeof model.id === "string" ? model.id : ""))
            .filter(Boolean)
        : [];
      return Response.json({ models });
    } catch {
      return jsonError("Não foi possível buscar modelos em /api/tags nem /v1/models.", 502);
    }
  }
}
