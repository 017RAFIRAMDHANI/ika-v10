export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}

export function jsonError(message: string, status = 400) {
  return Response.json({ ok: false, message }, { status });
}
