import type { AiPromptInput } from "../prompt-types";
import { isAiTarget } from "./prompt";

export function validatePromptInput(body: Record<string, unknown>): AiPromptInput {
  const name = String(body.name ?? "").trim().replace(/\s+/g, " ");
  const target = String(body.target ?? "");
  const instructions = String(body.instructions ?? "").trim();
  if (name.length < 3 || name.length > 80) throw new Error("El nombre debe tener entre 3 y 80 caracteres.");
  if (!isAiTarget(target)) throw new Error("Seleccione un tipo de documento válido.");
  if (instructions.length < 20 || instructions.length > 8_000) throw new Error("Las instrucciones deben tener entre 20 y 8.000 caracteres.");
  return { name, target, instructions, makeDefault: body.makeDefault === true };
}
