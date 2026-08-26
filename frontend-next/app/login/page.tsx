"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import {
  LogIn, UserPlus, Building, User, ArrowRight, Eye, EyeOff,
  Server, ShieldCheck, ChevronDown, ChevronUp, Sparkles
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

const DEMO_USERS = [
  // Arsalynk Production & Database Accounts
  { label: "👑 Admin System (Arsalynk)",     name: "Sutanto Admin",     email: "admin@arsalynk.id",                 password: "DummyPass123!", phone: "81234567890", cat: "exec" },
  { label: "🏛️ Executive Director",          name: "Bambang Director",  email: "director@arsalynk.id",              password: "DummyPass123!", phone: "81234567891", cat: "exec" },
  { label: "🏗️ Project Manager",              name: "Rina Sari PM",      email: "pm@arsalynk.id",                    password: "DummyPass123!", phone: "81234567892", cat: "pm"   },
  { label: "👷 Field Supervisor / Assignee",  name: "Ahmad Rizki",       email: "supervisor@arsalynk.id",            password: "DummyPass123!", phone: "81234567893", cat: "pm"   },
  { label: "👔 CRM Manager",                  name: "Dewi Kurnia",       email: "manager@arsalynk.id",               password: "DummyPass123!", phone: "81234567894", cat: "crm"  },
  { label: "🧑‍💼 Commercial & Sales Staff",    name: "Hendra Sales",      email: "sales@arsalynk.id",                 password: "DummyPass123!", phone: "81234567895", cat: "crm"  },
  { label: "💼 Finance Controller",           name: "Budi Santoso",      email: "finance@arsalynk.id",               password: "DummyPass123!", phone: "81234567896", cat: "fin"  },

  // Prototype Mirror Accounts
  { label: "👑 Dummy Admin",                  name: "Admin Demo",        email: "dummy.admin@example.com",           password: "DummyPass123!", phone: "81234567897", cat: "exec" },
  { label: "🏗️ Dummy Project Manager",        name: "PM Demo",           email: "dummy.pm@example.com",              password: "DummyPass123!", phone: "81234567898", cat: "pm"   },
  { label: "💰 Dummy Finance Staff",          name: "Finance Demo",      email: "dummy.finance@example.com",         password: "DummyPass123!", phone: "81234567899", cat: "fin"  },
];

interface AuthFormData {
  name?: string;
  email: string;
  phone?: string;
  password?: string;
}

