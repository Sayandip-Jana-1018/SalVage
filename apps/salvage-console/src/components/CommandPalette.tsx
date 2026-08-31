"use client";

import {
  Activity,
  CreditCard,
  FlaskConical,
  Languages,
  Search,
  Stethoscope,
  Store,
} from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMerchant } from "@/lib/merchant";

/**
 * Everything reachable from one keystroke.
 *
 * Built for the reason this console exists at all: during an incident somebody
 * is holding a payment attempt id from a support ticket and needs the autopsy
 * for it. Without this, that is a click into Autopsy, a click into the field,
 * a paste, a click on Open. With it, it is ⌘K, paste, Enter. The rest of the
 * commands are navigation, which is worth having in the same place so there is
 * one thing to learn rather than two.
 *
 * No dependency. A command palette is a filtered list, a keydown handler and a
 * focus trap, and pulling in a combobox library to get those would add a
 * bundle, a version to track and an abstraction between this file and the
 * behaviour it describes.
 *
 * Accessibility is not decoration here — the whole feature is keyboard-first.
 * The input owns focus, `aria-activedescendant` points at the highlighted row
 * so a screen reader follows the arrow keys, Escape closes, and the trigger
 * that opened it gets focus back on close.
 */

interface Command {
  id: string;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
  /** Extra words to match on that are not in the label. */
  keywords?: string;
}

export function CommandPalette(): React.ReactElement | null {
  const router = useRouter();
  const { merchantId, setMerchantId } = useMerchant();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<Element | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setHighlighted(0);
    // Send focus back where it came from. A palette that closes into nowhere
    // strands a keyboard user at the top of the document.
    if (openerRef.current instanceof HTMLElement) openerRef.current.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openerRef.current = document.activeElement;
        setOpen((wasOpen) => !wasOpen);
        return;
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => {
      router.push(href);
      close();
    };
    const trimmed = query.trim();

    const base: Command[] = [
      {
        id: "war-room",
        label: "War room",
        hint: "Live rail health, incidents, ledger",
        icon: Activity,
        run: go("/war-room"),
        keywords: "home dashboard rails incidents",
      },
      {
        id: "autopsy",
        label: "Autopsy",
        hint: "Recent attempts, and one attempt end to end",
        icon: Stethoscope,
        run: go("/autopsy"),
        keywords: "attempt decision explain",
      },
      {
        id: "checkout",
        label: "Checkout",
        hint: "Publish a failure, follow the pipeline",
        icon: CreditCard,
        run: go("/checkout"),
        keywords: "demo publish event kafka",
      },
      {
        id: "sandbox",
        label: "Evaluation",
        hint: "Off-policy results from make eval",
        icon: FlaskConical,
        run: go("/sandbox"),
        keywords: "eval statistics calibration forest",
      },
      {
        id: "language",
        label: "Language layer",
        hint: "Where an LLM is allowed to help",
        icon: Languages,
        run: go("/language"),
        keywords: "llm gemini triage nudge narrate",
      },
    ];

    // Two commands that only exist once there is something to act on. Offering
    // "open attempt" with an empty box would be a row that does nothing.
    if (trimmed) {
      base.unshift({
        id: "open-attempt",
        label: `Open autopsy for ${trimmed}`,
        hint: `Attempt id, under ${merchantId}`,
        icon: Search,
        run: () => {
          router.push(
            `/autopsy/${encodeURIComponent(trimmed)}?merchant=${encodeURIComponent(merchantId)}`,
          );
          close();
        },
      });
      base.push({
        id: "switch-merchant",
        label: `Switch merchant to ${trimmed}`,
        hint: "Every backend query is scoped by this",
        icon: Store,
        run: () => {
          setMerchantId(trimmed);
          close();
        },
        keywords: "tenant merchant switch",
      });
    }

    return base;
  }, [query, merchantId, router, close, setMerchantId]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((command) => {
      // The two query-derived commands are *about* the query, so they always
      // match it; filtering them out on their own text would be perverse.
      if (command.id === "open-attempt" || command.id === "switch-merchant") return true;
      return `${command.label} ${command.hint} ${command.keywords ?? ""}`
        .toLowerCase()
        .includes(needle);
    });
  }, [commands, query]);

  useEffect(() => {
    // Keep the highlight inside the list as it shrinks under a longer query.
    setHighlighted((current) => Math.min(current, Math.max(matches.length - 1, 0)));
  }, [matches.length]);

  if (!open) return null;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((current) => (current + 1) % Math.max(matches.length, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((current) => (current - 1 + matches.length) % Math.max(matches.length, 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      matches[highlighted]?.run();
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-ink-0/70 px-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="panel enter w-full max-w-xl overflow-hidden"
      >
        <div className="flex items-center gap-2.5 border-b border-white/[0.07] px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-fg-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a screen, paste an attempt id, or switch merchant"
            aria-label="Command"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-list"
            aria-activedescendant={matches[highlighted]?.id}
            className="w-full bg-transparent text-sm text-fg placeholder:text-fg-faint/80 outline-none"
          />
          <kbd className="shrink-0 rounded border border-white/12 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-fg-faint">
            esc
          </kbd>
        </div>

        <ul id="command-list" role="listbox" aria-label="Commands" className="max-h-80 overflow-y-auto p-1.5">
          {matches.length === 0 ? (
            <li className="px-3 py-6 text-center text-xs text-fg-muted">
              Nothing matches that.
            </li>
          ) : (
            matches.map((command, index) => {
              const Icon = command.icon;
              const active = index === highlighted;
              return (
                <li key={command.id} id={command.id} role="option" aria-selected={active}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlighted(index)}
                    onClick={command.run}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                      active ? "bg-white/[0.06]" : "hover:bg-white/[0.035]"
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${active ? "text-iris" : "text-fg-faint"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-fg">{command.label}</span>
                      <span className="block truncate text-[11px] text-fg-faint">
                        {command.hint}
                      </span>
                    </span>
                    {active ? (
                      <kbd className="shrink-0 rounded border border-white/12 bg-white/[0.035] px-1.5 py-0.5 font-mono text-[10px] text-fg-faint">
                        ↵
                      </kbd>
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
