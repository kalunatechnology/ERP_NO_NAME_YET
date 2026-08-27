"use client";

import React from "react";
import { RightPanel } from "@/components/ui/RightPanel";

export function RightSidebar({ onToggleCollapse }: { onToggleCollapse?: () => void }) {
  return <RightPanel onToggleCollapse={onToggleCollapse} />;
}

export default RightSidebar;
