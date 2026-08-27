"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
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
    <div className="min-h-screen w-full bg-[#FAFAFA] flex items-center justify-center p-4 sm:p-6 lg:p-8 font-sans select-none">
      {/* ── CARD CONTAINER ── */}
      <div className="w-full max-w-[1040px] bg-white border border-[#E5E7EB] rounded-[24px] overflow-hidden grid grid-cols-1 lg:grid-cols-[420px_1fr] shadow-lg shadow-black/[0.03]">
        
        {/* ── LEFT COLUMN: Atmospheric Branding Banner ── */}
        <div
          className="relative p-8 sm:p-10 lg:p-12 flex flex-col justify-between overflow-hidden rounded-[20px] m-2 min-h-[300px] lg:min-h-[520px]"
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
              Masuk untuk mengakses manajemen proyek, laporan keuangan terintegrasi, dan operasional bisnis Anda.
            </p>
          </div>
        </div>

        {/* ── RIGHT COLUMN: Clean Login Form ── */}
        <div className="relative flex flex-col justify-center px-6 sm:px-12 lg:px-16 py-10">
          <div className="max-w-[380px] w-full mx-auto">
            {/* Form Header */}
            <div className="mb-6">
              <h2 className="text-[#275433] text-2xl sm:text-3xl font-extrabold tracking-tight">
                Log In
              </h2>
              <p className="text-neutral-500 text-xs mt-1">
                Masukkan email atau username dan kata sandi Anda.
              </p>
            </div>

            {/* Form */}
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
                    className="text-[11px] text-[#5A861F] font-semibold hover:underline flex items-center gap-1"
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
                    className="absolute right-3 text-neutral-400 hover:text-neutral-600 transition-colors"
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

              {/* Submit CTA */}
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