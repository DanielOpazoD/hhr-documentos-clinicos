import { getAiProviders } from "@/app/features/ai/server/providers";
import { requestOwner } from "@/app/lib/server/auth";
import { jsonError } from "@/app/lib/server/http";

export async function GET(request: Request) {
  if (!requestOwner(request)) return jsonError("Autenticación requerida.", 401);
  return Response.json({ providers: await getAiProviders() });
}
