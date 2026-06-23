import { requireAdmin } from "@/lib/auth";
import { deleteBehaviorMemory } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await context.params;
  deleteBehaviorMemory(user, id);
  return Response.json({ ok: true });
}
