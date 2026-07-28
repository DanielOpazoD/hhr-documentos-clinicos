"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DOCUMENT_FONT_SIZE_DEFAULT,
  DOCUMENT_FONT_SIZE_MAX,
  DOCUMENT_FONT_SIZE_MIN,
} from "@/app/lib/document-layout";

const STORAGE_KEY = "hhr-document-font-size-v1";

function clamp(value: number) {
  return Math.min(DOCUMENT_FONT_SIZE_MAX, Math.max(DOCUMENT_FONT_SIZE_MIN, value));
}

export function useDocumentTypography() {
  const [documentFontSize, setDocumentFontSize] = useState(DOCUMENT_FONT_SIZE_DEFAULT);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = Number(window.localStorage.getItem(STORAGE_KEY));
        if (Number.isFinite(stored) && stored > 0) setDocumentFontSize(clamp(stored));
      } catch {
        // Storage is an optional convenience; the in-memory default remains usable.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const changeDocumentFontSize = useCallback((delta: -1 | 1) => {
    setDocumentFontSize((current) => {
      const next = clamp(current + delta);
      try {
        window.localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Keep the control functional when browser storage is blocked or full.
      }
      return next;
    });
  }, []);

  return {
    documentFontSize,
    decreaseDocumentFontSize: () => changeDocumentFontSize(-1),
    increaseDocumentFontSize: () => changeDocumentFontSize(1),
    canDecreaseDocumentFontSize: documentFontSize > DOCUMENT_FONT_SIZE_MIN,
    canIncreaseDocumentFontSize: documentFontSize < DOCUMENT_FONT_SIZE_MAX,
  };
}
