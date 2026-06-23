import { SettingsForm } from "@/components/settings-form";
import { requireUser } from "@/lib/auth";
import {
  getTenant,
  listBehaviorMemories,
  listOrgMemories,
  listProviders,
  listUserMemories,
  listUsers,
  toPublicProvider,
} from "@/lib/db";

export default async function SettingsPage() {
  const user = await requireUser();
  const tenant = await getTenant(user.tenantId);

  return (
    <SettingsForm
      user={user}
      tenant={tenant}
      users={user.role === "admin" ? await listUsers(user.tenantId) : []}
      providers={user.role === "admin" ? (await listProviders(user.tenantId)).map(toPublicProvider) : []}
      userMemories={await listUserMemories(user)}
      orgMemories={user.role === "admin" ? await listOrgMemories(user.tenantId) : []}
      behaviorMemories={user.role === "admin" ? await listBehaviorMemories(user.tenantId) : []}
    />
  );
}
