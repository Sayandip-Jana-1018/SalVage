"use client";

import React from "react";
import { IncidentCard } from "@/components/IncidentCard";
import { LiveDecisionStream } from "@/components/LiveDecisionStream";
import { RailHealthMatrix } from "@/components/RailHealthMatrix";
import { ScrollFrameSequence } from "@/components/ScrollFrameSequence";

export default function WarRoomPage(): React.ReactElement {
  return (
    <div className="w-full flex flex-col items-center space-y-10">
      {/* 1. Interactive 3D Scroll Hero Animation */}
      <ScrollFrameSequence />

      {/* 2. Active Outage Incident Card */}
      <div className="w-full">
        <IncidentCard />
      </div>

      {/* 3. 2D Rail Health Sensing Matrix */}
      <div className="w-full">
        <RailHealthMatrix />
      </div>

      {/* 4. Live Decision & Ingest Stream */}
      <div className="w-full">
        <LiveDecisionStream />
      </div>
    </div>
  );
}
