import { requireAdmin, requireUser } from "@/lib/auth";
import { jsonError, readJson } from "@/lib/api";
import {
  getTenant,
  listBehaviorMemories,
  listOrgMemories,
  listProviders,
  listUserMemories,
  listUsers,
  setTenantSettings,
  toPublicProvider,
} from "@/lib/db";

export const runtime = "nodejs";

type SettingsBody = {
  soul?: string;
  generalBehavior?: string;
  defaultProviderId?: string | null;
};

export async function GET() {
  const user = await requireUser();
  const tenant = await getTenant(user.tenantId);
  if (!tenant) return jsonError("Tenant não encontrado.", 404);
  const providers = user.role === "admin" ? await listProviders(user.tenantId) : [];

  return Response.json({
    user,
    tenant,
    users: user.role === "admin" ? await listUsers(user.tenantId) : [],
    providers: providers.map(toPublicProvider),
    userMemories: await listUserMemories(user),
    orgMemories: user.role === "admin" ? await listOrgMemories(user.tenantId) : [],
    behaviorMemories: user.role === "admin" ? await listBehaviorMemories(user.tenantId) : [],
  });
}

export async function PUT(request: Request) {
  const user = await requireAdmin();
  const body = await readJson<SettingsBody>(request);
  if (!body) return jsonError("JSON inválido.");

  const defaultProviderId = body.defaultProviderId || null;
  const providers = await listProviders(user.tenantId);
  if (defaultProviderId && !providers.some((provider) => provider.id === defaultProviderId)) {
    return jsonError("Modelo padrão inválido.");
  }

  await setTenantSettings(user.tenantId, {
    soul: body.soul ?? "",
    generalBehavior: body.generalBehavior ?? "",
    defaultProviderId,
  });
  return Response.json({ ok: true });
}
