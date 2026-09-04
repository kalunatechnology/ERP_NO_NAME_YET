/**
 * File: frontend-next/app/(app)/projects/page.tsx
 *
 * Purpose: Defines the Next App Router entry and its user-facing responsibility in the Marka+/Arsalynk frontend.
 * Integration: Called by Next routing or parent components; API and browser-state effects are documented on the responsible functions below.
 * Boundary: This file owns presentation/orchestration only and relies on shared context/API modules for identity and persistence.
 */
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Projects",
  description: "Manajemen proyek: daftar proyek, hierarki task, stage gates, milestones, dan financial.",
};

export { default } from "./ProjectsClient";
