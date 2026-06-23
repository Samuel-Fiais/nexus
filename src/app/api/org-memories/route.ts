import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { requireAdmin } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { getTenant, insertOrgMemory, listOrgMemories, normalizeLiveLinkUrl, resolveProviderForUser } from "@/lib/db";
import { curateMemory } from "@/lib/ai/chat";

export const runtime = "nodejs";

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

function sourceType(value: FormDataEntryValue | null) {
  if (value === "markdown" || value === "link" || value === "pdf" || value === "image") return value;
  return "text";
}

async function fileContentFallback(file: File, storedPath: string) {
  if (file.type.startsWith("text/") || file.name.endsWith(".md")) {
    return file.text();
  }
  return `Arquivo armazenado: ${file.name}. Tipo: ${file.type || "desconhecido"}. Caminho: ${storedPath}. Conteúdo profundo não disponível sem dependências adicionais.`;
}

export async function GET() {
  const user = await requireAdmin();
  return Response.json({ memories: listOrgMemories(user.tenantId) });
}

export async function POST(request: Request) {
  const user = await requireAdmin();
  const form = await request.formData();
  const type = sourceType(form.get("sourceType"));
  const title = String(form.get("title") || "").trim();
  const text = String(form.get("content") || "").trim();
  const url = String(form.get("url") || "").trim();
  const file = form.get("file");

  if (!title) return jsonError("Informe o título.");

  let content = text;
  let filePath: string | null = null;
  let fileName: string | null = null;
  let mimeType: string | null = null;

  const normalizedUrl = type === "link" && url ? normalizeLiveLinkUrl(url) : null;

  if (type === "link" && url && !normalizedUrl) {
    return jsonError("Informe uma URL http(s) válida.");
  }

  if (type === "link" && normalizedUrl && !content) {
    content = `Link armazenado para consulta ao vivo no chat: ${normalizedUrl}`;
  }

  if (file instanceof File && file.size > 0) {
    await mkdir(UPLOAD_DIR, { recursive: true });
    fileName = file.name;
    mimeType = file.type || null;
    filePath = path.join(UPLOAD_DIR, `${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`);
    await writeFile(filePath, Buffer.from(await file.arrayBuffer()));
    if (!content) content = await fileContentFallback(file, filePath);
  }

  if (!content) return jsonError("Informe conteúdo, link ou arquivo.");

  const tenant = getTenant(user.tenantId);
  const provider = tenant ? resolveProviderForUser(user) : null;
  const curated = await curateMemory(content, provider);

  const id = insertOrgMemory(user, {
    title,
    sourceType: type,
    content,
    url: normalizedUrl ?? (url || null),
    filePath,
    fileName,
    mimeType,
    tags: curated.tags,
    summary: curated.summary,
  });

  return Response.json({ id });
}
