/**
 * File: frontend-next/app/login/page.tsx
 *
 * Purpose: Defines the Next App Router entry and its user-facing responsibility in the Marka+/Arsalynk frontend.
 * Integration: Called by Next routing or parent components; API and browser-state effects are documented on the responsible functions below.
 * Boundary: This file owns presentation/orchestration only and relies on shared context/API modules for identity and persistence.
 */
"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import {
  Eye,
  EyeOff,
  Ghost,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

/* ── Minimalist CSS Animations ── */
const ANIM_STYLES = `
  @keyframes mk-fade-up {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes mk-scale-in {
    from { opacity: 0; transform: scale(0.97); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes mk-top-progress {
    0%   { width: 0%; opacity: 1; }
    50%  { width: 70%; opacity: 1; }
    100% { width: 100%; opacity: 1; }
  }
  @keyframes mk-pill-bar {
    0%   { width: 18px; opacity: 0.7; }
    50%  { width: 42px; opacity: 1; }
    100% { width: 18px; opacity: 0.7; }
  }
  @keyframes mk-slide-down {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .mk-card        { animation: mk-scale-in 0.35s cubic-bezier(0.16,1,0.3,1) both; }
  .mk-fade-up-1   { animation: mk-fade-up 0.35s cubic-bezier(0.16,1,0.3,1) 0.04s both; }
  .mk-fade-up-2   { animation: mk-fade-up 0.35s cubic-bezier(0.16,1,0.3,1) 0.08s both; }
  .mk-fade-up-3   { animation: mk-fade-up 0.35s cubic-bezier(0.16,1,0.3,1) 0.12s both; }
  .mk-fade-up-4   { animation: mk-fade-up 0.35s cubic-bezier(0.16,1,0.3,1) 0.16s both; }
  .mk-fade-up-5   { animation: mk-fade-up 0.35s cubic-bezier(0.16,1,0.3,1) 0.20s both; }
  .mk-fade-up-6   { animation: mk-fade-up 0.35s cubic-bezier(0.16,1,0.3,1) 0.24s both; }
  .mk-ghost-panel { animation: mk-slide-down 0.2s cubic-bezier(0.16,1,0.3,1) both; }
  .mk-top-bar-anim {
    animation: mk-top-progress 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
  }
  .mk-pill-line {
    animation: mk-pill-bar 1.1s ease-in-out infinite;
  }
  .mk-input {
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .mk-input:focus {
    box-shadow: 0 0 0 3px rgba(90,134,31,0.12);
    border-color: #275433;
  }
  .mk-ghost-card {
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .mk-ghost-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(90,134,31,0.08);
  }
`;

const OFFICIAL_SMA_USERS = [
  { role: "COMPANY ADMIN", label: "Rian (Company Admin)", name: "Rian", email: "rian@arsalynk.com", phone: "81234567801", password: "DummyPass123!", cat: "sma", roleCode: "ROLE-COMPANY-ADMIN" },
  { role: "LEAD PM", label: "Melika (Lead Project Manager)", name: "Melika", email: "melika@arsalynk.com", phone: "81234567802", password: "DummyPass123!", cat: "sma", roleCode: "ROLE-PM" },
  { role: "OPERATIONS", label: "Melika (Operational Lead & Ops)", name: "Melika Ops", email: "melika.ops@arsalynk.com", phone: "81234567803", password: "DummyPass123!", cat: "sma", roleCode: "ROLE-SUPERVISOR" },
  { role: "PM & RISET", label: "📐 Arof (Lead PM & Riset)", name: "Arof", email: "arof@arsalynk.com", phone: "81234567804", password: "DummyPass123!", cat: "sma", roleCode: "ROLE-PM" },
  { role: "FINANCE LEAD", label: "💼 Arof (Finance Lead & Tax)", name: "Arof Finance", email: "arof.finance@arsalynk.com", phone: "81234567805", password: "DummyPass123!", cat: "sma", roleCode: "ROLE-FINANCE" },
  { role: "ENGINEER", label: "👷 Laode (Field Specialist / Engineer)", name: "Laode", email: "laode@arsalynk.com", phone: "81234567806", password: "DummyPass123!", cat: "sma", roleCode: "ROLE-SUPERVISOR" },
  { role: "CREATIVE MEDIA", label: "🎬 Jundy (Creative Media Specialist)", name: "Jundy", email: "jundy@arsalynk.com", phone: "81234567807", password: "DummyPass123!", cat: "sma", roleCode: "ROLE-SUPERVISOR" },
  { role: "SURVEYOR", label: "📍 Noorman (Survey Specialist)", name: "Noorman", email: "noorman@arsalynk.com", phone: "81234567808", password: "DummyPass123!", cat: "sma", roleCode: "ROLE-SUPERVISOR" },
];

