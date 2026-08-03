import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
};

function classes(base: string, extra?: string) {
  return extra ? `${base} ${extra}` : base;
}

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  children,
  className,
}: PageHeaderProps) {
  return (
    <header className={classes("page-header", className)}>
      <div className="page-header-context">
        <div className="page-header-copy">
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
    <header className={classes("section-heading", className)}>
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h2 id={id}>{title}</h2>
      </div>
      {actions}
    </header>
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
    <div className={classes(compact ? "empty-state compact" : "empty-state", className)} role="status">
      {icon}
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}
