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
  const tenant = getTenant(user.tenantId);

  return (
    <SettingsForm
      user={user}
      tenant={tenant}
      users={user.role === "admin" ? listUsers(user.tenantId) : []}
      providers={user.role === "admin" ? listProviders(user.tenantId).map(toPublicProvider) : []}
      userMemories={listUserMemories(user)}
      orgMemories={user.role === "admin" ? listOrgMemories(user.tenantId) : []}
      behaviorMemories={user.role === "admin" ? listBehaviorMemories(user.tenantId) : []}
    />
  );
}
