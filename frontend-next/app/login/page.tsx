"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import {
  LogIn, Building2, User, ArrowRight, Eye, EyeOff,
  Server, ChevronDown, ChevronUp, Sparkles, Check, KeyRound, Shield
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

const DEMO_USERS = [
  // Arsalynk Production & Database Accounts
  { label: "👑 Admin System (Arsalynk)",     name: "Sutanto Admin",     email: "admin@arsalynk.id",                 password: "DummyPass123!", role: "Super Administrator", phone: "81234567890", cat: "exec", desc: "Akses penuh multi-tenant & semua company" },
  { label: "🏛️ Executive Director",          name: "Bambang Director",  email: "director@arsalynk.id",              password: "DummyPass123!", role: "Direksi / Eksekutif",  phone: "81234567891", cat: "exec", desc: "Observabilitas P&L & persetujuan strategis" },
  { label: "🏗️ Project Manager",              name: "Rina Sari PM",      email: "pm@arsalynk.id",                    password: "DummyPass123!", role: "Project Manager",      phone: "81234567892", cat: "pm",   desc: "Manajemen WBS, kurva S, & gate flow" },
  { label: "👷 Field Supervisor / Assignee",  name: "Ahmad Rizki",       email: "supervisor@arsalynk.id",            password: "DummyPass123!", role: "Assignee / Supervisor", phone: "81234567893", cat: "pm",   desc: "Input timesheet harian & checklist lapangan" },
  { label: "👔 CRM Manager",                  name: "Dewi Kurnia",       email: "manager@arsalynk.id",               password: "DummyPass123!", role: "CRM & Sales Lead",     phone: "81234567894", cat: "crm",  desc: "Pipeline komersial, estimasi, & kontrak" },
  { label: "🧑‍💼 Commercial & Sales Staff",    name: "Hendra Sales",      email: "sales@arsalynk.id",                 password: "DummyPass123!", role: "Sales & Inquiries",    phone: "81234567895", cat: "crm",  desc: "Pencatatan inquiry pelanggan & quotation" },
  { label: "💼 Finance Controller",           name: "Budi Santoso",      email: "finance@arsalynk.id",               password: "DummyPass123!", role: "Finance Controller",    phone: "81234567896", cat: "fin",  desc: "AR/AP, proposal penagihan, & kas bank" },

  // Prototype Mirror Accounts
  { label: "👑 Dummy Admin",                  name: "Admin Demo",        email: "dummy.admin@example.com",           password: "DummyPass123!", role: "Administrator",        phone: "81234567897", cat: "exec", desc: "Akun simulasi admin prototype" },
  { label: "🏗️ Dummy Project Manager",        name: "PM Demo",           email: "dummy.pm@example.com",              password: "DummyPass123!", role: "Project Manager",      phone: "81234567898", cat: "pm",   desc: "Akun simulasi PM prototype" },
  { label: "💰 Dummy Finance Staff",          name: "Finance Demo",      email: "dummy.finance@example.com",         password: "DummyPass123!", role: "Accounting Staff",     phone: "81234567899", cat: "fin",  desc: "Akun simulasi verifikasi keuangan" },
];

