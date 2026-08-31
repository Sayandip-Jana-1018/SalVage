"use client";

import React from "react";
import { IncidentCard } from "@/components/IncidentCard";
import { LiveDecisionStream } from "@/components/LiveDecisionStream";
import { PipelineStrip } from "@/components/PipelineStrip";
import { RailHealthMatrix } from "@/components/RailHealthMatrix";

/**
 * The war room, in the order an operator reads it.
 *
 * Open incidents first, because that is the question someone opening this
 * screen is asking. Then the pipeline counters, then the matrix that explains
 * them, then the ledger that records what was done about them.
 *
 * The page used to open with `ScrollFrameSequence`: 409 lines driving fifty
 * JPEG frames on scroll, from a directory whose PROVENANCE.md recorded that
 * nobody knew where the images came from or under what licence. It has been
 * deleted, along with the frames. What replaces it is the data.
 */
export default function WarRoomPage(): React.ReactElement {
  return (
    <div className="enter space-y-4">
      <IncidentCard />
      <PipelineStrip />
      <RailHealthMatrix />
      <LiveDecisionStream />
    </div>
  );
}
