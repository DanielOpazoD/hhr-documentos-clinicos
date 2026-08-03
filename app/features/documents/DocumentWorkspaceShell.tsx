import type { ReactNode } from "react";

type Props = {
  assistantOpen: boolean;
  assistant: ReactNode;
  children: ReactNode;
};

export function DocumentWorkspaceShell({ assistant, assistantOpen, children }: Props) {
  return (
    <div className="document-workspace-shell">
      <div className="document-workspace-view" hidden={!assistantOpen}>{assistant}</div>
      <div className="document-workspace-view" hidden={assistantOpen}>{children}</div>
    </div>
  );
}
