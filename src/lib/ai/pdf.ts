import "server-only";

import { extractText } from "unpdf";

export async function extractPDFText(buffer: Uint8Array | Buffer | ArrayBuffer): Promise<string | null> {
  try {
    const result = (await extractText(buffer)) as { totalPages: number; text: string[] };
    const text = Array.isArray(result.text) ? result.text.join("\n") : "";
    const cleaned = text.replace(/\s+/g, " ").trim();
    return cleaned.length > 0 ? cleaned : null;
  } catch {
    return null;
  }
}
