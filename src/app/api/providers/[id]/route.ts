import { requireAdmin } from "@/lib/auth";
import { deleteProvider } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await context.params;
  await deleteProvider(user.tenantId, id);
  return Response.json({ ok: true });
}