const CATEGORIES = [
  { id: "all",  label: "Semua Akun (10)" },
  { id: "exec", label: "👑 Executive & Admin" },
  { id: "pm",   label: "🏗️ Project Management" },
  { id: "crm",  label: "👔 CRM & Sales" },
  { id: "fin",  label: "💼 Finance & Accounting" },
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
      setWelcomeName(watchedName.trim().split(" ")[0]);
    } else if (watchedEmail && watchedEmail.includes("@")) {
      const prefix = watchedEmail.split("@")[0];
      setWelcomeName(prefix.charAt(0).toUpperCase() + prefix.slice(1));
    }
  }, [watchedName, watchedEmail]);

  useEffect(() => {
    if (!authLoading && isAuthenticated) router.replace("/dashboard");
  }, [isAuthenticated, authLoading, router]);

  const onSubmit = async (data: AuthFormData) => {
    setSubmitting(true);
    try {
      const emailToUse = data.email || "admin@arsalynk.id";
      const pwToUse = data.password || "DummyPass123!";
      await login(emailToUse, pwToUse);
      toast.success(`Selamat datang kembali, ${welcomeName}!`);
      router.push("/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal autentikasi. Silakan periksa kredensial.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    toast.loading("Menghubungkan ke Google Workspace...", { duration: 1000 });
    setTimeout(async () => {
      try {
        await login("admin@arsalynk.id", "DummyPass123!");
        toast.success("Berhasil masuk melalui Single Sign-On Google!");
        router.push("/dashboard");
      } catch {
        toast.error("Gagal SSO Google");
      }
    }, 1000);
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
    <div className="min-h-screen w-full bg-[#FAFAFA] flex flex-col items-center justify-start py-8 px-4 sm:px-6 lg:px-8 font-sans select-none">
      <div className="w-full max-w-[1240px] flex flex-col gap-8 my-auto">

        {/* ── CARD LOGIN (Figma Scale: Left Showcase + Right Form) ── */}
        <div className="w-full bg-white border border-[#C7C7C7] rounded-[24px] overflow-hidden grid grid-cols-1 lg:grid-cols-[440px_1fr] shadow-sm">
          
          {/* ── LEFT COLUMN: Green Atmospheric Hero Banner ── */}
          <div 
            className="relative p-8 sm:p-10 lg:p-12 flex flex-col justify-between overflow-hidden rounded-[20px] m-1.5 min-h-[380px] lg:min-h-[580px]"
            style={{
              background: "linear-gradient(180deg, #2C4906 0%, #99BA6D 100%)",
            }}
          >
            {/* Ambient Glow / Noise Overlay */}
            <div 
              className="absolute inset-0 opacity-15 pointer-events-none mix-blend-overlay"
              style={{
                backgroundImage: `radial-gradient(circle at 50% 50%, rgba(255,255,255,0.4) 0%, transparent 80%)`
              }}
            />

            {/* Top Branding */}
            <div className="relative z-10">
              <h1 className="text-white text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
                Marka+
              </h1>
              <p className="text-white/80 text-xs sm:text-sm mt-1.5 font-medium">
                Enterprise Resource Planning Workspace
              </p>
            </div>

            {/* Bottom Greeting */}
            <div className="relative z-10 mt-auto pt-8">
              <p className="text-white/80 text-xs sm:text-sm font-medium">Welcome back,</p>
              <h2 className="text-white text-2xl sm:text-3xl lg:text-4xl font-extrabold mt-1 tracking-tight truncate">
                {welcomeName}
              </h2>
              <p className="text-white/70 text-xs mt-2 leading-relaxed">
                Akses dashboard operasional, pantau progres proyek, keuangan, dan layanan komersial dalam satu portal terpadu.
              </p>
            </div>
          </div>

          {/* ── RIGHT COLUMN: Minimal Login Form ── */}
          <div className="relative flex flex-col justify-center px-6 sm:px-12 lg:px-16 py-10">
            {/* Top Decorative Emblem */}
            <div className="absolute top-6 right-6 hidden sm:block">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-white shadow-xs"
                style={{
                  background: "linear-gradient(135deg, #2C4906 0%, #99BA6D 100%)",
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="2" x2="12" y2="22" />
                  <line x1="12" y1="12" x2="20.66" y2="7" />
                  <line x1="12" y1="12" x2="20.66" y2="17" />
                  <line x1="12" y1="12" x2="3.34" y2="17" />
                  <line x1="12" y1="12" x2="3.34" y2="7" />
                </svg>
              </div>
            </div>

            <div className="max-w-[440px] w-full mx-auto">
              {/* Title */}
              <h2 className="text-[#275433] text-2xl sm:text-3xl font-bold tracking-tight mb-6">
                Log In
              </h2>

              <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
                {/* Field: Your Name */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[#275433]">
                    Your Name
                  </label>
                  <input
                    type="text"
                    {...register("name")}
                    placeholder="Sutanto"
                    className="w-full h-[45px] px-4 rounded-[12px] bg-[#F5F5F5] border border-[#C7C7C7] text-sm text-neutral-800 focus:bg-white focus:outline-none focus:border-[#5A861F] transition-all"
                  />
                </div>

                {/* Field: Your Email */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[#275433]">
                    Your Email
                  </label>
                  <input
                    type="email"
                    {...register("email", { required: "Email wajib diisi" })}
                    placeholder="admin@arsalynk.id"
                    className="w-full h-[45px] px-4 rounded-[12px] bg-[#F5F5F5] border border-[#C7C7C7] text-sm text-neutral-800 focus:bg-white focus:outline-none focus:border-[#5A861F] transition-all"
                  />
                  {errors.email && (
                    <span className="text-2xs text-red-500">{errors.email.message}</span>
                  )}
                </div>

                {/* Field: Password / Phone */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-[#275433]">
                      {showPw ? "Password" : "Password"}
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="text-2xs text-[#5A861F] font-semibold hover:underline flex items-center gap-1"
                    >
                      {showPw ? <EyeOff size={12} /> : <Eye size={12} />}
                      <span>{showPw ? "Mode Phone" : "Tampilkan Sandi"}</span>
                    </button>
                  </div>

                <div className="relative">
                  <div className="relative flex items-center h-[45px] rounded-[12px] bg-[#F5F5F5] border border-[#C7C7C7] overflow-hidden focus-within:bg-white focus-within:border-[#5A861F] transition-all">
                    <input
                      type={showPw ? "text" : "password"}
                      {...register("password")}
                      placeholder="Masukkan password"
                      className="w-full h-full px-3 pr-12 bg-transparent text-sm text-neutral-800 focus:outline-none"
                    />

                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-0 h-full px-4 flex items-center justify-center text-[#637566] hover:text-[#5A861F] transition-colors"
                      aria-label={showPw ? "Sembunyikan password" : "Tampilkan password"}
                    >
                      {showPw ? (
                        // Icon eye off
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="w-5 h-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 012.293-3.95m3.165-2.36A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a9.97 9.97 0 01-1.676 3.043M15 12a3 3 0 11-5.197-2.064M3 3l18 18"
                          />
                        </svg>
                      ) : (
                        // Icon eye
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="w-5 h-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                </div>

                {/* Submit CTA */}
                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-2 w-full h-[50px] bg-[#5A861F] hover:bg-[#4a7018] text-white text-sm font-bold rounded-[12px] transition-colors shadow-sm cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2 active:scale-98"
                >
                  <span>{submitting ? "Memverifikasi Kredensial..." : "Log In"}</span>
                  <ArrowRight size={16} />
                </button>
              </form>

              {/* Divider */}
              <div className="my-5 text-center text-xs text-[#275433] font-medium">
                or
              </div>

              {/* Google Social Button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="w-full h-[48px] bg-white border border-[#637566] hover:bg-neutral-50 rounded-[12px] flex items-center justify-center gap-2.5 text-xs font-semibold text-[#637566] shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-all cursor-pointer active:scale-98"
              >
                <svg width="16" height="16" viewBox="0 0 18 18">
                  <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.616z"/>
                  <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                  <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
                  <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
                </svg>
                <span>Sign in with Google</span>
              </button>

              {/* Bottom Redirect */}
              <div className="mt-6 text-center text-xs font-medium text-[#275433]">
                Don&apos;t have an account?{" "}
                <Link href="/signup" className="font-bold text-[#5A861F] hover:underline">
                  Sign Up
                </Link>
              </div>
            </div>
          </div>

        </div>

        {/* ── PRESET DEMO ACCOUNTS PANEL (Full list with Categories & 1-Click login) ── */}
        <div className="w-full bg-white border border-[#C7C7C7] rounded-[20px] p-6 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#F0FEE0] flex items-center justify-center text-[#5A861F]">
                <Server size={18} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#275433]">1-Click Quick Preset Accounts</h3>
                <p className="text-2xs text-gray-500">Pilih akun demonstrasi untuk login otomatis tanpa perlu mengetik kredensial.</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowDevPanel(!showDevPanel)}
              className="text-xs font-semibold text-[#5A861F] hover:text-[#436e24] flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F0FEE0] transition-colors"
            >
              <span>{showDevPanel ? "Sembunyikan Panel" : "Tampilkan Panel"}</span>
              {showDevPanel ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>

          {showDevPanel && (
            <>
              {/* Category Filter Tabs */}
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setFilterCat(c.id)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all",
                      filterCat === c.id
                        ? "bg-[#5A861F] text-white shadow-xs"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              {/* Grid of Preset Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                {filteredUsers.map((u) => (
                  <div
                    key={u.email}
                    className="border border-gray-200 hover:border-[#5A861F] rounded-xl p-3.5 bg-[#FAFAFA] hover:bg-[#F0FEE0]/40 transition-all flex flex-col justify-between gap-3 group shadow-2xs"
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-xs text-neutral-800 truncate group-hover:text-[#275433]">
                          {u.label}
                        </span>
                        <span className="text-3xs bg-white border border-gray-200 text-neutral-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider flex-shrink-0">
                          {u.role}
                        </span>
                      </div>
                      <p className="text-2xs text-gray-500 truncate font-mono">{u.email}</p>
                      <p className="text-3xs text-gray-400 mt-1 line-clamp-1">{u.desc}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => quickFillAndLogin(u)}
                      className="w-full h-[32px] rounded-lg bg-white border border-[#C7C7C7] group-hover:bg-[#5A861F] group-hover:text-white group-hover:border-[#5A861F] text-xs font-bold text-[#275433] transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer active:scale-98"
                    >
                      <Sparkles size={12} />
                      <span>Masuk sebagai {u.name.split(" ")[0]}</span>
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen w-full flex items-center justify-center bg-[#FAFAFA]">
        <div className="w-8 h-8 rounded-full border-2 border-[#5A861F] border-t-transparent animate-spin" />
      </div>
    }>
      <LoginFormContent />
    </Suspense>
  );
}