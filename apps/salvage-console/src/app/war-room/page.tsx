"use client";

import React from "react";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { IncidentCard } from "@/components/IncidentCard";
import { LiveDecisionStream } from "@/components/LiveDecisionStream";
import { PipelineStrip } from "@/components/PipelineStrip";
import { RailHealthMatrix } from "@/components/RailHealthMatrix";

/**
 * The war room, in the order somebody reads it.
 *
 * Open incidents first, because that is the question anybody opening this
 * screen is asking. Then the pipeline counters, then the matrix that explains
 * them, then the ledger that records what was done about them.
 *
 * `ConnectionBanner` sits above all of it and says once, if the stack is not
 * running, what every panel below would otherwise each say separately. That was
 * a real defect: with the services down this page rendered the identical
 * full-width "Backend unreachable" alarm four times, which reads as broken
 * software rather than as absent data.
 */
export default function WarRoomPage(): React.ReactElement {
  return (
    <div className="space-y-6">
      <ConnectionBanner />
      <IncidentCard />
      <PipelineStrip />
      <RailHealthMatrix />
      <LiveDecisionStream />
    </div>
  );
}
