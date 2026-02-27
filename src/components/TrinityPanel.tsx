"use client";

import DcdGraph from "./trinity/DcdGraph";
import PcmciGraph from "./trinity/PcmciGraph";
import FciGraph from "./trinity/FciGraph";

export default function TrinityPanel() {
  return (
    <div className="flex flex-col h-full divide-y divide-border">
      <div className="flex-1 min-h-0 overflow-hidden">
        <DcdGraph />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <PcmciGraph />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <FciGraph />
      </div>
    </div>
  );
}
