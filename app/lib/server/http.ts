export function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}
