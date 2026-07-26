import { builtInPrompt, builtInPromptById, builtInPromptProfiles } from "../prompt-catalog";
import type { AiPromptProfile } from "../prompt-types";
import type { AiTargetId } from "../types";
import { ensureDatabase } from "@/app/lib/server/database";

type PromptRow = {
  id: string;
  name: string;
  target: AiTargetId;
  instructions: string;
  revision: number;
  isDefault: number;
  createdAt: string;
  updatedAt: string;
};

const selectColumns = `id, name, target_type AS target, instructions, revision,
  is_default AS isDefault, created_at AS createdAt, updated_at AS updatedAt`;

function fromRow(row: PromptRow): AiPromptProfile {
  return { ...row, isDefault: Boolean(row.isDefault), builtIn: false };
}

export async function listPromptProfiles(owner: string): Promise<AiPromptProfile[]> {
  const db = await ensureDatabase();
  const custom = await db.prepare(
    `SELECT ${selectColumns} FROM ai_prompts WHERE owner_email = ? ORDER BY target_type, is_default DESC, updated_at DESC LIMIT 100`,
  ).bind(owner).all<PromptRow>();
  const customProfiles = custom.results.map((row: PromptRow) => fromRow(row));
  return builtInPromptProfiles.map((profile) => ({
    ...profile,
    isDefault: !customProfiles.some((item) => item.target === profile.target && item.isDefault),
  })).concat(customProfiles);
}

export async function resolvePromptProfile(owner: string, target: AiTargetId, id?: string): Promise<AiPromptProfile> {
  if (id) {
    const builtIn = builtInPromptById(id);
    if (builtIn) {
      if (builtIn.target !== target) throw new Error("El prompt seleccionado no corresponde al tipo de documento.");
      return builtIn;
    }
  }
  const db = await ensureDatabase();
  const row = id
    ? await db.prepare(`SELECT ${selectColumns} FROM ai_prompts WHERE id = ? AND owner_email = ?`).bind(id, owner).first<PromptRow>()
    : await db.prepare(`SELECT ${selectColumns} FROM ai_prompts WHERE owner_email = ? AND target_type = ? AND is_default = 1 LIMIT 1`).bind(owner, target).first<PromptRow>();
  if (row) {
    const profile = fromRow(row);
    if (profile.target !== target) throw new Error("El prompt seleccionado no corresponde al tipo de documento.");
    return profile;
  }
  if (id) throw new Error("El prompt seleccionado ya no está disponible.");
  return builtInPrompt(target);
}
