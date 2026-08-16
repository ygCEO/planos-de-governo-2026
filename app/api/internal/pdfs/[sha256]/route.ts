import { env } from "cloudflare:workers";

type Params = { params: Promise<{ sha256: string }> };

const MAX_PDF_BYTES = 25 * 1024 * 1024;

function constantTimeEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

function hasPdfEnvelope(bytes: Uint8Array) {
  const decoder = new TextDecoder("latin1");
  const header = decoder.decode(bytes.slice(0, Math.min(bytes.length, 1024)));
  const trailer = decoder.decode(bytes.slice(Math.max(0, bytes.length - 4096)));
  return /%PDF-\d\.\d/.test(header) && /%%EOF[\s\0]*$/.test(trailer);
}

async function sha256Hex(bytes: Uint8Array) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(request: Request, { params }: Params) {
  const { sha256: rawSha256 } = await params;
  const sha256 = rawSha256.toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256)) return json({ error: "Identificador inválido" }, 400);

  const runtime = env as unknown as { PDF_ARCHIVE?: R2Bucket; PDF_UPLOAD_TOKEN?: string };
  if (!runtime.PDF_ARCHIVE || !runtime.PDF_UPLOAD_TOKEN) {
    return json({ error: "Preservação não configurada" }, 503);
  }
  const authorization = request.headers.get("authorization") ?? "";
  const suppliedToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!constantTimeEqual(suppliedToken, runtime.PDF_UPLOAD_TOKEN)) {
    return json({ error: "Não autorizado" }, 401);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_PDF_BYTES) return json({ error: "Arquivo excede o limite" }, 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_PDF_BYTES) return json({ error: "Tamanho inválido" }, 413);
  if (!hasPdfEnvelope(bytes)) return json({ error: "PDF malformado" }, 422);

  const digest = await sha256Hex(bytes);
  if (!constantTimeEqual(digest, sha256)) return json({ error: "SHA-256 divergente" }, 409);

  const objectKey = `pdf/${sha256}.pdf`;
  const existing = await runtime.PDF_ARCHIVE.head(objectKey);
  if (existing) {
    const stored = await runtime.PDF_ARCHIVE.get(objectKey);
    const storedDigest = stored ? await sha256Hex(new Uint8Array(await stored.arrayBuffer())) : null;
    if (existing.size !== bytes.length || storedDigest !== sha256) {
      return json({ error: "Chave imutável já contém outro objeto" }, 409);
    }
    return json({ sha256, byteSize: existing.size, objectKey, status: "already_preserved" });
  }

  await runtime.PDF_ARCHIVE.put(objectKey, bytes, {
    httpMetadata: { contentType: "application/pdf", cacheControl: "public, max-age=31536000, immutable" },
    customMetadata: { sha256 },
  });
  const stored = await runtime.PDF_ARCHIVE.head(objectKey);
  if (!stored || stored.size !== bytes.length) return json({ error: "Falha na verificação pós-envio" }, 500);
  return json({ sha256, byteSize: stored.size, objectKey, status: "preserved" }, 201);
}
