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
 * **Centred, every one of them.** The version this replaces pinned every header
 * hard left and capped the note at `max-w-2xl` inside a panel three times that
 * wide, so each trailed off into a third of a panel of nothing. An earlier pass
 * at this kept the dense panels -- tables, the rail matrix -- left-aligned on
 * the theory that a centred header floats free of left-aligned rows beneath it.
 * On the page that was the wrong call: a column of panels alternating between
 * two header alignments reads as less deliberate than either one used
 * consistently, and consistency is the thing doing the work here. The `right`
 * slot goes centred beneath the note rather than out at the rim.
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
