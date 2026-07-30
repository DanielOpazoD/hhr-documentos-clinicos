import { requestOwner } from "@/app/lib/server/auth";
import { appEnv } from "@/app/lib/server/environment";
import { jsonError } from "@/app/lib/server/http";

export async function GET(request: Request) {
  if (!requestOwner(request)) return jsonError("Autenticación requerida.", 401);
  const runtime = appEnv();
  const clientId = runtime.GOOGLE_DRIVE_CLIENT_ID || process.env.GOOGLE_DRIVE_CLIENT_ID || "";
  const apiKey = runtime.GOOGLE_DRIVE_API_KEY || process.env.GOOGLE_DRIVE_API_KEY || "";
  const appId = runtime.GOOGLE_DRIVE_APP_ID || process.env.GOOGLE_DRIVE_APP_ID || "";
  const configured = Boolean(clientId && apiKey && appId);
  return Response.json({
    configured,
    ...(configured ? { clientId, apiKey, appId } : {}),
    scope: "https://www.googleapis.com/auth/drive.file",
  }, { headers: { "Cache-Control": "private, no-store" } });
}
