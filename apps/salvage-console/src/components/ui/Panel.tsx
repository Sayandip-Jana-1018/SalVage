import React from "react";

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
      className={`glass rise ${interactive ? "glass-card-interactive cursor-pointer" : ""} overflow-hidden ${className}`}
      style={{ "--i": index } as React.CSSProperties}
    >
      {children}
    </section>
  );
}

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
    <header className="border-b border-white/[0.08] bg-gradient-to-b from-white/[0.03] to-transparent px-6 py-6 text-center sm:px-8 sm:py-7">
      {eyebrow ? (
        <div className="flex justify-center mb-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-iris/30 bg-iris/10 px-3 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-iris shadow-[0_0_12px_rgba(99,102,241,0.2)]">
            {eyebrow}
          </span>
        </div>
      ) : null}
      
      <h2 className="display mx-auto max-w-3xl text-[20px] font-extrabold sm:text-[23px] tracking-tight">
        {title}
      </h2>
      
      {note ? (
        <p className="mx-auto mt-2.5 max-w-2xl text-[13px] leading-relaxed text-fg-muted font-normal">
          {note}
        </p>
      ) : null}
      
      {right ? <div className="mt-3.5 flex justify-center">{right}</div> : null}
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

export function Rule(): React.ReactElement {
  return <div className="h-px w-full bg-white/[0.08]" />;
}
