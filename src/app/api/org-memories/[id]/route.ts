import { requireAdmin } from "@/lib/auth";
import { deleteOrgMemory } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await context.params;
  deleteOrgMemory(user, id);
  return Response.json({ ok: true });
}