function LoginFormContent() {
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Mode: "login" or "signup"
  const [mode, setMode] = useState<"login" | "signup">(
    searchParams?.get("mode") === "signup" ? "signup" : "login"
  );

  const [showPw, setShowPw] = useState(false);
  const [showDevPanel, setShowDevPanel] = useState(true);
  const [filterCat, setFilterCat] = useState("all");
  const [submitting, setSubmitting] = useState(false);
  const [welcomeName, setWelcomeName] = useState("Sutanto");

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<AuthFormData>({
    defaultValues: {
      name: "Sutanto",
      email: "admin@arsalynk.id",
      phone: "81234567890",
      password: "DummyPass123!",
    }
  });

  const watchedName = watch("name");
  const watchedEmail = watch("email");

  useEffect(() => {
    if (watchedName && watchedName.trim()) {
      setWelcomeName(watchedName);
    } else if (watchedEmail && watchedEmail.includes("@")) {
      const prefix = watchedEmail.split("@")[0];
      setWelcomeName(prefix.charAt(0).toUpperCase() + prefix.slice(1));
    }
  }, [watchedName, watchedEmail]);

  /* Redirect if already authenticated */
  useEffect(() => {
    if (!authLoading && isAuthenticated) router.replace("/dashboard");
  }, [isAuthenticated, authLoading, router]);

  const onSubmit = async (data: AuthFormData) => {
    setSubmitting(true);
    try {
      const emailToUse = data.email || "admin@arsalynk.id";
      const pwToUse = data.password || "DummyPass123!";
      await login(emailToUse, pwToUse);
      toast.success(mode === "signup" ? "Akun berhasil didaftarkan & masuk ke sistem!" : `Selamat datang kembali, ${welcomeName}!`);
      router.push("/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal autentikasi. Silakan periksa kredensial.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    toast.loading("Menghubungkan ke Google Workspace...", { duration: 1200 });
    setTimeout(async () => {
      try {
        await login("admin@arsalynk.id", "DummyPass123!");
        toast.success("Berhasil masuk melalui Single Sign-On Google!");
        router.push("/dashboard");
      } catch {
        toast.error("Gagal SSO Google");
      }
    }, 1200);
  };

  const quickFillAndLogin = (u: typeof DEMO_USERS[0]) => {
    setValue("name", u.name);
    setValue("email", u.email);
    setValue("phone", u.phone);
    setValue("password", u.password);
    setWelcomeName(u.name.split(" ")[0]);
    onSubmit({ name: u.name, email: u.email, phone: u.phone, password: u.password });
  };

  const filteredUsers = filterCat === "all" ? DEMO_USERS : DEMO_USERS.filter(u => u.cat === filterCat);

  if (authLoading) return null;

  return (
    <div className="min-h-screen bg-[#F7F9F4] flex items-center justify-center p-4 sm:p-8 font-sans text-slate-800">
      <div className="w-full max-w-5xl flex flex-col gap-6">

        {/* ── MAIN CARD CONTAINER ── */}
        <div className="bg-white rounded-[36px] shadow-[0_20px_50px_rgba(46,74,18,0.08)] border border-[#E3EBD7] p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch overflow-hidden">

          {/* ── LEFT HERO BANNER ── */}
          <div
            className="lg:col-span-6 rounded-[28px] p-8 sm:p-10 flex flex-col justify-between relative overflow-hidden min-h-[440px] sm:min-h-[540px] text-white shadow-inner"
            style={{
              background: "linear-gradient(155deg, #2D4C13 0%, #446C1E 45%, #6A8D39 100%)",
            }}
          >
            {/* Subtle background mesh glow */}
            <div
              className="absolute -top-24 -left-24 w-96 h-96 rounded-full opacity-30 blur-3xl pointer-events-none"
              style={{ background: "#8BC34A" }}
            />
            <div
              className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full opacity-20 blur-3xl pointer-events-none"
              style={{ background: "#A2DE50" }}
            />

            {/* Top Text Content */}
            <div className="relative z-10">
              {mode === "signup" ? (
                <>
                  <p className="text-xl sm:text-2xl font-normal leading-snug text-[#DCEEC8] max-w-sm mb-3">
                    Experience the more managed & tidy workspace with
                  </p>
                  <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white drop-shadow-sm">
                    Marka+
                  </h1>
                </>
              ) : (
                <>
                  <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
                    Marka+
                  </h1>
                </>
              )}
            </div>

            {/* Bottom Content depending on Mode */}
            <div className="relative z-10 mt-auto">
              {mode === "signup" ? (
                /* Sign up 3 step cards */
                <div className="grid grid-cols-3 gap-2.5 pt-6">
                  <div className="bg-[#EBF7D8] text-[#2B4B13] rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between min-h-[90px] shadow-sm transition-transform hover:-translate-y-0.5">
                    <div className="flex justify-end text-[#4E7621]">
                      <LogIn size={15} />
                    </div>
                    <span className="text-[11px] sm:text-xs font-semibold leading-tight mt-2">
                      Sign Up Your Account
                    </span>
                  </div>

                  <div className="bg-[#EBF7D8] text-[#2B4B13] rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between min-h-[90px] shadow-sm transition-transform hover:-translate-y-0.5">
                    <div className="flex justify-end text-[#4E7621]">
                      <Building size={15} />
                    </div>
                    <span className="text-[11px] sm:text-xs font-semibold leading-tight mt-2">
                      Create/Find Workplace
                    </span>
                  </div>

                  <div className="bg-[#EBF7D8] text-[#2B4B13] rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between min-h-[90px] shadow-sm transition-transform hover:-translate-y-0.5">
                    <div className="flex justify-end text-[#4E7621]">
                      <User size={15} />
                    </div>
                    <span className="text-[11px] sm:text-xs font-semibold leading-tight mt-2">
                      Set up Your Profile
                    </span>
                  </div>
                </div>
              ) : (
                /* Log In Welcome Back */
                <div className="pt-8">
                  <span className="text-sm sm:text-base font-light text-[#DCEEC8] block">
                    Welcome back,
                  </span>
                  <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mt-1 truncate">
                    {welcomeName}
                  </h2>
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT FORM CONTAINER ── */}
          <div className="lg:col-span-6 flex flex-col justify-between p-2 sm:p-6 relative">

            {/* Top Right Asterisk Emblem (visible on Login mode) */}
            {mode === "login" && (
              <div className="absolute top-2 right-4 hidden sm:flex items-center justify-center">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center shadow-[0_4px_16px_rgba(59,87,20,0.25)]"
                  style={{ background: "radial-gradient(circle, #6C9A2B 0%, #3B5714 100%)" }}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.8" strokeLinecap="round">
                    <line x1="12" y1="2" x2="12" y2="22" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                    <line x1="4.93" y1="19.07" x2="19.07" y2="4.93" />
                  </svg>
                </div>
              </div>
            )}

            <div>
              {/* Form Title */}
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[#284813] mb-6">
                {mode === "signup" ? "Sign Up" : "Log In"}
              </h2>

              {/* Form Inputs */}
              <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>

                {/* Input: Your Name (for Signup or optional login display) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Your Name
                  </label>
                  <input
                    type="text"
                    {...register("name")}
                    placeholder="Contoh: Sutanto"
                    className="w-full bg-[#F3F4F6] border-none rounded-xl py-3 px-4 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#567E20] transition-all"
                  />
                </div>

                {/* Input: Your Email */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Your Email *
                  </label>
                  <input
                    type="email"
                    {...register("email", { required: "Email wajib diisi" })}
                    placeholder="email@perusahaan.com"
                    className="w-full bg-[#F3F4F6] border-none rounded-xl py-3 px-4 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#567E20] transition-all"
                  />
                  {errors.email && (
                    <span className="text-2xs text-red-500 mt-1 block">{errors.email.message}</span>
                  )}
                </div>

                {/* Input: Phone Number / Password */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs font-semibold text-slate-700">
                      Phone Number / Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="text-2xs text-[#567E20] font-semibold hover:underline"
                    >
                      {showPw ? "Sembunyikan" : "Tampilkan Password"}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Prefix +62 Badge */}
                    <div className="bg-[#F3F4F6] text-slate-600 font-semibold text-xs px-3.5 py-3 rounded-xl flex items-center justify-center flex-shrink-0">
                      +62
                    </div>
                    {/* Phone or Password Input */}
                    <input
                      type={showPw ? "text" : "password"}
                      {...register("password")}
                      placeholder="81234567890 / Kata Sandi"
                      className="flex-1 bg-[#F3F4F6] border-none rounded-xl py-3 px-4 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#567E20] transition-all"
                    />
                  </div>
                </div>

                {/* Submit Action Button */}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3.5 px-6 rounded-xl font-bold text-xs text-white shadow-md transition-all duration-200 mt-2 flex items-center justify-center gap-2 bg-[#53791F] hover:bg-[#436417] active:scale-[0.99] disabled:opacity-70"
                >
                  {submitting ? (
                    <span>Memproses Autentikasi...</span>
                  ) : (
                    <span>Get Started</span>
                  )}
                </button>

                {/* 'or' divider */}
                <div className="flex items-center justify-center my-0.5">
                  <span className="text-2xs text-slate-400 font-medium">or</span>
                </div>

                {/* Sign in with Google Button */}
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="w-full py-3 px-4 rounded-xl font-semibold text-xs text-slate-700 border border-slate-200 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 shadow-2xs"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24">
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
              </form>
            </div>

            {/* Toggle Mode Link */}
            <div className="text-center pt-5 text-xs text-slate-600">
              {mode === "signup" ? (
                <p>
                  Already signed in?{" "}
                  <button
                    onClick={() => setMode("login")}
                    className="font-bold text-[#567E20] hover:underline"
                  >
                    Log In
                  </button>
                </p>
              ) : (
                <p>
                  Don&apos;t have an account?{" "}
                  <button
                    onClick={() => setMode("signup")}
                    className="font-bold text-[#567E20] hover:underline"
                  >
                    Sign Up
                  </button>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── EXPANDABLE LOCALHOST DEV & DEMO PRESET SWITCHER ── */}
        <div className="bg-white rounded-2xl border border-[#DCEEC8] shadow-sm p-4 sm:p-5 transition-all">
          <div
            onClick={() => setShowDevPanel(!showDevPanel)}
            className="flex items-center justify-between cursor-pointer select-none"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#EBF7D8] text-[#446C1E] flex items-center justify-center flex-shrink-0">
                <Server size={16} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-800">
                    Localhost Dev Presets & 1-Click Role Switcher
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-3xs font-mono font-bold bg-emerald-100 text-emerald-800">
                    API: localhost:8000
                  </span>
                </div>
                <p className="text-2xs text-slate-500">
                  Klik kartu akun di bawah untuk otomatis mengisi form dan login dengan peran terkait
                </p>
              </div>
            </div>
            <button className="text-slate-400 hover:text-slate-700 p-1">
              {showDevPanel ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
          </div>

          {showDevPanel && (
            <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-3">
              {/* Category Filter */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-2xs font-semibold text-slate-400 uppercase mr-1">Filter Role:</span>
                {[
                  { id: "all", label: "Semua Akun" },
                  { id: "exec", label: "Executive & Admin" },
                  { id: "pm", label: "Project Management" },
                  { id: "fin", label: "Finance" },
                  { id: "crm", label: "CRM & Sales" },
                ].map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setFilterCat(cat.id)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-2xs font-semibold transition-colors",
                      filterCat === cat.id
                        ? "bg-[#53791F] text-white shadow-2xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Grid of Preset Users */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {filteredUsers.map((u, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => quickFillAndLogin(u)}
                    className="flex flex-col text-left p-2.5 rounded-xl border border-slate-200/80 bg-slate-50/60 hover:bg-[#EBF7D8] hover:border-[#8BC34A] transition-all group"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-bold text-slate-800 group-hover:text-[#2E4D12] truncate">
                        {u.label}
                      </span>
                      <ArrowRight size={12} className="text-slate-400 group-hover:text-[#53791F] group-hover:translate-x-0.5 transition-transform" />
                    </div>
                    <span className="text-2xs text-slate-500 font-mono mt-0.5 truncate">
                      {u.email}
                    </span>
                    <span className="text-3xs text-slate-400 font-mono">
                      Pass: {u.password} | Tel: +62{u.phone}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginFormContent />
    </Suspense>
  );
}