const GHOST_DEMO_USERS = [
  { role: "SUPER ADMIN", label: "System Super Admin", name: "System Admin", email: "dummy.admin@example.com", phone: "81234567889", password: "DummyPass123!", cat: "exec" },
  { role: "GHOST ADMIN", label: "Ghost Admin System", name: "Ghost Admin", email: "admin.director@arsalynk.id", phone: "81234567890", password: "DummyPass123!", cat: "exec" },
  { role: "GHOST EXECUTIVE", label: "Ghost Executive Director", name: "Ghost Director", email: "director@arsalynk.id", phone: "81234567891", password: "DummyPass123!", cat: "exec" },
  { role: "GHOST PM", label: "Ghost Lead Project Manager", name: "Ghost PM", email: "pm.lead@arsalynk.id", phone: "81234567892", password: "DummyPass123!", cat: "pm" },
  { role: "GHOST SUPERVISOR", label: "👷 Ghost Field Supervisor", name: "Ghost Supervisor", email: "supervisor@arsalynk.id", phone: "81234567893", password: "DummyPass123!", cat: "pm" },
  { role: "GHOST CRM", label: "👔 Ghost CRM & Commercial Lead", name: "Ghost CRM", email: "crm.lead@arsalynk.id", phone: "81234567894", password: "DummyPass123!", cat: "crm" },
  { role: "GHOST SALES", label: "🧑‍💼 Ghost Commercial & Sales Staff", name: "Ghost Sales", email: "sales@arsalynk.id", phone: "81234567895", password: "DummyPass123!", cat: "crm" },
  { role: "GHOST FINANCE", label: "💼 Ghost Finance Controller", name: "Ghost Finance", email: "finance.lead@arsalynk.id", phone: "81234567896", password: "DummyPass123!", cat: "fin" },
  { role: "GHOST AP/AR", label: "Ghost AP & AR Specialist", name: "Ghost Accounting", email: "dummy.finance@example.com", phone: "81234567897", password: "DummyPass123!", cat: "fin" },
  { role: "GHOST ESTIMATOR", label: "📐 Ghost Cost Estimator", name: "Ghost Estimator", email: "estimator@arsalynk.id", phone: "81234567898", password: "DummyPass123!", cat: "pm" },
  { role: "GHOST STAFF", label: "🧑‍💻 Ghost Technical & Dev Staff", name: "Ghost Staff", email: "staff.dev@arsalynk.id", phone: "81234567899", password: "DummyPass123!", cat: "exec" },
];

const ALL_LOGIN_ACCOUNTS = [...OFFICIAL_SMA_USERS, ...GHOST_DEMO_USERS];

const GHOST_CATEGORIES = [
  { cat: "sma", label: "🌟 PT Sinergi Muda Arsa (8 Akun Resmi)" },
  { cat: "all_ghost", label: "👻 Semua Dummy Ghost (10)" },
  { cat: "exec", label: "Executive & Admin" },
  { cat: "pm", label: "Project & Estimator" },
  { cat: "fin", label: "Finance & AP/AR" },
  { cat: "crm", label: "CRM & Sales" },
];

const CAT_COLOR: Record<string, string> = {
  sma: "#275433",
  exec: "#7C3AED",
  pm: "#0EA5E9",
  fin: "#F59E0B",
  crm: "#10B981",
};

interface LoginForm {
  name?: string;
  email: string;
  password: string;
}

