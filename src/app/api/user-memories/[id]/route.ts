import { requireUser } from "@/lib/auth";
import { deleteUserMemory } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await context.params;
  deleteUserMemory(user, id);
  return Response.json({ ok: true });
}
