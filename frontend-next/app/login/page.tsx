"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Server,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Copy,
  Check,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

const DEMO_USERS = [
  // Arsalynk Production & Database Accounts
  { label: "👑 Admin System (Arsalynk)",     name: "Sutanto Admin",     email: "admin@arsalynk.id",         password: "DummyPass123!", role: "Super Administrator", cat: "exec", desc: "Akses penuh multi-tenant & semua company" },
  { label: "🏛️ Executive Director",          name: "Bambang Director",  email: "director@arsalynk.id",      password: "DummyPass123!", role: "Direksi / Eksekutif",  cat: "exec", desc: "Observabilitas P&L & persetujuan strategis" },
  { label: "🏗️ Project Manager",              name: "Rina Sari PM",      email: "pm@arsalynk.id",            password: "DummyPass123!", role: "Project Manager",      cat: "pm",   desc: "Manajemen WBS, kurva S, & gate flow" },
  { label: "👷 Field Supervisor / Assignee",  name: "Ahmad Rizki",       email: "supervisor@arsalynk.id",    password: "DummyPass123!", role: "Assignee / Supervisor", cat: "pm",   desc: "Input timesheet harian & checklist lapangan" },
  { label: "👔 CRM Manager",                  name: "Dewi Kurnia",       email: "manager@arsalynk.id",       password: "DummyPass123!", role: "CRM & Sales Lead",     cat: "crm",  desc: "Pipeline komersial, estimasi, & kontrak" },
  { label: "🧑‍💼 Commercial & Sales Staff",    name: "Hendra Sales",      email: "sales@arsalynk.id",         password: "DummyPass123!", role: "Sales & Inquiries",    cat: "crm",  desc: "Pencatatan inquiry pelanggan & quotation" },
  { label: "💼 Finance Controller",           name: "Budi Santoso",      email: "finance@arsalynk.id",       password: "DummyPass123!", role: "Finance Controller",    cat: "fin",  desc: "AR/AP, proposal penagihan, & kas bank" },

  // Prototype Mirror Accounts
  { label: "👑 Dummy Admin",                  name: "Admin Demo",        email: "dummy.admin@example.com",   password: "DummyPass123!", role: "Administrator",        cat: "exec", desc: "Akun simulasi admin prototype" },
  { label: "🏗️ Dummy Project Manager",        name: "PM Demo",           email: "dummy.pm@example.com",      password: "DummyPass123!", role: "Project Manager",      cat: "pm",   desc: "Akun simulasi PM prototype" },
  { label: "💰 Dummy Finance Staff",          name: "Finance Demo",      email: "dummy.finance@example.com", password: "DummyPass123!", role: "Accounting Staff",     cat: "fin",  desc: "Akun simulasi verifikasi keuangan" },
];

const CATEGORIES = [
  { id: "all",  label: "Semua Akun (10)" },
  { id: "exec", label: "👑 Executive & Admin" },
  { id: "pm",   label: "🏗️ Project Management" },
  { id: "crm",  label: "👔 CRM & Sales" },
  { id: "fin",  label: "💼 Finance & Accounting" },
];

interface LoginFormInputs {
  emailOrUsername: string;
  password: string;
  rememberMe?: boolean;
}

