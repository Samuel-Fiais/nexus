import { requireUser } from "@/lib/auth";
import { deleteConversation, getConversation, listMessages } from "@/lib/db";
import { jsonError } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await context.params;
  const conversation = getConversation(user, id);
  if (!conversation) return jsonError("Conversa não encontrada.", 404);
  return Response.json({ conversation, messages: listMessages(user, id) });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await context.params;
  deleteConversation(user, id);
  return Response.json({ ok: true });
}
