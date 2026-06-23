import { requireAdmin } from "@/lib/auth";
import { jsonError, readJson } from "@/lib/api";
import { listBehaviorMemories, upsertBehaviorMemory } from "@/lib/db";
import { heuristicCuration } from "@/lib/ai/chat";

export const runtime = "nodejs";

type Body = {
  id?: string;
  content?: string;
};

export async function GET() {
  const user = await requireAdmin();
  return Response.json({ memories: await listBehaviorMemories(user.tenantId) });
}

export async function POST(request: Request) {
  const user = await requireAdmin();
  const body = await readJson<Body>(request);
  if (!body?.content?.trim()) return jsonError("Informe o comportamento.");
  const curated = heuristicCuration(body.content);
  const id = await upsertBehaviorMemory(user, {
    id: body.id,
    content: body.content.trim(),
    tags: curated.tags,
    summary: curated.summary,
  });
  return Response.json({ id });
}
