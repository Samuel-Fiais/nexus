import { requireAdmin } from "@/lib/auth";
import { jsonError, readJson } from "@/lib/api";
import { listProviders, updateUserModelOverride } from "@/lib/db";

export const runtime = "nodejs";

type Body = {
  providerId?: string | null;
};

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await context.params;
  const body = await readJson<Body>(request);
  if (!body) return jsonError("JSON inválido.");
  const providerId = body.providerId || null;
  if (providerId && !listProviders(user.tenantId).some((provider) => provider.id === providerId)) {
    return jsonError("Modelo inválido.");
  }
  updateUserModelOverride(user.tenantId, id, providerId);
  return Response.json({ ok: true });
}
