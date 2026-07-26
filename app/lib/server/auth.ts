export function requestOwner(request: Request): string | null {
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (email) return email;
  const host = new URL(request.url).hostname;
  return host === "localhost" || host === "127.0.0.1"
    ? "preview@hhr.local"
    : null;
}
