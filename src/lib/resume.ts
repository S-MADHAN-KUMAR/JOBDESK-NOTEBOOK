import { inflateSync } from "node:zlib";

/**
 * Minimal PDF text extractor — no external dependencies.
 * Handles the common case: PDFs with FlateDecode-compressed content streams
 * where text is drawn with Tj/TJ operators inside BT…ET blocks.
 *
 * Good enough for text-based resumes. Returns empty string for scanned PDFs.
 */
export function extractPdfText(buffer: Buffer): string {
  try {
    const raw = buffer.toString("latin1");
    const chunks: string[] = [];

    // Find all stream…endstream blocks.
    const streamRe = /stream\r?\n/g;
    let match: RegExpExecArray | null;

    while ((match = streamRe.exec(raw)) !== null) {
      const start = match.index + match[0].length;
      const end = raw.indexOf("endstream", start);
      if (end === -1) continue;

      const streamBuf = buffer.subarray(start, end);
      const decoded = tryDecode(streamBuf);
      if (decoded) chunks.push(decoded);
    }

    if (chunks.length === 0) return "";

    // Extract text from BT…ET blocks using Tj and TJ operators.
    const text: string[] = [];

    for (const chunk of chunks) {
      // BT … ET block
      const btEt = chunk.match(/BT([\s\S]*?)ET/g);
      if (!btEt) continue;

      for (const block of btEt) {
        // TJ array: [(A) -120 (B) 80 (C)] TJ
        const tjArrays = block.match(/\[([^\]]*)\]\s*TJ/g);
        if (tjArrays) {
          for (const arr of tjArrays) {
            const inner = arr.slice(1, arr.indexOf("]"));
            const strings = inner.match(/\((?:[^()\\]|\\.)*\)/g);
            if (strings) {
              for (const s of strings) {
                text.push(unescapePdfString(s.slice(1, -1)));
              }
            }
          }
        }

        // Tj: (text) Tj
        const tjs = block.match(/\((?:[^()\\]|\\.)*\)\s*Tj/g);
        if (tjs) {
          for (const t of tjs) {
            const inner = t.slice(1, t.indexOf(")"));
            text.push(unescapePdfString(inner));
          }
        }
      }
    }

    return text.join(" ").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

function tryDecode(buf: Buffer): string | null {
  // Try raw first (uncompressed streams).
  if (looksLikeText(buf)) return buf.toString("latin1");

  // Try FlateDecode (zlib).
  try {
    const inflated = inflateSync(buf);
    if (looksLikeText(inflated)) return inflated.toString("latin1");
  } catch {
    // not zlib
  }

  return null;
}

function looksLikeText(buf: Buffer): boolean {
  // Heuristic: if >70% of bytes are printable ASCII, treat as text.
  let printable = 0;
  const sample = Math.min(buf.length, 4096);
  for (let i = 0; i < sample; i++) {
    const b = buf[i];
    if (b >= 0x20 && b <= 0x7e) printable++;
    else if (b === 0x0a || b === 0x0d || b === 0x09) printable++;
  }
  return sample > 0 && printable / sample > 0.7;
}

function unescapePdfString(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    .replace(/\\(\d{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}
