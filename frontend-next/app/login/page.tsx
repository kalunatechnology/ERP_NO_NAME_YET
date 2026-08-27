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
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import toast from "react-hot-toast";

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

  const {
    register,
    handleSubmit,
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

  if (authLoading) return null;

  return (
    <div className="min-h-screen w-full bg-[#F8FAF8] flex items-center justify-center p-4 sm:p-6 lg:p-10 font-sans select-none">
      <div className="w-full max-w-[1080px]">
        {/* ── CARD LOGIN ── */}
        <div className="w-full bg-white border border-slate-200/90 rounded-[28px] overflow-hidden grid grid-cols-1 lg:grid-cols-[440px_1fr] shadow-[0_10px_40px_rgba(14,52,31,0.06)] min-h-[580px]">
          
          {/* ── LEFT COLUMN: Hero Atmospheric Banner ── */}
          <div
            className="relative p-8 sm:p-10 lg:p-12 flex flex-col justify-between overflow-hidden rounded-[22px] m-2 min-h-[300px] lg:min-h-[540px] text-white bg-gradient-to-br from-[#0B2A18] via-[#184927] to-[#256338]"
          >
            {/* Ambient Glow */}
            <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16" />
            <div className="absolute bottom-0 left-0 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -ml-16 -mb-16" />

            {/* Top Branding */}
            <div className="relative z-10">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-emerald-300 font-black shadow-inner">
                  M+
                </div>
                <span className="text-xl font-bold tracking-tight text-white">
                  Marka<span className="text-emerald-400 font-black">+</span> ERP
                </span>
              </div>
              <p className="text-emerald-100/80 text-xs sm:text-sm font-medium">
                Enterprise Resource Planning Workspace
              </p>
            </div>

            {/* Bottom Info */}
            <div className="relative z-10 mt-auto pt-8">
              <h2 className="text-white text-2xl font-bold tracking-tight leading-tight">
                Selamat Datang Kembali
              </h2>
              <p className="text-emerald-100/80 text-xs sm:text-sm mt-2 leading-relaxed">
                Akses modul operasional, monitoring WBS kurva S real-time, cashflow proyek, dan penagihan termin dalam satu platform terpadu.
              </p>

              <div className="pt-6 mt-6 border-t border-white/10 flex items-center gap-2 text-[11px] text-emerald-200/70">
                <ShieldCheck size={14} className="text-emerald-400" />
                <span>PT. Arsalynt Multi Integra &bull; Multi-Tenant IAM</span>
              </div>
            </div>
          </div>

          {/* ── RIGHT COLUMN: Clean Login Form (Email/Username + Password only) ── */}
          <div className="relative flex flex-col justify-center px-6 sm:px-12 lg:px-16 py-10">
            <div className="max-w-[380px] w-full mx-auto">
              {/* Header */}
              <div className="mb-7">
                <h2 className="text-[#0E341F] text-2xl sm:text-3xl font-extrabold tracking-tight">
                  Log In
                </h2>
                <p className="text-slate-500 text-xs sm:text-sm mt-1">
                  Masukkan email atau username dan kata sandi Anda.
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
                {/* Field: Email / Username */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    Email atau Username
                  </label>
                  <div className="relative flex items-center h-[46px] rounded-[12px] bg-slate-50 border border-slate-200 focus-within:bg-white focus-within:border-emerald-600 focus-within:ring-1 focus-within:ring-emerald-600 transition-all">
                    <div className="pl-3.5 pr-2 text-slate-400">
                      <Mail size={16} />
                    </div>
                    <input
                      type="text"
                      {...register("emailOrUsername", {
                        required: "Email atau username wajib diisi",
                      })}
                      placeholder="nama@arsalynk.id atau username"
                      autoComplete="username"
                      className="w-full h-full pr-3.5 bg-transparent text-sm text-slate-800 focus:outline-hidden placeholder:text-slate-400"
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
                    <label className="text-xs font-semibold text-slate-700">
                      Kata Sandi
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="text-[11px] text-emerald-700 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      {showPw ? <EyeOff size={12} /> : <Eye size={12} />}
                      <span>{showPw ? "Sembunyikan" : "Tampilkan"}</span>
                    </button>
                  </div>

                  <div className="relative flex items-center h-[46px] rounded-[12px] bg-slate-50 border border-slate-200 focus-within:bg-white focus-within:border-emerald-600 focus-within:ring-1 focus-within:ring-emerald-600 transition-all">
                    <div className="pl-3.5 pr-2 text-slate-400">
                      <Lock size={16} />
                    </div>
                    <input
                      type={showPw ? "text" : "password"}
                      {...register("password", {
                        required: "Kata sandi wajib diisi",
                      })}
                      placeholder="Masukkan kata sandi"
                      autoComplete="current-password"
                      className="w-full h-full pr-10 bg-transparent text-sm text-slate-800 focus:outline-hidden placeholder:text-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
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

                {/* Remember Me */}
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      {...register("rememberMe")}
                      className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Ingat Sesi Saya</span>
                  </label>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-2 w-full h-[48px] bg-[#275433] hover:bg-[#1E4327] text-white text-sm font-bold rounded-[12px] transition-all shadow-md hover:shadow-lg cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  <span>{submitting ? "Memverifikasi..." : "Masuk ke Sesi"}</span>
                  <ArrowRight size={16} />
                </button>
              </form>

              {/* Bottom Redirect to Sign Up */}
              <div className="mt-8 pt-4 border-t border-slate-100 text-center text-xs text-slate-600">
                Belum memiliki akun?{" "}
                <Link href="/signup" className="font-bold text-[#275433] hover:text-[#184927] hover:underline ml-1">
                  Daftar Akun Baru &rarr;
                </Link>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full flex items-center justify-center bg-[#F8FAF8]">
          <div className="w-8 h-8 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin" />
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}