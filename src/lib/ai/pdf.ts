import "server-only";

import { extractText } from "unpdf";

function toUint8Array(buffer: Uint8Array | Buffer | ArrayBuffer): Uint8Array {
  if (buffer instanceof Uint8Array && !Buffer.isBuffer(buffer)) return buffer;
  const copy = new Uint8Array(buffer.byteLength);
  if (ArrayBuffer.isView(buffer)) {
    copy.set(buffer as Uint8Array);
  } else {
    copy.set(new Uint8Array(buffer));
  }
  return copy;
}

export async function extractPDFText(buffer: Uint8Array | Buffer | ArrayBuffer): Promise<string | null> {
  try {
    const result = (await extractText(toUint8Array(buffer))) as { totalPages: number; text: string[] };
    const text = Array.isArray(result.text) ? result.text.join("\n") : "";
    const cleaned = text.replace(/\s+/g, " ").trim();
    return cleaned.length > 0 ? cleaned : null;
  } catch {
    return null;
  }
}
