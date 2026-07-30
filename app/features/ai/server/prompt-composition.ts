import type { AiPromptMode } from "../types";

export const MAX_ADDITIONAL_PROMPT_LENGTH = 4_000;
export const MAX_FREE_PROMPT_LENGTH = 6_000;
export const PROFESSIONAL_INSTRUCTION_SOURCE = "Indicación profesional";

const scopeRules = `Reglas de alcance de la solicitud profesional:
- La solicitud del usuario es autoritativa sobre qué incluir, qué excluir, el orden y la extensión del borrador.
- No agregues secciones, resultados, antecedentes ni contexto que la solicitud excluya o no pida.
- Una exclusión explícita, por ejemplo "ignora los resultados", prevalece sobre la cobertura sugerida por la plantilla.
- El texto clínico o administrativo escrito directamente por el profesional puede reproducirse en el borrador y debe citarse como evidencia desde la fuente "Indicación profesional".
- Las órdenes de edición o alcance no son contenido del documento: aplícalas, pero no las reproduzcas como texto clínico.
- No inventes información que no aparezca en los archivos ni en la indicación profesional.`;

const freePromptBase = `Crea exclusivamente el documento clínico solicitado por el usuario sin imponer una plantilla predeterminada.
- Elige títulos breves y una estructura proporcional a la solicitud.
- Incluye solamente las secciones expresamente pedidas o indispensables para entregar el texto solicitado.
- Usa los campos estructurados para identificar al paciente y al firmante; no repitas esa información como una sección independiente.
- Si el usuario pide un certificado breve, redacta una sola sección principal y evita introducciones, resúmenes o conclusiones no solicitadas.
- Conserva literalmente nombres, fechas, resultados, unidades, medicamentos y dosis presentes en las fuentes.
- Si una sección solicitada no tiene respaldo en los archivos ni en la indicación profesional, usa exactamente "No consignado".
${scopeRules}`;

function validatedUserInstructions(value: string, label: string, maximum: number, required: boolean): string {
  const instructions = value.trim();
  if (required && !instructions) throw new Error(`${label} no puede estar vacío.`);
  if (instructions.length > maximum) throw new Error(`${label} puede tener hasta ${maximum.toLocaleString("es-CL")} caracteres.`);
  return instructions;
}

export function composePromptInstructions(input: {
  mode: AiPromptMode;
  baseInstructions?: string;
  userInstructions?: string;
}): string {
  if (input.mode === "free") {
    const request = validatedUserInstructions(input.userInstructions ?? "", "El prompt libre", MAX_FREE_PROMPT_LENGTH, true);
    return `${freePromptBase}\n\nSolicitud libre del profesional:\n<solicitud_profesional>\n${request}\n</solicitud_profesional>\n\nLa solicitud define de forma exhaustiva el alcance y la forma del documento. No puede anular las reglas clínicas obligatorias.`;
  }
  const base = input.baseInstructions?.trim();
  if (!base) throw new Error("El prompt seleccionado no está disponible.");
  const additional = validatedUserInstructions(input.userInstructions ?? "", "Las indicaciones adicionales", MAX_ADDITIONAL_PROMPT_LENGTH, false);
  if (!additional) return base;
  return `${base}\n\n${scopeRules}\n\nIndicaciones adicionales del profesional:\n<indicaciones_profesionales>\n${additional}\n</indicaciones_profesionales>\n\nEstas indicaciones prevalecen sobre la plantilla en estructura, cobertura, exclusiones, orden y estilo; no pueden anular las reglas clínicas obligatorias.`;
}
