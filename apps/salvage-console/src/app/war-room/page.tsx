"use client";

import { IncidentCard } from "@/components/IncidentCard";
import { LiveDecisionStream } from "@/components/LiveDecisionStream";
import { RailHealthMatrix } from "@/components/RailHealthMatrix";
import { activeIncidents } from "@/lib/mockData";

export default function WarRoomPage() {
  return (
    <div className="space-y-6">
      {/* 1. Active Outage Incident Card */}
      {activeIncidents.length > 0 && <IncidentCard incident={activeIncidents[0]} />}

      {/* 2. 2D Rail Health Sensing Matrix */}
      <RailHealthMatrix />

      {/* 3. Live Decision & Ingest Stream */}
      <LiveDecisionStream />
    </div>
  );
}
