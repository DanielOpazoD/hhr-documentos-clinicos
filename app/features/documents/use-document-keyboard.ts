"use client";

import { useEffect } from "react";

type KeyboardOptions = {
  saving: boolean;
  onSave: () => void;
  onNewDocument: () => void;
  onEscape: () => void;
};

export function useDocumentKeyboard({ saving, onSave, onNewDocument, onEscape }: KeyboardOptions) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!saving) onSave();
        return;
      }
      if (command && event.key.toLowerCase() === "n") {
        event.preventDefault();
        if (!saving) onNewDocument();
        return;
      }
      if (event.key === "Escape") {
        onEscape();
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        return;
      }
      if (event.key === "Enter" && document.activeElement instanceof HTMLButtonElement && !document.activeElement.disabled) {
        event.preventDefault();
        document.activeElement.click();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onEscape, onNewDocument, onSave, saving]);
}
