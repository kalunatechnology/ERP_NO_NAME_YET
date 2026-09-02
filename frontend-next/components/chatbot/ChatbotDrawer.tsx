"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  ArrowRight,
  StopCircle,
} from "lucide-react";
import {
  ChatMessage,
} from "@/types/chatbot";
import {
  DEFAULT_CALLER_CONFIG,
  streamChatCompletion,
  createConversation,
} from "@/services/chatbot.service";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatbotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: {
    id?: string | number;
    username?: string;
    email?: string;
    companyName?: string;
  };
}

const QUICK_ACTIONS = [
  {
    label: "Running projects this week",
    prompt: "Tolong tampilkan daftar proyek yang sedang berjalan (running projects) minggu ini berserta status progresnya.",
  },
  {
    label: "Top 5 Expenses",
    prompt: "Tampilkan 5 pengeluaran terbesar (Top 5 Expenses) bulan ini untuk PT Sinergi Muda Arsa.",
  },
  {
    label: "Pending projects this week",
    prompt: "Ada proyek apa saja yang berstatus pending atau butuh approval minggu ini?",
  },
  {
    label: "Mails from client",
    prompt: "Ringkas pesan dan permintaan terbaru dari klien yang masuk ke sistem.",
  },
];

// MarBot Snowflake / Star Icon
function MarBotIcon({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <div
      className={`rounded-full flex items-center justify-center text-white flex-shrink-0 shadow-xs ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: "#587C29",
      }}
    >
      <svg
        width={size * 0.62}
        height={size * 0.62}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="12" y1="2" x2="12" y2="22" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
        <line x1="4.93" y1="19.07" x2="19.07" y2="4.93" />
      </svg>
    </div>
  );
}

export function ChatbotDrawer({ isOpen, onClose, currentUser }: ChatbotDrawerProps) {
  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState("10.15");

  // Streaming controller ref
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const externalUserId = currentUser?.id ? String(currentUser.id) : "user_erp_session";

  // Set formatted time
  useEffect(() => {
    const now = new Date();
    const formatted = `${String(now.getHours()).padStart(2, "0")}.${String(now.getMinutes()).padStart(2, "0")}`;
    setCurrentTime(formatted);
  }, []);

  // Auto scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming, scrollToBottom]);

  // Focus input when drawer opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 200);
    }
  }, [isOpen]);

  // Stop Generation
  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setMessages((prev) =>
      prev.map((msg) => (msg.isStreaming ? { ...msg, isStreaming: false } : msg))
    );
  };

  // Send Message
  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputMessage).trim();
    if (!query || isStreaming) return;

    setInputMessage("");

    // User message
    const userMsgId = `user_${Date.now()}`;
    const userMsg: ChatMessage = {
      id: userMsgId,
      role: "user",
      content: query,
      createdAt: new Date().toISOString(),
    };

    // Placeholder assistant message
    const assistantMsgId = `asst_${Date.now()}`;
    const assistantPlaceholder: ChatMessage = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantPlaceholder]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // 1. Pastikan conversationId sudah ada atau dibuat terlebih dahulu agar Prisma tidak error
      let convId = currentConversationId;
      if (!convId) {
        try {
          const newConv = await createConversation(
            query.slice(0, 40) || "Percakapan MarBot",
            externalUserId,
            DEFAULT_CALLER_CONFIG.callerToken
          );
          if (newConv?.id) {
            convId = newConv.id;
            setCurrentConversationId(newConv.id);
          }
        } catch (convErr) {
          console.warn("Auto create conversation warning:", convErr);
        }
      }

      // 2. Stream AI completion dengan valid conversationId
      await streamChatCompletion({
        message: query,
        conversationId: convId,
        externalUserId,
        callerToken: DEFAULT_CALLER_CONFIG.callerToken,
        signal: controller.signal,
        onChunk: (delta) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? { ...msg, content: msg.content + delta }
                : msg
            )
          );
        },
        onDone: () => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId ? { ...msg, isStreaming: false } : msg
            )
          );
          setIsStreaming(false);
        },
        onError: () => {
          setIsStreaming(false);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? {
                    ...msg,
                    isStreaming: false,
                    content:
                      msg.content ||
                      "Maaf, terjadi kendala saat menghubungkan ke MarBot AI Engine. Silakan coba kembali.",
                  }
                : msg
            )
          );
        },
      });
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? {
                  ...msg,
                  isStreaming: false,
                  content:
                    msg.content ||
                    "Maaf, respon tidak dapat dimuat saat ini.",
                }
              : msg
          )
        );
      }
      setIsStreaming(false);
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end select-none">
      {/* ── Backdrop Overlay ── */}
      <div
        className="absolute inset-0 bg-black/25 backdrop-blur-[1px] transition-opacity duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* ── MarBot Slide-Over Panel ── */}
      <div
        className="relative z-10 flex flex-col h-full w-full sm:w-[410px] bg-white shadow-2xl transition-all duration-300 animate-in slide-in-from-right-full font-sans"
        style={{
          boxShadow: "-4px 0 24px rgba(0,0,0,0.08)",
        }}
      >
        {/* ── Header Matching Screenshot ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F2F5] bg-white flex-shrink-0">
          <div className="flex items-center gap-3">
            <MarBotIcon size={34} />
            <div className="flex flex-col">
              <span className="font-bold text-[15px] text-[#1E293B] leading-snug">
                MarBot
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-[#55695C] font-medium leading-tight">
                <span className="w-1.5 h-1.5 rounded-full bg-[#587C29]" />
                Online
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-md text-[#55695C] hover:text-black hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Main Chat Scrollable Content ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col space-y-4">
          {/* Default MarBot Intro Message & Quick Actions (Shown only on initial state) */}
          {messages.length === 0 && (
            <div className="flex flex-col space-y-4">
              <div className="flex flex-col space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#334155]">
                  <MarBotIcon size={20} />
                  <span>MarBot</span>
                  <span className="text-[#94A3B8] font-normal">· {currentTime}</span>
                </div>

                <div className="rounded-2xl p-4 bg-[#F6F7F9] text-[#334155] text-[13px] leading-relaxed max-w-[95%]">
                  Hi! I&apos;m MarBot, your ERP assistant. I can help you with financial reports, inventory levels, order tracking, HR queries, and more. What do you need?
                </div>
              </div>

              {/* ── Quick Actions Section (Initial Screen Only) ── */}
              <div className="pt-2 flex flex-col space-y-2">
                <span className="text-[13px] font-semibold text-[#55695C]">
                  Quick Actions
                </span>

                <div className="flex flex-col space-y-1.5">
                  {QUICK_ACTIONS.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(item.prompt)}
                      disabled={isStreaming}
                      className="w-full text-left px-4 py-2.5 rounded-xl bg-[#EDFBD8] hover:bg-[#E2F7C3] active:scale-98 transition-all text-[12.5px] font-medium text-[#2C501B] disabled:opacity-50 cursor-pointer shadow-2xs"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Dynamic Message Feed */}
          {messages.map((msg) => {
            const isUser = msg.role === "user";
            return (
              <div key={msg.id} className="flex flex-col space-y-1">
                {!isUser && (
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#334155]">
                    <MarBotIcon size={20} />
                    <span>MarBot</span>
                  </div>
                )}

                <div
                  className={`rounded-2xl p-3.5 text-[13px] leading-relaxed max-w-[92%] ${
                    isUser
                      ? "ml-auto bg-[#587C29] text-white rounded-br-xs"
                      : "bg-[#F6F7F9] text-[#334155] rounded-bl-xs"
                  }`}
                >
                  {isUser ? (
                    <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                  ) : (
                    <div className="break-words">
                      {msg.content ? (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            h1: ({ children }) => (
                              <h1 className="text-[15px] font-bold text-[#1E293B] mt-2.5 mb-1.5 first:mt-0">
                                {children}
                              </h1>
                            ),
                            h2: ({ children }) => (
                              <h2 className="text-[14px] font-bold text-[#1E293B] mt-2 mb-1 first:mt-0">
                                {children}
                              </h2>
                            ),
                            h3: ({ children }) => (
                              <h3 className="text-[13.5px] font-bold text-[#1E293B] mt-2.5 mb-1 first:mt-0">
                                {children}
                              </h3>
                            ),
                            p: ({ children }) => (
                              <p className="mb-2 last:mb-0 leading-relaxed text-[#334155]">
                                {children}
                              </p>
                            ),
                            ul: ({ children }) => (
                              <ul className="list-disc pl-5 space-y-1 mb-2 last:mb-0 text-[#334155]">
                                {children}
                              </ul>
                            ),
                            ol: ({ children }) => (
                              <ol className="list-decimal pl-5 space-y-1 mb-2 last:mb-0 text-[#334155]">
                                {children}
                              </ol>
                            ),
                            li: ({ children }) => (
                              <li className="leading-relaxed">
                                {children}
                              </li>
                            ),
                            strong: ({ children }) => (
                              <strong className="font-semibold text-[#1E293B]">
                                {children}
                              </strong>
                            ),
                            em: ({ children }) => <em className="italic">{children}</em>,
                            blockquote: ({ children }) => (
                              <blockquote className="border-l-3 border-[#587C29] pl-3 py-1 text-[#55695C] italic my-2 bg-[#F0F5E8] rounded-r text-[12.5px]">
                                {children}
                              </blockquote>
                            ),
                            code({ node, className, children, ...props }: any) {
                              const isInline = !className && typeof children === "string" && !children.includes("\n");
                              if (isInline) {
                                return (
                                  <code
                                    className="bg-black/5 text-[#1E293B] px-1.5 py-0.5 rounded text-[12px] font-mono font-medium"
                                    {...props}
                                  >
                                    {children}
                                  </code>
                                );
                              }
                              return (
                                <pre className="bg-[#1E293B] text-gray-100 p-3 rounded-xl overflow-x-auto text-[12px] font-mono my-2.5 shadow-inner">
                                  <code {...props}>{children}</code>
                                </pre>
                              );
                            },
                            table: ({ children }) => (
                              <div className="overflow-x-auto my-2.5 border border-gray-200 rounded-lg shadow-2xs">
                                <table className="min-w-full text-[12px] border-collapse text-left">
                                  {children}
                                </table>
                              </div>
                            ),
                            thead: ({ children }) => (
                              <thead className="bg-[#EDFBD8]/80 text-[#2C501B] font-semibold border-b border-gray-200">
                                {children}
                              </thead>
                            ),
                            th: ({ children }) => (
                              <th className="px-3 py-2 font-semibold">
                                {children}
                              </th>
                            ),
                            td: ({ children }) => (
                              <td className="px-3 py-2 border-b border-gray-100 last:border-b-0 text-[#334155]">
                                {children}
                              </td>
                            ),
                            a: ({ href, children }) => (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#587C29] underline font-medium hover:text-[#415d1e] transition-colors"
                              >
                                {children}
                              </a>
                            ),
                            hr: () => <hr className="my-2.5 border-[#E2E8F0]" />,
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      ) : (
                        msg.isStreaming && "Sedang memproses..."
                      )}
                      {msg.isStreaming && (
                        <span className="inline-block w-1.5 h-3 bg-[#587C29] ml-1 animate-pulse align-middle" />
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>

        {/* Stop Streaming Indicator */}
        {isStreaming && (
          <div className="flex justify-center pb-2">
            <button
              onClick={handleStopStreaming}
              className="flex items-center gap-1 px-3 py-1 bg-white border border-red-200 text-red-600 rounded-full text-xs font-medium hover:bg-red-50 shadow-xs"
            >
              <StopCircle size={13} />
              Hentikan
            </button>
          </div>
        )}

        {/* ── Input Box & Disclaimer Footer Matching Screenshot ── */}
        <div className="px-5 pb-5 pt-1 flex flex-col space-y-2 flex-shrink-0">
          <div className="flex items-center rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 focus-within:border-[#587C29] focus-within:bg-white focus-within:ring-1 focus-within:ring-[#587C29] transition-all">
            <input
              ref={inputRef}
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask MarBot anything.."
              disabled={isStreaming}
              className="flex-1 bg-transparent text-[13px] text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-hidden disabled:opacity-60"
            />

            <button
              onClick={() => handleSendMessage()}
              disabled={!inputMessage.trim() || isStreaming}
              className="p-1 rounded-lg text-[#587C29] hover:bg-[#EDFBD8] disabled:opacity-40 disabled:hover:bg-transparent transition-colors ml-1 cursor-pointer"
              title="Send"
            >
              <ArrowRight size={18} strokeWidth={2.5} />
            </button>
          </div>

          <div className="text-center">
            <span className="text-[11px] text-[#64748B] font-normal leading-tight">
              MarBot can make mistakes. Please verify critical data
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChatbotDrawer;
