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
 * slot for controls or a live badge.
 *
 * The eyebrow carries what kind of thing this is, the title what it is, and the
 * note the caveat. Splitting them means the caveat is always present and never
 * has to be crammed into the title.
 *
 * **Centred by default.** The version this replaces pinned every header hard
 * left and capped the note at `max-w-2xl` inside a panel three times that wide,
 * so each one trailed off into a third of a panel of nothing. One panel like
 * that looks like a choice; five stacked look like a page that was never
 * finished. Centring the block and holding the note to a readable measure puts
 * the empty space on both sides, where it reads as margin.
 *
 * `align="left"` stays for the dense panels — tables, matrices — where a
 * centred header would float free of the left-aligned rows beneath it.
 */
export function PanelHeader({
  eyebrow,
  title,
  note,
  right,
  align = "center",
}: {
  eyebrow?: string;
  title: React.ReactNode;
  note?: React.ReactNode;
  right?: React.ReactNode;
  align?: "left" | "center";
}): React.ReactElement {
  if (align === "left") {
    return (
      <header className="flex flex-wrap items-start justify-between gap-5 border-b border-white/[0.06] px-6 py-6 sm:px-8 sm:py-7">
        <div className="min-w-0">
          {eyebrow ? <p className="eyebrow mb-2.5">{eyebrow}</p> : null}
          <h2 className="display text-[18px] font-semibold sm:text-[19px]">{title}</h2>
          {note ? (
            <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-fg-muted">{note}</p>
          ) : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </header>
    );
  }

  return (
    <header className="border-b border-white/[0.06] px-6 py-7 text-center sm:px-8 sm:py-8">
      {eyebrow ? <p className="eyebrow mb-3">{eyebrow}</p> : null}
      <h2 className="display mx-auto max-w-3xl text-[19px] font-semibold sm:text-[21px]">
        {title}
      </h2>
      {note ? (
        <p className="mx-auto mt-3 max-w-2xl text-[12.5px] leading-relaxed text-fg-muted">{note}</p>
      ) : null}
      {right ? <div className="mt-4 flex justify-center">{right}</div> : null}
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
  return <div className={`px-6 py-6 sm:px-8 sm:py-7 ${className}`}>{children}</div>;
}

/**
 * A centred column inside a panel body.
 *
 * Long prose is set left-aligned inside it rather than centred: a centred
 * ragged edge on both sides of a four-line paragraph is harder to read than the
 * dead space it was meant to fix. What was wrong with the old layout was the
 * *block* sitting against the left rim of a much wider panel, not the text
 * alignment, so this centres the block and leaves the text alone.
 */
export function Measure({
  children,
  className = "",
  width = "prose",
}: {
  children: React.ReactNode;
  className?: string;
  width?: "prose" | "wide";
}): React.ReactElement {
  const max = width === "prose" ? "max-w-2xl" : "max-w-4xl";
  return <div className={`mx-auto w-full ${max} ${className}`}>{children}</div>;
}

/** A hairline that matches the panel rim. */
export function Rule(): React.ReactElement {
  return <div className="h-px w-full bg-white/[0.06]" />;
}
