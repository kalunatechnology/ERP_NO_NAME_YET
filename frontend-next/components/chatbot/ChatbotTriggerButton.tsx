"use client";

import React from "react";
import { Sparkles, Bot } from "lucide-react";

interface ChatbotTriggerButtonProps {
  onClick: () => void;
  isOpen?: boolean;
}

/**
 * ChatbotTriggerButton coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
export function ChatbotTriggerButton({ onClick, isOpen }: ChatbotTriggerButtonProps) {
  if (isOpen) return null;

  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 px-4 py-3 rounded-full bg-gradient-to-r from-brand-deep-green to-emerald-800 text-white shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 transition-all duration-200 group border border-emerald-400/30 cursor-pointer"
      title="Tanya AI Assistant (PT Sinergi Muda Arsa)"
      aria-label="Buka AI Assistant"
    >
      <div className="relative flex items-center justify-center">
        <Bot size={20} className="text-white group-hover:rotate-12 transition-transform duration-300" />
        <span className="absolute -top-1 -right-1 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-300"></span>
        </span>
      </div>
      <div className="flex flex-col text-left">
        <span className="text-xs font-semibold tracking-wide flex items-center gap-1">
          AI Assistant
          <Sparkles size={12} className="text-emerald-300" />
        </span>
      </div>
    </button>
  );
}
