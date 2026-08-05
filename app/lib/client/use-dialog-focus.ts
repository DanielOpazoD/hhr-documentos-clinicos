"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";

const FOCUSABLE = "button:enabled,input:enabled,summary";

export function useDialogFocus<T extends HTMLElement>(onEscape: () => void) {
  const dialogRef = useRef<T>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  function onDialogKeyDown(event: KeyboardEvent<T>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onEscape();
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = event.currentTarget;
    const controls = dialog.querySelectorAll<HTMLElement>(FOCUSABLE);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const active = document.activeElement;
    if ((event.shiftKey && active === first) || (!event.shiftKey && active === last) || !dialog.contains(active)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  }

  return [dialogRef, onDialogKeyDown] as const;
}
