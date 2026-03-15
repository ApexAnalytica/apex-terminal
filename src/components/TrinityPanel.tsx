"use client";

import dynamic from "next/dynamic";

const DcdGraph = dynamic(() => import("./trinity/DcdGraph"), { ssr: false });
const PcmciGraph = dynamic(() => import("./trinity/PcmciGraph"), { ssr: false });
const FciGraph = dynamic(() => import("./trinity/FciGraph"), { ssr: false });

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
