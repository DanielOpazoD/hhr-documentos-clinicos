import { headers } from "next/headers";
import { requireChatGPTUser, type ChatGPTUser } from "../chatgpt-auth";

export async function requireSiteUser(returnTo: string): Promise<ChatGPTUser> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "";
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
    return { displayName: "Dra. Valentina Rojas", email: "preview@hhr.local", fullName: "Dra. Valentina Rojas" };
  }
  return requireChatGPTUser(returnTo);
}
