import { getAiProviders } from "@/app/features/ai/server/providers";
import { requestOwner } from "@/app/lib/server/auth";
import { jsonError, observeApi } from "@/app/lib/server/http";

async function getProviders(request: Request) {
  if (!requestOwner(request)) return jsonError("Autenticación requerida.", 401);
  return Response.json({ providers: await getAiProviders() });
}

export const GET = observeApi("ai.providers.GET", getProviders);
