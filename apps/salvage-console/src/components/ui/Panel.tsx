import React from "react";

/**
 * The container every screen is built from.
 *
 * Extracted because it appeared, hand-rolled and slightly different each time,
 * in seven components. The differences were not intentional — they were the
 * residue of copying a `className` string and adjusting it — and they are
 * exactly what makes an interface feel assembled rather than designed.
 */
export function Panel({
  children,
  className = "",
  flush = false,
}: {
  children: React.ReactNode;
  className?: string;
  flush?: boolean;
}): React.ReactElement {
  return (
    <section className={`${flush ? "panel-flush" : "panel"} overflow-hidden ${className}`}>
      {children}
    </section>
  );
}

/**
 * A panel's header: an eyebrow, a title, an optional line of explanation, and
 * a slot on the right for controls or a live badge.
 *
 * The eyebrow carries what kind of thing this is, the title what it is, and
 * the note the caveat. Splitting them means the caveat is always present and
 * never has to be crammed into the title.
 */
export function PanelHeader({
  eyebrow,
  title,
  note,
  right,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  note?: React.ReactNode;
  right?: React.ReactNode;
}): React.ReactElement {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-1.5">{eyebrow}</p> : null}
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-fg">{title}</h2>
        {note ? <p className="mt-1 max-w-2xl text-xs leading-relaxed text-fg-muted">{note}</p> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </header>
  );
}

export function PanelBody({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}

/** A horizontal rule that matches the panel border exactly. */
export function Rule(): React.ReactElement {
  return <div className="h-px w-full bg-line" />;
}
