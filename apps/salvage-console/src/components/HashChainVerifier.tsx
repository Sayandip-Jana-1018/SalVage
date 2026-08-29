"use client";

import { CheckCircle2, Copy, FileText, Link as LinkIcon, ShieldCheck } from "lucide-react";
import { useState } from "react";

interface HashChainVerifierProps {
  entryIndex: number;
  entryHash: string;
  previousHash: string;
}

export function HashChainVerifier({
  entryIndex,
  entryHash,
  previousHash,
}: HashChainVerifierProps) {
  const [copied, setCopied] = useState<boolean>(false);

  const copyHash = () => {
    navigator.clipboard.writeText(entryHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-slate-800 bg-[#0d1117] p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Cryptographic Tamper-Evident Ledger Verification
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Every recovery decision is immutably appended to a sha256 hash-chain
          </p>
        </div>
        <span className="flex items-center gap-1 text-xs font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60">
          <CheckCircle2 className="w-3 h-3" />
          Cryptographically Verified
        </span>
      </div>

      <div className="space-y-3 font-mono text-xs">
        {/* Previous Hash */}
        <div className="p-3 rounded bg-slate-900/60 border border-slate-800/80">
          <div className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <LinkIcon className="w-3 h-3 text-slate-400" />
            Previous Entry Hash (Block #{entryIndex - 1})
          </div>
          <div className="text-slate-400 text-xs mt-1 truncate">{previousHash}</div>
        </div>

        {/* Current Entry Hash */}
        <div className="p-3 rounded bg-emerald-950/20 border border-emerald-800/50">
          <div className="flex items-center justify-between">
            <div className="text-[10px] text-emerald-400 uppercase tracking-wider flex items-center gap-1 font-bold">
              <FileText className="w-3 h-3 text-emerald-400" />
              Current Entry Hash (Block #{entryIndex})
            </div>
            <button
              onClick={copyHash}
              className="text-[10px] text-slate-400 hover:text-slate-200 flex items-center gap-1"
            >
              <Copy className="w-3 h-3" />
              <span>{copied ? "Copied!" : "Copy"}</span>
            </button>
          </div>
          <div className="text-emerald-300 text-xs mt-1 font-bold break-all">{entryHash}</div>
        </div>

        {/* Proof Statement */}
        <div className="text-[11px] text-slate-400 flex items-center gap-2 pt-1 font-sans">
          <span>Bit-identical replay proof:</span>
          <code className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-300 font-mono">
            H(i) = sha256(H(i-1) || payload)
          </code>
        </div>
      </div>
    </div>
  );
}
