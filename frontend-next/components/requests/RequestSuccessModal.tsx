/**
 * File: frontend-next/components/requests/RequestSuccessModal.tsx
 *
 * Purpose: Defines the React component and its user-facing responsibility in the Marka+/Arsalynk frontend.
 * Integration: Called by Next routing or parent components; API and browser-state effects are documented on the responsible functions below.
 * Boundary: This file owns presentation/orchestration only and relies on shared context/API modules for identity and persistence.
 */
"use client";

import { Check } from "lucide-react";

interface RequestSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  requestData?: {
    request_number?: string;
    title?: string;
    request_type?: string;
  } | null;
}

/**
 * RequestSuccessModal owns the local UI behavior described by its typed signature.
 *
 * @param input - Uses the declared props, event, or value arguments.
 * @returns The rendered React value, computed presentation value, or Promise declared by the implementation.
 * Integration/side effects: updates only the visible React/browser state or invokes the callbacks below.
 */
export function RequestSuccessModal({ isOpen, onClose, requestData }: RequestSuccessModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-[380px] bg-white border border-[#D9D9D9] rounded-[28px] shadow-2xl p-8 text-center flex flex-col items-center animate-in zoom-in-95 duration-200">
        {/* Glowing Green Check Icon Container */}
        <div className="w-18 h-18 rounded-full bg-gradient-to-b from-[#294BB2] to-[#2649B3] flex items-center justify-center text-white shadow-lg mb-5 ring-8 ring-[#EAF6FF]">
          <Check size={36} strokeWidth={3} />
        </div>

        {/* Title & Subtitle matching Marka+ Mockup */}
        <h2 className="text-xl font-black text-[#090909] tracking-tight mb-1.5">
          Request Sent
        </h2>
        <p className="text-xs text-[#4F5050] font-medium leading-relaxed max-w-[260px] mb-6">
          Your request has been submitted for validation
        </p>

        {/* Request Pill Summary */}
        {requestData && (
          <div className="w-full mb-6 p-3 rounded-[16px] bg-[#EAF6FF] border border-[#D9D9D9] text-left">
            <div className="flex items-center justify-between text-3xs font-bold text-[#294BB2] uppercase tracking-wider mb-0.5">
              <span>{requestData.request_type || "REQUEST"}</span>
              <span className="font-mono text-[#090909]">{requestData.request_number}</span>
            </div>
            <p className="text-xs font-bold text-[#090909] truncate">{requestData.title}</p>
            <p className="text-3xs text-[#4F5050] mt-1">Status: <span className="font-bold text-[#294BB2]">Waiting OM Validation</span></p>
          </div>
        )}

        {/* Button: Back to Home */}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 rounded-[16px] bg-[#2649B3] hover:bg-[#2649B3] text-white text-xs font-extrabold shadow-md hover:shadow-lg transition-all"
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}
