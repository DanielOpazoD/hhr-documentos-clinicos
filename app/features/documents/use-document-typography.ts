"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DOCUMENT_FONT_SIZE_DEFAULT,
  DOCUMENT_FONT_SIZE_MAX,
  DOCUMENT_FONT_SIZE_MIN,
  SIGNOFF_FONT_SIZE_DEFAULT,
  SIGNOFF_FONT_SIZE_MAX,
  SIGNOFF_FONT_SIZE_MIN,
  signoffFontSizeFromDocumentFontSize,
} from "@/app/lib/document-layout";

const DOCUMENT_STORAGE_KEY = "hhr-document-font-size-v1";
const SIGNOFF_STORAGE_KEY = "hhr-document-signoff-font-size-v1";

function clampDocumentFontSize(value: number) {
  return Math.min(DOCUMENT_FONT_SIZE_MAX, Math.max(DOCUMENT_FONT_SIZE_MIN, value));
}

function clampSignoffFontSize(value: number) {
  return Math.min(SIGNOFF_FONT_SIZE_MAX, Math.max(SIGNOFF_FONT_SIZE_MIN, value));
}

export function useDocumentTypography() {
  const [documentFontSize, setDocumentFontSize] = useState(DOCUMENT_FONT_SIZE_DEFAULT);
  const [signoffFontSize, setSignoffFontSize] = useState(SIGNOFF_FONT_SIZE_DEFAULT);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const storedDocumentSize = Number(window.localStorage.getItem(DOCUMENT_STORAGE_KEY));
        const storedSignoffValue = window.localStorage.getItem(SIGNOFF_STORAGE_KEY);
        const storedSignoffSize = Number(storedSignoffValue);
        if (Number.isFinite(storedDocumentSize) && storedDocumentSize > 0) {
          setDocumentFontSize(clampDocumentFontSize(storedDocumentSize));
        }
        if (storedSignoffValue !== null && Number.isFinite(storedSignoffSize) && storedSignoffSize > 0) {
          setSignoffFontSize(clampSignoffFontSize(storedSignoffSize));
        } else {
          const initialSignoffSize = Number.isFinite(storedDocumentSize) && storedDocumentSize > 0
            ? signoffFontSizeFromDocumentFontSize(storedDocumentSize)
            : SIGNOFF_FONT_SIZE_DEFAULT;
          setSignoffFontSize(initialSignoffSize);
          window.localStorage.setItem(SIGNOFF_STORAGE_KEY, String(initialSignoffSize));
        }
      } catch {
        // Storage is an optional convenience; the in-memory default remains usable.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const changeDocumentFontSize = useCallback((delta: -1 | 1) => {
    setDocumentFontSize((current) => {
      const next = clampDocumentFontSize(current + delta);
      try {
        window.localStorage.setItem(DOCUMENT_STORAGE_KEY, String(next));
      } catch {
        // Keep the control functional when browser storage is blocked or full.
      }
      return next;
    });
  }, []);

  const changeSignoffFontSize = useCallback((delta: -1 | 1) => {
    setSignoffFontSize((current) => {
      const next = clampSignoffFontSize(current + delta);
      try {
        window.localStorage.setItem(SIGNOFF_STORAGE_KEY, String(next));
      } catch {
        // Keep the control functional when browser storage is blocked or full.
      }
      return next;
    });
  }, []);

  return {
    documentFontSize,
    signoffFontSize,
    decreaseDocumentFontSize: () => changeDocumentFontSize(-1),
    increaseDocumentFontSize: () => changeDocumentFontSize(1),
    decreaseSignoffFontSize: () => changeSignoffFontSize(-1),
    increaseSignoffFontSize: () => changeSignoffFontSize(1),
    canDecreaseDocumentFontSize: documentFontSize > DOCUMENT_FONT_SIZE_MIN,
    canIncreaseDocumentFontSize: documentFontSize < DOCUMENT_FONT_SIZE_MAX,
    canDecreaseSignoffFontSize: signoffFontSize > SIGNOFF_FONT_SIZE_MIN,
    canIncreaseSignoffFontSize: signoffFontSize < SIGNOFF_FONT_SIZE_MAX,
  };
}
