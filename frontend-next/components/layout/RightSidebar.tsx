/**
 * File: frontend-next/components/layout/RightSidebar.tsx
 *
 * Purpose: Defines the React component and its user-facing responsibility in the Marka+/Arsalynk frontend.
 * Integration: Called by Next routing or parent components; API and browser-state effects are documented on the responsible functions below.
 * Boundary: This file owns presentation/orchestration only and relies on shared context/API modules for identity and persistence.
 */
"use client";

import React from "react";
import { RightPanel } from "@/components/ui/RightPanel";

export function RightSidebar({ onToggleCollapse }: { onToggleCollapse?: () => void }) {
  return <RightPanel onToggleCollapse={onToggleCollapse} />;
}

export default RightSidebar;
