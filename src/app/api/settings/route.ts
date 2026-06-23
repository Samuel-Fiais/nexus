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
  const tenant = getTenant(user.tenantId);
  if (!tenant) return jsonError("Tenant não encontrado.", 404);

  return Response.json({
    user,
    tenant,
    users: user.role === "admin" ? listUsers(user.tenantId) : [],
    providers: user.role === "admin" ? listProviders(user.tenantId).map(toPublicProvider) : [],
    userMemories: listUserMemories(user),
    orgMemories: user.role === "admin" ? listOrgMemories(user.tenantId) : [],
    behaviorMemories: user.role === "admin" ? listBehaviorMemories(user.tenantId) : [],
  });
}

export async function PUT(request: Request) {
  const user = await requireAdmin();
  const body = await readJson<SettingsBody>(request);
  if (!body) return jsonError("JSON inválido.");

  const defaultProviderId = body.defaultProviderId || null;
  if (defaultProviderId && !listProviders(user.tenantId).some((provider) => provider.id === defaultProviderId)) {
    return jsonError("Modelo padrão inválido.");
  }

  setTenantSettings(user.tenantId, {
    soul: body.soul ?? "",
    generalBehavior: body.generalBehavior ?? "",
    defaultProviderId,
  });
  return Response.json({ ok: true });
}
