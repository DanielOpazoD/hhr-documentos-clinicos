import type { DocumentSection, DocumentTemplateSetting } from "./types";
import { createSections, getTemplate, normalizeTemplateId } from "./templates";

export function defaultTemplateSetting(templateId: string): DocumentTemplateSetting {
  const normalizedId = normalizeTemplateId(templateId);
  return {
    templateId: normalizedId,
    title: getTemplate(normalizedId).name,
    sections: createSections(normalizedId).map(({ id, title }) => ({ id, title })),
    promptId: null,
  };
}

export function sectionsFromTemplateSetting(setting: DocumentTemplateSetting): DocumentSection[] {
  const defaults = new Map(createSections(setting.templateId).map((section) => [section.id, section.body]));
  return setting.sections.map((section) => ({ ...section, body: defaults.get(section.id) ?? "" }));
}

export function templateSettingFor(
  settings: DocumentTemplateSetting[],
  templateId: string,
): DocumentTemplateSetting {
  return settings.find((item) => item.templateId === normalizeTemplateId(templateId))
    ?? defaultTemplateSetting(templateId);
}
