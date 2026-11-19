export function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function streamResponse(upstream: Response, filename?: string, contentType?: string): Response {
  const headers = new Headers();
  headers.set("content-type", contentType ?? upstream.headers.get("content-type") ?? "application/octet-stream");
  const length = upstream.headers.get("content-length");
  if (length) headers.set("content-length", length);
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  if (filename) headers.set("content-disposition", contentDisposition(filename));
  return new Response(upstream.body, { status: 200, headers });
}
