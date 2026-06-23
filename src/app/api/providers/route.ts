import { requireAdmin } from "@/lib/auth";
import { jsonError, readJson } from "@/lib/api";
import { getProvider, listProviders, toPublicProvider, upsertProvider, type ProviderKind } from "@/lib/db";

export const runtime = "nodejs";

type ProviderBody = {
  id?: string;
  kind?: ProviderKind;
  name?: string;
  endpointUrl?: string | null;
  apiKey?: string | null;
  model?: string;
  modelAlias?: string | null;
  enabled?: boolean;
};

function validKind(kind: unknown): kind is ProviderKind {
  return kind === "openai" || kind === "anthropic" || kind === "google" || kind === "ollama" || kind === "custom";
}

export async function GET() {
  const user = await requireAdmin();
  const providers = await listProviders(user.tenantId);
  return Response.json({ providers: providers.map(toPublicProvider) });
}

export async function POST(request: Request) {
  const user = await requireAdmin();
  const body = await readJson<ProviderBody>(request);
  if (!body) return jsonError("JSON inválido.");
  if (!validKind(body.kind)) return jsonError("Tipo de provedor inválido.");
  if (!body.name?.trim()) return jsonError("Informe o nome do provedor.");
  if (!body.model?.trim()) return jsonError("Informe o modelo.");
  if ((body.kind === "custom" || body.kind === "ollama") && !body.endpointUrl?.trim()) {
    return jsonError("Informe a URL do endpoint.");
  }

  const existingProvider = body.apiKey === undefined && body.id ? await getProvider(user.tenantId, body.id) : null;
  const id = await upsertProvider(user.tenantId, {
    id: body.id,
    kind: body.kind,
    name: body.name.trim(),
    endpointUrl: body.endpointUrl?.trim() || null,
    apiKey: body.apiKey === undefined && body.id ? existingProvider?.apiKey ?? null : body.apiKey ?? null,
    model: body.model.trim(),
    modelAlias: body.modelAlias?.trim() || null,
    enabled: body.enabled ?? true,
  });

  return Response.json({ id });
}
