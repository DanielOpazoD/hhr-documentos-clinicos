"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { listDocumentTemplateSettings, saveDocumentTemplateSetting } from "./api";
import { defaultTemplateSetting, templateSettingFor } from "./template-settings";
import type { DocumentSection, DocumentTemplateSetting } from "./types";

function definitionDiffers(left: DocumentTemplateSetting, right: DocumentTemplateSetting) {
  return left.title !== right.title || JSON.stringify(left.sections) !== JSON.stringify(right.sections);
}

function retainedSections(sections: DocumentSection[], configuredIds: Set<string>, previousTitles: Map<string, string>) {
  return sections.filter((section) => !configuredIds.has(section.id)
    && (section.body.trim() || section.title !== previousTitles.get(section.id)));
}

export function useTemplateSettings({ documentId, markDirty, openedDocumentRef, setDocumentTitle, setSections, templateId, workspaceEpoch }: {
  documentId: string | null;
  markDirty: () => void;
  openedDocumentRef: MutableRefObject<boolean>;
  setDocumentTitle: Dispatch<SetStateAction<string>>;
  setSections: Dispatch<SetStateAction<DocumentSection[]>>;
  templateId: string;
  workspaceEpoch: MutableRefObject<number>;
}) {
  const [templateSettings, setTemplateSettings] = useState<DocumentTemplateSetting[] | null>(null);
  const [templateSettingsBusy, setTemplateSettingsBusy] = useState(false);
  const [templateSettingsError, setTemplateSettingsError] = useState<string | null>(null);
  const [loadRevision, setLoadRevision] = useState(0);
  const appliedTemplateRef = useRef("");
  const activeTemplateSetting = useMemo(() => templateSettingFor(templateSettings ?? [], templateId), [templateId, templateSettings]);

  useEffect(() => {
    const controller = new AbortController();
    void listDocumentTemplateSettings(controller.signal).then((items) => {
      if (controller.signal.aborted) return;
      setTemplateSettings(items);
    }).catch((error) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setTemplateSettingsError(error instanceof Error ? error.message : "No se pudieron cargar las plantillas.");
      }
    });
    return () => controller.abort();
  }, [loadRevision]);

  useEffect(() => {
    if (!templateSettings || openedDocumentRef.current) return;
    const applicationKey = `${workspaceEpoch.current}:${templateId}`;
    if (appliedTemplateRef.current === applicationKey) return;
    appliedTemplateRef.current = applicationKey;
    const setting = templateSettingFor(templateSettings, templateId);
    const defaults = defaultTemplateSetting(templateId);
    setDocumentTitle((current) => current === defaults.title ? setting.title : current);
    setSections((current) => {
      if (current.some((section, index) => section.id !== defaults.sections[index]?.id) || current.length !== defaults.sections.length) return current;
      const defaultTitles = new Map(defaults.sections.map((section) => [section.id, section.title]));
      const configuredIds = new Set(setting.sections.map((section) => section.id));
      return [...setting.sections.map((section) => {
        const existing = current.find((item) => item.id === section.id);
        return {
          ...section,
          title: existing && existing.title !== defaultTitles.get(section.id) ? existing.title : section.title,
          body: existing?.body ?? "",
        };
      }), ...retainedSections(current, configuredIds, defaultTitles)];
    });
    const customized = definitionDiffers(setting, defaults);
    if (documentId && customized) markDirty();
  }, [documentId, markDirty, openedDocumentRef, setDocumentTitle, setSections, templateId, templateSettings, workspaceEpoch]);

  const saveTemplateDefinition = useCallback(async (input: DocumentTemplateSetting) => {
    const requestEpoch = workspaceEpoch.current;
    const previous = templateSettingFor(templateSettings ?? [], input.templateId);
    const previousTitles = new Map(previous.sections.map((section) => [section.id, section.title]));
    const definitionChanged = definitionDiffers(input, previous);
    setTemplateSettingsBusy(true);
    setTemplateSettingsError(null);
    try {
      const saved = await saveDocumentTemplateSetting(input);
      setTemplateSettings((current) => [...(current ?? []).filter((item) => item.templateId !== saved.templateId), saved]);
      if (workspaceEpoch.current === requestEpoch && saved.templateId === templateId && definitionChanged) {
        setDocumentTitle((current) => current === previous.title ? saved.title : current);
        setSections((current) => {
          const configuredIds = new Set(saved.sections.map((section) => section.id));
          return [
            ...saved.sections.map((section) => {
              const existing = current.find((item) => item.id === section.id);
              return { ...section, title: existing && existing.title !== previousTitles.get(section.id) ? existing.title : section.title, body: existing?.body ?? "" };
            }),
            ...retainedSections(current, configuredIds, previousTitles),
          ];
        });
        markDirty();
      }
      return saved;
    } catch (error) {
      setTemplateSettingsError(error instanceof Error ? error.message : "No se pudo guardar la plantilla.");
      return null;
    } finally {
      setTemplateSettingsBusy(false);
    }
  }, [markDirty, setDocumentTitle, setSections, templateId, templateSettings, workspaceEpoch]);

  const retryTemplateSettings = useCallback(() => {
    setTemplateSettings(null);
    setTemplateSettingsError(null);
    setLoadRevision((current) => current + 1);
  }, []);
  return { activeTemplateSetting, retryTemplateSettings, saveTemplateDefinition, templateSettings: templateSettings ?? [], templateSettingsBusy, templateSettingsError, templateSettingsLoaded: templateSettings !== null };
}
