import type { AiTargetId } from "./types";

export type AiPromptProfile = {
  id: string;
  name: string;
  target: AiTargetId;
  instructions: string;
  revision: number;
  isDefault: boolean;
  builtIn: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AiPromptInput = {
  name: string;
  target: AiTargetId;
  instructions: string;
  makeDefault?: boolean;
};

export type AiPromptImprovement = {
  name: string;
  instructions: string;
  summary: string;
};
