import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
  compact?: boolean;
  className?: string;
  contextClassName?: string;
  copyClassName?: string;
};

function classes(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  children,
  compact,
  className,
  contextClassName,
  copyClassName,
}: PageHeaderProps) {
  return (
    <header className={classes("page-header", compact && "compact-page-header", className)}>
      <div className={classes("page-header-context", contextClassName)}>
        <div className={classes("page-header-copy", copyClassName)}>
          {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
          <h1>{title}</h1>
          {description ? <p>{description}</p> : null}
        </div>
        {children}
      </div>
      {actions ? <div className="header-actions">{actions}</div> : null}
    </header>
  );
}

type SectionHeaderProps = {
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
  id?: string;
  className?: string;
};

export function SectionHeader({ title, eyebrow, actions, id, className }: SectionHeaderProps) {
  return (
    <div className={classes("section-heading", className)}>
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h2 id={id}>{title}</h2>
      </div>
      {actions}
    </div>
  );
}

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
};

export function EmptyState({ title, description, icon, action, compact, className }: EmptyStateProps) {
  return (
    <div className={classes("empty-state", compact && "compact", className)} role="status">
      {icon}
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}
