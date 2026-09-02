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

export function RequestSuccessModal({ isOpen, onClose, requestData }: RequestSuccessModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-[380px] bg-white border border-[#D5E2D7] rounded-[28px] shadow-2xl p-8 text-center flex flex-col items-center animate-in zoom-in-95 duration-200">
        {/* Glowing Green Check Icon Container */}
        <div className="w-18 h-18 rounded-full bg-gradient-to-b from-[#5A861F] to-[#275433] flex items-center justify-center text-white shadow-lg mb-5 ring-8 ring-[#F0FEE0]">
          <Check size={36} strokeWidth={3} />
        </div>

        {/* Title & Subtitle matching Marka+ Mockup */}
        <h2 className="text-xl font-black text-[#0E341F] tracking-tight mb-1.5">
          Request Sent
        </h2>
        <p className="text-xs text-[#637566] font-medium leading-relaxed max-w-[260px] mb-6">
          Your request has been submitted for validation
        </p>

        {/* Request Pill Summary */}
        {requestData && (
          <div className="w-full mb-6 p-3 rounded-[16px] bg-[#F0FEE0] border border-[#D5E2D7] text-left">
            <div className="flex items-center justify-between text-3xs font-bold text-[#5A861F] uppercase tracking-wider mb-0.5">
              <span>{requestData.request_type || "REQUEST"}</span>
              <span className="font-mono text-[#0E341F]">{requestData.request_number}</span>
            </div>
            <p className="text-xs font-bold text-[#0E341F] truncate">{requestData.title}</p>
            <p className="text-3xs text-[#637566] mt-1">Status: <span className="font-bold text-[#5A861F]">Waiting OM Validation</span></p>
          </div>
        )}

        {/* Button: Back to Home */}
        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 rounded-[16px] bg-[#275433] hover:bg-[#1E3A2B] text-white text-xs font-extrabold shadow-md hover:shadow-lg transition-all"
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}
