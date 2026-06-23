import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { requireAdmin } from "@/lib/auth";
import { jsonError, readJson } from "@/lib/api";
import { getTenant, insertOrgMemory, listOrgMemories, normalizeLiveLinkUrl, resolveProviderForUser } from "@/lib/db";
import { curateMemory } from "@/lib/ai/chat";

export const runtime = "nodejs";

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

type OrgMemoryBody = {
  title?: string;
  sourceType?: string;
  content?: string;
  url?: string | null;
};

export async function GET() {
  const user = await requireAdmin();
  return Response.json({ memories: listOrgMemories(user.tenantId) });
}

export async function POST(request: Request) {
  const user = await requireAdmin();
  const contentType = request.headers.get("content-type") || "";

  let title: string;
  let sourceType: string;
  let content: string;
  let url: string | null = null;
  let filePath: string | null = null;
  let fileName: string | null = null;
  let mimeType: string | null = null;

  if (contentType.includes("json")) {
    const body = await readJson<OrgMemoryBody>(request);
    if (!body) return jsonError("JSON inválido.");
    title = (body.title || "").trim();
    sourceType = body.sourceType || "text";
    content = (body.content || "").trim();
    url = body.url?.trim() || null;
  } else {
    const form = await request.formData();
    sourceType = form.get("sourceType") === "link" || form.get("sourceType") === "pdf" || form.get("sourceType") === "image"
      ? String(form.get("sourceType"))
      : "text";
    title = String(form.get("title") || "").trim();
    content = String(form.get("content") || "").trim();
    url = String(form.get("url") || "").trim() || null;

    const file = form.get("file");
    if (file instanceof File && file.size > 0) {
      await mkdir(UPLOAD_DIR, { recursive: true });
      fileName = file.name;
      mimeType = file.type || null;
      filePath = path.join(UPLOAD_DIR, `${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`);
      await writeFile(filePath, Buffer.from(await file.arrayBuffer()));
      if (!content) {
        content = file.type.startsWith("text/") || file.name.endsWith(".md")
          ? await file.text()
          : `Arquivo armazenado: ${file.name}. Tipo: ${file.type || "desconhecido"}. Caminho: ${filePath}.`;
      }
    }
  }

  if (!title) return jsonError("Informe o título.");
  const normalizedUrl = sourceType === "link" && url ? normalizeLiveLinkUrl(url) : null;
  if (sourceType === "link" && url && !normalizedUrl) {
    return jsonError("Informe uma URL http(s) válida.");
  }
  if (sourceType === "link" && normalizedUrl && !content) {
    content = `Link armazenado para consulta ao vivo no chat: ${normalizedUrl}`;
  }
  if (!content) return jsonError("Informe conteúdo, link ou arquivo.");

  const tenant = getTenant(user.tenantId);
  const provider = tenant ? resolveProviderForUser(user) : null;
  const curated = await curateMemory(content, provider);

  const id = insertOrgMemory(user, {
    title,
    sourceType: sourceType as "text" | "link" | "pdf" | "image",
    content,
    url: normalizedUrl ?? url,
    filePath,
    fileName,
    mimeType,
    tags: curated.tags,
    summary: curated.summary,
  });

  return Response.json({ id });
}
