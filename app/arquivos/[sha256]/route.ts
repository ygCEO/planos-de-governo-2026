import { env } from "cloudflare:workers";

type Params = { params: Promise<{ sha256: string }> };

function responseHeaders(object: R2Object) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", "application/pdf");
  headers.set("content-disposition", `inline; filename="plano-${object.key.slice(4, 16)}.pdf"`);
  headers.set("content-length", String(object.size));
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("x-content-type-options", "nosniff");
  headers.set("etag", object.httpEtag);
  return headers;
}

export async function GET(_request: Request, { params }: Params) {
  const { sha256 } = await params;
  if (!/^[a-f0-9]{64}$/i.test(sha256)) {
    return new Response("Identificador de arquivo inválido", { status: 400 });
  }

  const archive = (env as unknown as { PDF_ARCHIVE?: R2Bucket }).PDF_ARCHIVE;
  if (!archive) {
    return new Response("Arquivo ainda não disponível", { status: 503 });
  }

  const object = await archive.get(`pdf/${sha256.toLowerCase()}.pdf`);
  if (!object) return new Response("Arquivo não encontrado", { status: 404 });

  return new Response(object.body, { headers: responseHeaders(object) });
}

export async function HEAD(_request: Request, { params }: Params) {
  const { sha256 } = await params;
  if (!/^[a-f0-9]{64}$/i.test(sha256)) return new Response(null, { status: 400 });
  const archive = (env as unknown as { PDF_ARCHIVE?: R2Bucket }).PDF_ARCHIVE;
  if (!archive) return new Response(null, { status: 503 });
  const object = await archive.head(`pdf/${sha256.toLowerCase()}.pdf`);
  if (!object) return new Response(null, { status: 404 });
  return new Response(null, { headers: responseHeaders(object) });
}
