import { ChatWorkspace } from "@/components/chat-workspace";
import { requireUser } from "@/lib/auth";
import {
  getTenant,
  listConversations,
  listMessages,
  listProviders,
  resolveProviderForUser,
  toPublicProvider,
} from "@/lib/db";

export default async function Home() {
  const user = await requireUser();
  const tenant = await getTenant(user.tenantId);
  const conversations = await listConversations(user);
  const activeConversation = conversations[0] ?? null;
  const providers = (await listProviders(user.tenantId)).map(toPublicProvider);
  const resolvedProvider = await resolveProviderForUser(user);

  return (
    <ChatWorkspace
      user={user}
      tenantName={tenant?.name ?? user.tenantName}
      providers={providers}
      resolvedProvider={resolvedProvider ? toPublicProvider(resolvedProvider) : null}
      conversations={conversations}
      initialConversationId={activeConversation?.id ?? ""}
      initialMessages={activeConversation ? await listMessages(user, activeConversation.id) : []}
    />
  );
}