function LoginFormContent() {
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showDevPanel, setShowDevPanel] = useState(true);
  const [filterCat, setFilterCat] = useState("all");
  const [isLocalHostEnv, setIsLocalHostEnv] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Deteksi lingkungan localhost atau IP numerik (misal 127.0.0.1, 192.168.x.x, dll)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const hostname = window.location.hostname;
      const isLocalhost =
        hostname === "localhost" ||
        hostname === "0.0.0.0" ||
        hostname.endsWith(".local") ||
        hostname.endsWith(".test") ||
        hostname.endsWith(".internal");
      const isIpv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
      const isIpv6 = hostname === "[::1]" || hostname === "::1";

      setIsLocalHostEnv(isLocalhost || isIpv4 || isIpv6);
    }
  }, []);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormInputs>({
    defaultValues: {
      emailOrUsername: "",
      password: "",
      rememberMe: false,
    },
  });

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, authLoading, router]);

  const onSubmit = async (data: LoginFormInputs) => {
    const ident = data.emailOrUsername?.trim();
    const pw = data.password;

    if (!ident || !pw) {
      toast.error("Silakan masukkan email/username dan kata sandi");
      return;
    }

    setSubmitting(true);
    try {
      await login(ident, pw);
      toast.success("Berhasil masuk ke Marka+ ERP");
      router.push("/dashboard");
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Gagal autentikasi. Silakan periksa email/username dan kata sandi Anda.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const quickFillAndLogin = (u: typeof DEMO_USERS[0]) => {
    setValue("emailOrUsername", u.email);
    setValue("password", u.password);
    onSubmit({ emailOrUsername: u.email, password: u.password });
  };

  const handleCopy = (text: string, key: string, label: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      toast.success(`${label} berhasil disalin!`);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 2000);
    }
  };

  const filteredUsers =
    filterCat === "all"
      ? DEMO_USERS
      : DEMO_USERS.filter((u) => u.cat === filterCat);

  if (authLoading) return null;

  return (
    <div className="min-h-screen w-full bg-[#FAFAFA] flex flex-col items-center justify-start py-8 px-4 sm:px-6 lg:px-8 font-sans select-none">
      <div className="w-full max-w-[1200px] flex flex-col gap-6 my-auto">
        {/* ── CARD LOGIN ── */}
        <div className="w-full bg-white border border-[#E5E7EB] rounded-[24px] overflow-hidden grid grid-cols-1 lg:grid-cols-[440px_1fr] shadow-sm">
          
          {/* ── LEFT COLUMN: Hero Atmospheric Banner ── */}
          <div
            className="relative p-8 sm:p-10 lg:p-12 flex flex-col justify-between overflow-hidden rounded-[20px] m-2 min-h-[320px] lg:min-h-[520px]"
            style={{
              background: "linear-gradient(180deg, #2C4906 0%, #99BA6D 100%)",
            }}
          >
            {/* Ambient Glow */}
            <div
              className="absolute inset-0 opacity-15 pointer-events-none mix-blend-overlay"
              style={{
                backgroundImage: `radial-gradient(circle at 50% 50%, rgba(255,255,255,0.4) 0%, transparent 80%)`,
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

            {/* Bottom Info */}
            <div className="relative z-10 mt-auto pt-8">
              <h2 className="text-white text-xl sm:text-2xl font-bold tracking-tight">
                Selamat Datang Kembali
              </h2>
              <p className="text-white/80 text-xs sm:text-sm mt-2 leading-relaxed">
                Akses dashboard operasional, pantau progres proyek, keuangan, dan layanan komersial dalam satu portal terpadu.
              </p>
            </div>
          </div>

          {/* ── RIGHT COLUMN: Clean Login Form (Email/Username + Password only) ── */}
          <div className="relative flex flex-col justify-center px-6 sm:px-12 lg:px-16 py-10">
            <div className="max-w-[400px] w-full mx-auto">
              {/* Header */}
              <div className="mb-6">
                <h2 className="text-[#275433] text-2xl sm:text-3xl font-extrabold tracking-tight">
                  Log In
                </h2>
                <p className="text-neutral-500 text-xs mt-1">
                  Masukkan email atau username dan kata sandi Anda.
                </p>
              </div>

              {/* Form: Only Email/Username and Password */}
              <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
                {/* Field: Email / Username */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[#275433]">
                    Email atau Username
                  </label>
                  <div className="relative flex items-center h-[46px] rounded-[12px] bg-[#F9FAFB] border border-[#D1D5DB] focus-within:bg-white focus-within:border-[#5A861F] focus-within:ring-2 focus-within:ring-[#5A861F]/20 transition-all">
                    <div className="pl-3.5 pr-2 text-neutral-400">
                      <Mail size={16} />
                    </div>
                    <input
                      type="text"
                      {...register("emailOrUsername", {
                        required: "Email atau username wajib diisi",
                      })}
                      placeholder="nama@perusahaan.com atau username"
                      autoComplete="username"
                      className="w-full h-full pr-3.5 bg-transparent text-sm text-neutral-800 focus:outline-none placeholder:text-neutral-400"
                    />
                  </div>
                  {errors.emailOrUsername && (
                    <span className="text-[11px] text-red-500 mt-0.5">
                      {errors.emailOrUsername.message}
                    </span>
                  )}
                </div>

                {/* Field: Password */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-[#275433]">
                      Kata Sandi
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="text-[11px] text-[#5A861F] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      {showPw ? <EyeOff size={12} /> : <Eye size={12} />}
                      <span>{showPw ? "Sembunyikan" : "Tampilkan"}</span>
                    </button>
                  </div>

                  <div className="relative flex items-center h-[46px] rounded-[12px] bg-[#F9FAFB] border border-[#D1D5DB] focus-within:bg-white focus-within:border-[#5A861F] focus-within:ring-2 focus-within:ring-[#5A861F]/20 transition-all">
                    <div className="pl-3.5 pr-2 text-neutral-400">
                      <Lock size={16} />
                    </div>
                    <input
                      type={showPw ? "text" : "password"}
                      {...register("password", {
                        required: "Kata sandi wajib diisi",
                      })}
                      placeholder="Masukkan kata sandi"
                      autoComplete="current-password"
                      className="w-full h-full pr-10 bg-transparent text-sm text-neutral-800 focus:outline-none placeholder:text-neutral-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 text-neutral-400 hover:text-neutral-600 transition-colors cursor-pointer"
                      aria-label={showPw ? "Sembunyikan password" : "Tampilkan password"}
                    >
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {errors.password && (
                    <span className="text-[11px] text-red-500 mt-0.5">
                      {errors.password.message}
                    </span>
                  )}
                </div>

                {/* Remember Me & Forgot Password */}
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 text-xs text-neutral-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      {...register("rememberMe")}
                      className="w-4 h-4 rounded border-gray-300 text-[#5A861F] focus:ring-[#5A861F]"
                    />
                    <span>Ingat Saya</span>
                  </label>
                  <span className="text-xs text-neutral-400 hover:text-[#275433] transition-colors cursor-pointer">
                    Lupa sandi?
                  </span>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-2 w-full h-[48px] bg-[#5A861F] hover:bg-[#4a7018] text-white text-sm font-bold rounded-[12px] transition-all shadow-sm cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2 active:scale-[0.99]"
                >
                  <span>{submitting ? "Memverifikasi..." : "Masuk ke Akun"}</span>
                  <ArrowRight size={16} />
                </button>
              </form>

              {/* Bottom Redirect */}
              <div className="mt-8 text-center text-xs font-medium text-neutral-600">
                Belum memiliki akun?{" "}
                <Link href="/signup" className="font-bold text-[#5A861F] hover:underline">
                  Daftar Akun Baru
                </Link>
              </div>
            </div>
          </div>

        </div>

        {/* ── PRESET DEMO ACCOUNTS PANEL (Hanya di Localhost/IP) ── */}
        {isLocalHostEnv && (
          <div className="w-full bg-white border border-[#E5E7EB] rounded-[20px] p-6 shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#F0FEE0] flex items-center justify-center text-[#5A861F]">
                  <Server size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[#275433]">Daftar Akun &amp; Kredensial Cepat (Copy / 1-Click Login)</h3>
                    <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full uppercase">
                      Dev / Localhost / IP Only
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Klik tombol <strong>Salin</strong> pada email / password di bawah, atau klik tombol <strong>Masuk Langsung</strong>.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowDevPanel(!showDevPanel)}
                className="text-xs font-semibold text-[#5A861F] hover:text-[#436e24] flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F0FEE0] transition-colors cursor-pointer"
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
                        "px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer",
                        filterCat === c.id
                          ? "bg-[#5A861F] text-white shadow-xs"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      )}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                {/* Grid of Preset Cards with Copy Functionality */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1">
                  {filteredUsers.map((u) => {
                    const emailKey = `email-${u.email}`;
                    const pwKey = `pw-${u.email}`;

                    return (
                      <div
                        key={u.email}
                        className="border border-gray-200 hover:border-[#5A861F] rounded-xl p-3.5 bg-[#FAFAFA] hover:bg-[#F0FEE0]/20 transition-all flex flex-col justify-between gap-3 group shadow-2xs"
                      >
                        <div className="flex flex-col gap-2">
                          {/* Header: Role & Title */}
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-xs text-neutral-900 truncate group-hover:text-[#275433]">
                              {u.label}
                            </span>
                            <span className="text-[9px] bg-white border border-gray-200 text-neutral-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider flex-shrink-0">
                              {u.role}
                            </span>
                          </div>

                          {/* Email Field with Copy */}
                          <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-2.5 py-1.5">
                            <div className="flex flex-col min-w-0 pr-2">
                              <span className="text-[9px] uppercase font-bold text-gray-400">Email / User</span>
                              <span className="text-[11px] text-neutral-800 font-mono font-medium truncate">{u.email}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCopy(u.email, emailKey, "Email")}
                              title="Salin Email"
                              className="p-1.5 rounded-md text-gray-400 hover:text-[#5A861F] hover:bg-neutral-100 transition-colors flex-shrink-0 cursor-pointer"
                            >
                              {copiedKey === emailKey ? (
                                <Check size={13} className="text-green-600" />
                              ) : (
                                <Copy size={13} />
                              )}
                            </button>
                          </div>

                          {/* Password Field with Copy */}
                          <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-2.5 py-1.5">
                            <div className="flex flex-col min-w-0 pr-2">
                              <span className="text-[9px] uppercase font-bold text-gray-400">Password</span>
                              <span className="text-[11px] text-neutral-800 font-mono font-medium truncate">{u.password}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCopy(u.password, pwKey, "Password")}
                              title="Salin Password"
                              className="p-1.5 rounded-md text-gray-400 hover:text-[#5A861F] hover:bg-neutral-100 transition-colors flex-shrink-0 cursor-pointer"
                            >
                              {copiedKey === pwKey ? (
                                <Check size={13} className="text-green-600" />
                              ) : (
                                <Copy size={13} />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* 1-Click Quick Login CTA */}
                        <button
                          type="button"
                          onClick={() => quickFillAndLogin(u)}
                          className="w-full h-[32px] rounded-lg bg-white border border-[#D1D5DB] group-hover:bg-[#5A861F] group-hover:text-white group-hover:border-[#5A861F] text-xs font-bold text-[#275433] transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer active:scale-98"
                        >
                          <Sparkles size={12} />
                          <span>Masuk Langsung ({u.name.split(" ")[0]})</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full flex items-center justify-center bg-[#FAFAFA]">
          <div className="w-8 h-8 rounded-full border-2 border-[#5A861F] border-t-transparent animate-spin" />
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}