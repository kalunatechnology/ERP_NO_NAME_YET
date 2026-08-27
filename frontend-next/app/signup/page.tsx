"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  User,
  Mail,
  Lock,
  Phone,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  Building2,
  CheckCircle2,
  Sparkles,
  Layers,
  Activity,
  Briefcase,
} from "lucide-react";
import { registerUser } from "@/lib/api/auth.api";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

const ROLE_OPTIONS = [
  {
    code: "ROLE-SUPERVISOR",
    title: "Proyek & Operasional Lapangan",
    desc: "Field Supervisor / Project Assignee (Timesheet & WBS)",
    icon: Activity,
  },
  {
    code: "ROLE-PM",
    title: "Project Management",
    desc: "Project Manager (Kurva S, Baseline, Gate Flow)",
    icon: Layers,
  },
  {
    code: "ROLE-FINANCE",
    title: "Keuangan & Akuntansi",
    desc: "Finance Controller (Billing, AR/AP, Jurnal)",
    icon: Briefcase,
  },
  {
    code: "ROLE-STAFF",
    title: "Komersial & Administrasi",
    desc: "Operational & Commercial Support",
    icon: User,
  },
];

export default function SignUpPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    roleCode: "ROLE-SUPERVISOR",
    companyCode: "ARSALYNK",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [loading, setLoading] = useState(false);

  // Password strength calculation
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: "Kosong", color: "bg-slate-200" };
    if (pass.length < 6) return { score: 1, label: "Terlalu Pendek (min. 6)", color: "bg-red-500" };
    const hasNum = /\d/.test(pass);
    const hasSpecial = /[^A-Za-z0-9]/.test(pass);
    const hasUpper = /[A-Z]/.test(pass);

    const score = 1 + (hasNum ? 1 : 0) + (hasSpecial ? 1 : 0) + (hasUpper ? 1 : 0);
    if (score >= 4) return { score: 3, label: "Kuat", color: "bg-emerald-500" };
    if (score >= 2) return { score: 2, label: "Sedang", color: "bg-amber-500" };
    return { score: 1, label: "Lemah", color: "bg-orange-500" };
  };

  const strength = getPasswordStrength(formData.password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.email.trim()) {
      toast.error("Nama lengkap dan Email wajib diisi.");
      return;
    }

    if (!formData.password || formData.password.length < 6) {
      toast.error("Password minimal harus 6 karakter.");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error("Konfirmasi password tidak cocok.");
      return;
    }

    if (!agreeTerms) {
      toast.error("Anda harus menyetujui syarat & ketentuan layanan.");
      return;
    }

    setLoading(true);
    try {
      await registerUser({
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim() ? `+62${formData.phone.trim()}` : "",
        password: formData.password,
        roleCode: formData.roleCode,
        companyCode: formData.companyCode,
      });

      // Synchronize session through AuthContext
      await login(formData.email.trim(), formData.password);
      toast.success("Akun berhasil didaftarkan! Selamat datang di Marka+.", { icon: "🎉" });
      router.push("/dashboard");
    } catch (err: any) {
      console.error("Signup error:", err);
      const errorMsg =
        err?.response?.data?.message ||
        err?.response?.data?.detail ||
        "Pendaftaran gagal. Silakan coba kembali atau gunakan email lain.";
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#F8FAF8] flex items-center justify-center p-3 sm:p-6 lg:p-10 font-sans select-none">
      {/* Outer Card Container */}
      <div className="w-full max-w-[1240px] bg-white border border-slate-200/90 rounded-[28px] overflow-hidden grid grid-cols-1 lg:grid-cols-12 shadow-[0_10px_40px_rgba(14,52,31,0.06)] min-h-[720px]">
        
        {/* LEFT COLUMN: Deep Emerald Brand Atmosphere (5 cols) */}
        <div className="lg:col-span-5 relative p-8 sm:p-10 lg:p-12 flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#0B2A18] via-[#184927] to-[#256338] text-white">
          
          {/* Subtle Decorative Ambient Background */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -ml-20 -mb-20" />

          {/* Top Brand Header */}
          <div className="relative z-10">
            <div className="flex items-center gap-2.5 mb-6">
              <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-emerald-300 font-black shadow-inner">
                M+
              </div>
              <span className="text-lg font-bold tracking-tight text-white">
                Marka<span className="text-emerald-400 font-black">+</span> ERP
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight leading-[1.25] text-white">
              Tingkatkan Kontrol Proyek &amp; Finansial Anda
            </h1>
            <p className="text-xs sm:text-sm text-emerald-100/80 mt-3 leading-relaxed">
              Satu platform terintegrasi untuk WBS, timesheet lapangan, kurva S deviasi real-time, dan tata kelola buku besar WIP.
            </p>
          </div>

          {/* 3 Step Interactive Timeline Cards */}
          <div className="relative z-10 flex flex-col gap-3 my-8">
            <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-3.5 flex items-center gap-3.5 shadow-sm">
              <div className="w-8 h-8 rounded-xl bg-emerald-400 text-[#0B2A18] flex items-center justify-center font-bold text-xs flex-shrink-0">
                1
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white leading-tight">Buat Kredensial Akun</span>
                <span className="text-[11px] text-emerald-200/80">Email kerja resmi &amp; proteksi kata sandi</span>
              </div>
              <CheckCircle2 size={16} className="text-emerald-400 ml-auto flex-shrink-0" />
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 flex items-center gap-3.5">
              <div className="w-8 h-8 rounded-xl bg-white/10 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                2
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white leading-tight">Terhubung ke PT. Arsalynt</span>
                <span className="text-[11px] text-emerald-200/80">Konteks multi-tenant perusahaan otomatis</span>
              </div>
              <Building2 size={15} className="text-emerald-300/60 ml-auto flex-shrink-0" />
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 flex items-center gap-3.5">
              <div className="w-8 h-8 rounded-xl bg-white/10 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                3
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white leading-tight">Aktivasi Role &amp; WBS Workspace</span>
                <span className="text-[11px] text-emerald-200/80">Akses instan modul proyek &amp; dashboard</span>
              </div>
              <ShieldCheck size={16} className="text-emerald-300/60 ml-auto flex-shrink-0" />
            </div>
          </div>

          {/* Security Assurance Footer */}
          <div className="relative z-10 pt-4 border-t border-white/10 flex items-center justify-between text-[11px] text-emerald-200/70">
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-emerald-400" />
              256-Bit SSL Enterprise Security
            </span>
            <span>PT. Arsalynt Multi Integra</span>
          </div>
        </div>

        {/* RIGHT COLUMN: Modern Registration Form (7 cols) */}
        <div className="lg:col-span-7 p-6 sm:p-10 lg:p-12 flex flex-col justify-center bg-white overflow-y-auto">
          <div className="max-w-[520px] w-full mx-auto">
            
            {/* Header */}
            <div className="mb-6">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-[11px] font-semibold text-[#184927] mb-2">
                <Sparkles size={12} className="text-emerald-600" />
                Registrasi Pengguna Resmi
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0E341F] tracking-tight">
                Daftar Akun Baru
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Lengkapi identitas untuk mendapatkan akses ke workspace ERP.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {/* Row 1: Full Name */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">Nama Lengkap</label>
                <div className="relative flex items-center">
                  <User size={15} className="absolute left-3.5 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Rian Destianto"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full h-10 pl-10 pr-3.5 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:bg-white focus:outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-all"
                  />
                </div>
              </div>

              {/* Row 2: Email & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Email */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700">Email Kerja / Resmi</label>
                  <div className="relative flex items-center">
                    <Mail size={15} className="absolute left-3.5 text-slate-400 pointer-events-none" />
                    <input
                      type="email"
                      required
                      placeholder="nama@arsalynk.id"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full h-10 pl-10 pr-3.5 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:bg-white focus:outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-all"
                    />
                  </div>
                </div>

                {/* WhatsApp / Phone */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700">Nomor WhatsApp (Opsional)</label>
                  <div className="relative flex items-center h-10 rounded-xl bg-slate-50 border border-slate-200 overflow-hidden focus-within:bg-white focus-within:border-emerald-600 focus-within:ring-1 focus-within:ring-emerald-600 transition-all">
                    <span className="h-full px-3 bg-slate-100 border-r border-slate-200 flex items-center text-xs font-semibold text-slate-600 select-none">
                      +62
                    </span>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full h-full px-3 text-xs bg-transparent text-slate-800 focus:outline-hidden"
                      placeholder="81234567890"
                    />
                  </div>
                </div>
              </div>

              {/* Row 3: Role Selection */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">Departemen / Peran Operasional</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ROLE_OPTIONS.map((r) => {
                    const Icon = r.icon;
                    const isSelected = formData.roleCode === r.code;
                    return (
                      <button
                        key={r.code}
                        type="button"
                        onClick={() => setFormData({ ...formData, roleCode: r.code })}
                        className={cn(
                          "flex items-start gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer",
                          isSelected
                            ? "bg-emerald-50/90 border-emerald-500 shadow-2xs"
                            : "bg-slate-50/70 border-slate-200/80 hover:bg-slate-50 hover:border-slate-300"
                        )}
                      >
                        <div
                          className={cn(
                            "w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5",
                            isSelected ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"
                          )}
                        >
                          <Icon size={13} />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span
                            className={cn(
                              "text-xs font-bold truncate leading-tight",
                              isSelected ? "text-emerald-900" : "text-slate-800"
                            )}
                          >
                            {r.title}
                          </span>
                          <span className="text-[10px] text-slate-500 truncate mt-0.5">{r.desc}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Row 4: Password & Confirm Password */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Password */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700">Kata Sandi</label>
                  <div className="relative flex items-center">
                    <Lock size={15} className="absolute left-3.5 text-slate-400 pointer-events-none" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      placeholder="Minimal 6 karakter"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full h-10 pl-10 pr-10 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:bg-white focus:outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700">Konfirmasi Sandi</label>
                  <div className="relative flex items-center">
                    <Lock size={15} className="absolute left-3.5 text-slate-400 pointer-events-none" />
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      required
                      placeholder="Ketik ulang sandi"
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                      className={cn(
                        "w-full h-10 pl-10 pr-10 text-xs rounded-xl bg-slate-50 border text-slate-800 focus:bg-white focus:outline-hidden transition-all",
                        formData.confirmPassword && formData.password !== formData.confirmPassword
                          ? "border-red-400 focus:border-red-500 focus:ring-1 focus:ring-red-500"
                          : "border-slate-200 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                      tabIndex={-1}
                    >
                      {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Password Strength Meter */}
              {formData.password && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden flex gap-1">
                    <div className={cn("h-full rounded-full transition-all duration-300 w-1/3", strength.color)} />
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-300 w-1/3",
                        strength.score >= 2 ? strength.color : "bg-slate-200"
                      )}
                    />
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-300 w-1/3",
                        strength.score >= 3 ? strength.color : "bg-slate-200"
                      )}
                    />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-600 whitespace-nowrap">
                    Kekuatan: {strength.label}
                  </span>
                </div>
              )}

              {/* Terms Checkbox */}
              <label className="flex items-start gap-2 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-[11px] text-slate-600 leading-tight">
                  Saya menyetujui tata kelola data operasional dan ketentuan layanan resmi{" "}
                  <b>PT. Arsalynt Multi Integra</b>.
                </span>
              </label>

              {/* Submit CTA Button */}
              <button
                type="submit"
                disabled={loading}
                className="mt-2 w-full h-11 bg-[#275433] hover:bg-[#1E4327] text-white text-xs sm:text-sm font-bold rounded-xl transition-all shadow-md hover:shadow-lg cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Daftarkan Akun &amp; Mulai</span>
                    <ArrowRight size={15} />
                  </>
                )}
              </button>
            </form>

            {/* Bottom Redirect to Login */}
            <div className="mt-6 pt-4 border-t border-slate-100 text-center text-xs text-slate-600">
              Sudah memiliki akun terdaftar?{" "}
              <Link href="/login" className="font-bold text-[#275433] hover:text-[#184927] hover:underline ml-1">
                Masuk ke Sesi Anda &rarr;
              </Link>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}

