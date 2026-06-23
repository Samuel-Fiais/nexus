import { requireUser } from "@/lib/auth";
import { jsonError, readJson } from "@/lib/api";
import { listUserMemories, upsertUserMemory, type MemoryType } from "@/lib/db";

export const runtime = "nodejs";

type Body = {
  id?: string;
  userId?: string;
  type?: MemoryType;
  content?: string;
  tags?: string;
  summary?: string;
};

function validType(type: unknown): type is MemoryType {
  return type === "fact" || type === "preference" || type === "decision";
}

export async function GET() {
  const user = await requireUser();
  return Response.json({ memories: await listUserMemories(user) });
}

export async function POST(request: Request) {
  const user = await requireUser();
  const body = await readJson<Body>(request);
  if (!body) return jsonError("JSON inválido.");
  if (!validType(body.type)) return jsonError("Tipo de memória inválido.");
  if (!body.content?.trim()) return jsonError("Informe o conteúdo da memória.");

  const id = await upsertUserMemory(user, {
    id: body.id,
    userId: body.userId,
    type: body.type,
    content: body.content.trim(),
    tags: body.tags ?? "",
    summary: body.summary ?? "",
  });
  if (!id) return jsonError("Sem permissão para editar esta memória.", 403);
  return Response.json({ id });
}