/**
 * LoginFormContent coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
function LoginFormContent() {
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showGhostPanel, setShowGhostPanel] = useState(false);
  const [filterCat, setFilterCat] = useState("sma");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isLocalDev, setIsLocalDev] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const hostname = window.location.hostname;
      const isLocal =
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        /^192\.168\./.test(hostname) ||
        /^10\./.test(hostname) ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);
      setIsLocalDev(isLocal);
    }
  }, []);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<LoginForm>({
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
  });

  const watchedName = watch("name");

  useEffect(() => {
    if (!authLoading && isAuthenticated && !isTransitioning) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, authLoading, router, isTransitioning]);

/**
 * onSubmit coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const onSubmit = async (data: LoginForm) => {
    const ident = data.email?.trim();
    if (!ident || !data.password) {
      toast.error("Silakan masukkan email dan password");
      return;
    }

    setSubmitting(true);
    try {
      await login(ident, data.password);
      
      // Clean, minimal transition
      setIsTransitioning(true);

      setTimeout(() => {
        router.push("/dashboard");
      }, 360);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Email atau password salah";
      toast.error(msg);
      setSubmitting(false);
    }
  };

/**
 * quickGhostLogin coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const quickGhostLogin = (user: typeof ALL_LOGIN_ACCOUNTS[0]) => {
    setValue("name", user.name);
    setValue("email", user.email);
    setValue("password", user.password);
    handleSubmit(onSubmit)();
  };

/**
 * handleCopy coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
  const handleCopy = (text: string, key: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success(`${label} disalin!`, { duration: 1200 });
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const filteredLoginUsers =
    filterCat === "sma"
      ? OFFICIAL_SMA_USERS
      : filterCat === "all_ghost"
      ? GHOST_DEMO_USERS
      : ALL_LOGIN_ACCOUNTS.filter((u) => u.cat === filterCat);


  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ANIM_STYLES }} />

      {/* ── TOP SLIM PROGRESS BAR (Minimalist Transition Progress) ── */}
      {(submitting || isTransitioning) && (
        <div className="fixed top-0 left-0 right-0 z-[9999] h-[3px] bg-transparent overflow-hidden">
          <div className="mk-top-bar-anim h-full bg-[#5A861F] shadow-[0_0_8px_#5A861F]" />
        </div>
      )}

      <div className="min-h-screen w-full bg-[#FAFAFA] flex flex-col items-center justify-center p-3 md:p-5 lg:p-6 font-sans select-none overflow-x-hidden relative">
        {/* ── CARD UTAMA LOGIN ── */}
        <div
          className={cn(
            "mk-card w-full max-w-[1334px] h-auto lg:h-[calc(100vh-3rem)] max-h-[920px] bg-white rounded-[24px] border border-[#C7C7C7] p-3 sm:p-4 lg:p-5 flex flex-col lg:flex-row gap-5 lg:gap-10 xl:gap-12 shadow-[0_4px_24px_rgba(0,0,0,0.02)] transition-all duration-300",
            isTransitioning && "opacity-40 scale-[0.99] pointer-events-none"
          )}
        >
          {/* ── SISI KIRI: PANEL GRADASI HIJAU MOSS ── */}
          <div
            className="w-full lg:w-[320px] xl:w-[380px] 2xl:w-[420px] shrink-0 rounded-[22px] p-6 sm:p-8 lg:p-10 flex flex-col justify-between text-white relative overflow-hidden min-h-[260px] lg:min-h-full"
            style={{
              background:
                "linear-gradient(180deg, #2C4906 0%, #3D6013 32%, #5D7F2A 68%, #99BA6D 100%)",
            }}
          >
            <div className="z-10">
              <h1 className="text-2xl sm:text-3xl lg:text-[38px] font-semibold tracking-tight text-white">
                Marka+
              </h1>
            </div>

            <div className="flex flex-col gap-0.5 mt-auto z-10">
              {watchedName?.trim() ? (
                <>
                  <span className="text-xs sm:text-sm text-white/85 font-normal tracking-wide">
                    Welcome back,
                  </span>
                  <span className="text-2xl sm:text-3xl lg:text-[40px] font-bold text-white tracking-tight leading-tight truncate">
                    {watchedName.trim()}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-xs sm:text-sm text-white/85 font-normal tracking-wide">
                    Welcome back to
                  </span>
                  <span className="text-2xl sm:text-3xl lg:text-[40px] font-bold text-white tracking-tight leading-tight">
                    Marka+
                  </span>
                </>
              )}
            </div>

            <div className="absolute -top-24 -left-24 w-80 h-80 bg-[#4F672F]/30 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-16 -right-16 w-80 h-80 bg-[#B1C683]/20 rounded-full blur-2xl pointer-events-none" />
          </div>

          {/* ── SISI KANAN: FORM LOGIN & LOGO ASTERISK ── */}
          <div className="flex-1 flex flex-col justify-between py-1 lg:py-2 pr-0 lg:pr-4">
            
            {/* Top Right: Asterisk Badge */}
            <div className="mk-fade-up-1 flex justify-end w-full">
              <div
                className="w-12 h-12 sm:w-14 sm:h-14 lg:w-[60px] lg:h-[60px] rounded-full flex items-center justify-center shadow-xs shrink-0"
                style={{
                  background: "linear-gradient(180deg, #2C4906 0%, #99BA6D 100%)",
                }}
              >
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M12 2V22"
                    stroke="white"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M3.34 7L20.66 17"
                    stroke="white"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M3.34 17L20.66 7"
                    stroke="white"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>

            {/* Bottom Area: Full Width Form */}
            <div className="w-full max-w-[780px] flex flex-col gap-4 lg:gap-5 mt-auto pb-1 lg:pb-3">
              <h2 className="mk-fade-up-2 text-2xl sm:text-3xl font-bold text-[#275433] tracking-tight">
                Log In
              </h2>

              <form
                onSubmit={handleSubmit(onSubmit)}
                className="flex flex-col gap-3 lg:gap-3.5"
                noValidate
              >
                {/* Field 1: Your Name */}
                <div className="mk-fade-up-3 flex flex-col gap-1">
                  <label className="text-xs font-medium text-[#275433]">
                    Your Name
                  </label>
                  <input
                    type="text"
                    {...register("name")}
                    placeholder="Nama (opsional)"
                    autoComplete="name"
                    className="mk-input w-full h-[42px] lg:h-[44px] rounded-[11px] bg-[#FDFDFD] border border-[#5A861F] px-3.5 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none shadow-2xs"
                  />
                </div>

                {/* Field 2: Your Email */}
                <div className="mk-fade-up-4 flex flex-col gap-1">
                  <label className="text-xs font-medium text-[#275433]">
                    Your Email
                  </label>
                  <input
                    type="text"
                    {...register("email", { required: "Email wajib diisi" })}
                    placeholder="Email"
                    autoComplete="username"
                    className="mk-input w-full h-[42px] lg:h-[44px] rounded-[11px] bg-white border border-[#5A861F] px-3.5 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none shadow-2xs"
                  />
                  {errors.email && (
                    <span className="text-[11px] text-red-500">
                      {errors.email.message}
                    </span>
                  )}
                </div>

                {/* Field 3: Password */}
                <div className="mk-fade-up-5 flex flex-col gap-1">
                  <label className="text-xs font-medium text-[#275433]">
                    Password
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type={showPw ? "text" : "password"}
                      {...register("password", {
                        required: "Password wajib diisi",
                      })}
                      autoComplete="current-password"
                      placeholder="Password"
                      className="mk-input w-full h-[42px] lg:h-[44px] rounded-[11px] bg-white border border-[#5A861F] px-3.5 pr-10 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none shadow-2xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                      tabIndex={-1}
                    >
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {errors.password && (
                    <span className="text-[11px] text-red-500">
                      {errors.password.message}
                    </span>
                  )}
                </div>

                {/* Submit Button (Minimalist active pill indicator - matching reference) */}
                <div className="mk-fade-up-6 flex flex-col gap-3">
                  <button
                    type="submit"
                    disabled={submitting || isTransitioning}
                    className={cn(
                      "w-full h-[46px] lg:h-[50px] mt-0.5 rounded-[12px] text-white font-medium text-xs sm:text-sm transition-all duration-200 flex items-center justify-center cursor-pointer shadow-xs",
                      (submitting || isTransitioning)
                        ? "bg-[#1E293B] shadow-inner"
                        : "bg-[#5A861F] hover:bg-[#486D16] active:scale-[0.995]"
                    )}
                  >
                    {(submitting || isTransitioning) ? (
                      /* Minimalist white pill loading indicator (matching user mockup) */
                      <div className="flex items-center justify-center">
                        <div className="mk-pill-line h-1.5 bg-white rounded-full" />
                      </div>
                    ) : (
                      <span>Log In</span>
                    )}
                  </button>

                  {/* Divider */}
                  <div className="text-center text-xs text-[#275433] font-medium my-0">
                    or
                  </div>

                  {/* Google Button */}
                  <button
                    type="button"
                    onClick={() =>
                      toast(
                        "Login Google Workspace terintegrasi dengan arsalynk.com",
                        { icon: "🌐" }
                      )
                    }
                    className="w-full h-[46px] lg:h-[50px] rounded-[12px] border border-[#637566] bg-white hover:bg-slate-50/80 active:scale-[0.995] text-xs sm:text-[13px] font-medium text-[#637566] flex items-center justify-center gap-2.5 transition-all shadow-[0_3px_10px_rgba(0,0,0,0.08)] cursor-pointer"
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>Sign in with Google</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* ── PANEL TESTING & QUICK LOGIN (8 AKUN RESMI PT SINERGI MUDA ARSA & GHOST) ── */}
        {isLocalDev && (
          <div className="w-full max-w-[1334px] mt-3 flex flex-col items-center">
            <button
              type="button"
              onClick={() => setShowGhostPanel(!showGhostPanel)}
              className="text-xs font-bold text-[#275433] hover:text-[#0E341F] flex items-center gap-2 px-5 py-2 rounded-full bg-[#F0FEE0] border border-[#D5ECC2] shadow-2xs transition-all cursor-pointer hover:bg-[#EAF8D6]"
            >
              <Ghost size={15} className="text-[#5A861F]" />
              <span>
                {showGhostPanel
                  ? "Tutup Panel Akses Cepat"
                  : "Akses Cepat Pengujian: 8 Akun Resmi PT Sinergi Muda Arsa (@arsalynk.com) & Akun Ghost"}
              </span>
              {showGhostPanel ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>

            {showGhostPanel && (
              <div className="mk-ghost-panel w-full bg-white border border-[#5A861F]/30 rounded-2xl p-4 mt-2 shadow-sm flex flex-col gap-3">
                {/* Filter Category Tabs */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 border-b border-slate-100 no-scrollbar">
                  {GHOST_CATEGORIES.map((c) => (
                    <button
                      key={c.cat}
                      type="button"
                      onClick={() => setFilterCat(c.cat)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer",
                        filterCat === c.cat
                          ? "bg-[#5A861F] text-white shadow-xs"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      )}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                {/* Grid Login Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                  {filteredLoginUsers.map((u) => {
                    const emailKey = `email-${u.email}`;
                    const pwKey = `pw-${u.email}`;
                    const color = CAT_COLOR[u.cat] || "#5A861F";

                    return (
                      <div
                        key={u.email}
                        className="mk-ghost-card p-3 rounded-2xl border border-[#E5E9E2] bg-[#F8FBF5] hover:bg-[#F0FEE0]/30 flex flex-col justify-between gap-2 shadow-2xs"
                      >
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between gap-1">
                            <span
                              className="text-[12px] font-extrabold text-[#0E341F] truncate"
                              title={u.label}
                            >
                              {u.label}
                            </span>
                            <span
                              className="text-[8px] font-extrabold px-2 py-0.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: `${color}18`, color }}
                            >
                              {u.role}
                            </span>
                          </div>

                          <div className="flex items-center justify-between bg-white border border-[#E5E9E2] rounded-xl px-2.5 py-1 text-xs">
                            <span className="font-mono text-[11px] font-bold text-slate-800 truncate">
                              {u.email}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(u.email, emailKey, "Email")}
                              className="p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                              title="Salin email"
                            >
                              {copiedKey === emailKey ? (
                                <Check size={12} className="text-green-600" />
                              ) : (
                                <Copy size={12} />
                              )}
                            </button>
                          </div>

                          <div className="flex items-center justify-between bg-white border border-[#E5E9E2] rounded-xl px-2.5 py-1 text-xs">
                            <span className="font-mono text-[11px] text-slate-600 truncate">
                              {u.password}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                handleCopy(u.password, pwKey, "Password")
                              }
                              className="p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                              title="Salin password"
                            >
                              {copiedKey === pwKey ? (
                                <Check size={12} className="text-green-600" />
                              ) : (
                                <Copy size={12} />
                              )}
                            </button>
                          </div>

                          <span className="text-[9px] font-mono text-slate-500 pl-0.5">
                            Tel: +62 {u.phone}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => quickGhostLogin(u)}
                          className="w-full py-2 rounded-xl text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 shadow-xs hover:brightness-105 transition-all"
                          style={{ background: `linear-gradient(120deg, ${color}dd, ${color})` }}
                        >
                          Masuk sebagai {u.name.split(" ")[0] || u.name}
                        </button>
                      </div>
                    );
                  })}
                </div>

                <p className="text-center text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                  PT Sinergi Muda Arsa Official Workspace &bull; Localhost Testing Environment
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * LoginPage coordinates the UI behavior represented by this function.
 *
 * @param input - Uses the typed props/arguments declared by the signature; no additional implicit input contract is introduced.
 * @returns The rendered React node, callback result, or Promise declared by the implementation.
 * Integration/side effects: updates only the React/browser state and callbacks explicitly referenced below.
 */
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full flex items-center justify-center bg-white">
          <div className="w-8 h-8 rounded-full border-2 border-[#5A861F] border-t-transparent animate-spin" />
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
