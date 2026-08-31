import React from "react";

/**
 * The glass container every screen is built from.
 *
 * Extracted because the same surface appeared, hand-rolled and slightly
 * different each time, in seven components. The differences were not intent —
 * they were the residue of copying a className and adjusting it — and that is
 * exactly what makes an interface feel assembled rather than designed.
 *
 * `index` drives the entrance stagger. A column of panels that arrives in
 * sequence reads as one page composing itself; the same panels arriving
 * together read as a flash.
 */
export function Panel({
  children,
  className = "",
  index = 0,
  interactive = false,
}: {
  children: React.ReactNode;
  className?: string;
  index?: number;
  interactive?: boolean;
}): React.ReactElement {
  return (
    <section
      className={`glass rise ${interactive ? "glass-interactive" : ""} overflow-hidden ${className}`}
      style={{ "--i": index } as React.CSSProperties}
    >
      {children}
    </section>
  );
}

/**
 * A panel's header: an eyebrow, a title, an optional line of explanation, and a
 * slot on the right for controls or a live badge.
 *
 * The eyebrow carries what kind of thing this is, the title what it is, and the
 * note the caveat. Splitting them means the caveat is always present and never
 * has to be crammed into the title.
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
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.06] px-6 py-5">
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
        <h2 className="display text-[17px] font-semibold">{title}</h2>
        {note ? (
          <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-fg-muted">{note}</p>
        ) : null}
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
  return <div className={`px-6 py-5 ${className}`}>{children}</div>;
}

/** A hairline that matches the panel rim. */
export function Rule(): React.ReactElement {
  return <div className="h-px w-full bg-white/[0.06]" />;
}
