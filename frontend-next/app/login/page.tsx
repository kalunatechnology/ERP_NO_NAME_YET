"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Eye, EyeOff, LogIn, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

const DEMO_USERS = [
  // Arsalynk Production & Database Accounts
  { label: "👑 Admin System (Arsalynk)",     email: "admin@arsalynk.id",                 password: "DummyPass123!", cat: "exec" },
  { label: "🏛️ Executive Director",          email: "director@arsalynk.id",              password: "DummyPass123!", cat: "exec" },
  { label: "🏗️ Project Manager",              email: "pm@arsalynk.id",                    password: "DummyPass123!", cat: "pm"   },
  { label: "👷 Field Supervisor / Assignee",  email: "supervisor@arsalynk.id",            password: "DummyPass123!", cat: "pm"   },
  { label: "👔 CRM Manager",                  email: "manager@arsalynk.id",               password: "DummyPass123!", cat: "crm"  },
  { label: "🧑‍💼 Commercial & Sales Staff",    email: "sales@arsalynk.id",                 password: "DummyPass123!", cat: "crm"  },
  { label: "💼 Finance Controller",           email: "finance@arsalynk.id",               password: "DummyPass123!", cat: "fin"  },

  // Prototype Mirror Accounts
  { label: "👑 Dummy Admin",                  email: "dummy.admin@example.com",           password: "DummyPass123!", cat: "exec" },
  { label: "🏗️ Dummy Project Manager",        email: "dummy.pm@example.com",              password: "DummyPass123!", cat: "pm"   },
  { label: "👷 Dummy Project Assignee",       email: "dummy.assignee@example.com",        password: "DummyPass123!", cat: "pm"   },
  { label: "👔 Dummy CRM Manager",            email: "dummy.manager@example.com",         password: "DummyPass123!", cat: "crm"  },
  { label: "🧑‍💼 Dummy CRM Staff",             email: "dummy.staff@example.com",           password: "DummyPass123!", cat: "crm"  },
  { label: "💰 Dummy Finance Staff",          email: "dummy.finance@example.com",         password: "DummyPass123!", cat: "fin"  },
  { label: "🏛️ Executive Demo",               email: "executive.demo@erp.local",          password: "DummyPass123!", cat: "exec" },
];

interface LoginForm { email: string; password: string; }

export default function LoginPage() {
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [showPw, setShowPw] = useState(false);
  const [filterCat, setFilterCat] = useState("all");
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<LoginForm>();

  /* Redirect if already authenticated */
  useEffect(() => {
    if (!authLoading && isAuthenticated) router.replace("/dashboard");
  }, [isAuthenticated, authLoading, router]);

  const onSubmit = async ({ email, password }: LoginForm) => {
    setSubmitting(true);
    try {
      await login(email, password);
      toast.success("Berhasil masuk!");
      router.push("/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Email atau password salah";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const quickLogin = (email: string, password: string) => {
    setValue("email", email);
    setValue("password", password);
    handleSubmit(onSubmit)();
  };

  const filtered = filterCat === "all" ? DEMO_USERS : DEMO_USERS.filter(u => u.cat === filterCat);

  if (authLoading) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-light-green via-white to-white flex items-center justify-center p-4">
      <div className="w-full max-w-xl">

        {/* Brand header */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: "linear-gradient(180deg, #7CDA24 0%, #3E9B4B 100%)" }}
          >
            <span className="text-white font-bold text-2xl">M+</span>
          </div>
          <h1 className="text-2xl font-bold text-brand-deep-green">Marka+ ERP</h1>
          <p className="text-sm text-text-secondary mt-1">Project Management · Finance · CRM</p>
        </div>

        <div className="card p-8 rounded-2xl shadow-card-md">

          {/* Login Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-text-primary mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="email@perusahaan.com"
                className={cn("input", errors.email && "border-red-400 focus:ring-red-400")}
                {...register("email", { required: "Email wajib diisi" })}
              />
              {errors.email && (
                <p className="flex items-center gap-1 mt-1 text-xs text-red-500">
                  <AlertCircle size={12} /> {errors.email.message}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-text-primary mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={cn("input pr-10", errors.password && "border-red-400 focus:ring-red-400")}
                  {...register("password", { required: "Password wajib diisi", minLength: { value: 6, message: "Password minimal 6 karakter" } })}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
                  aria-label={showPw ? "Sembunyikan password" : "Tampilkan password"}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && (
                <p className="flex items-center gap-1 mt-1 text-xs text-red-500">
                  <AlertCircle size={12} /> {errors.password.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className={cn(
                "btn-primary w-full justify-center py-3 mt-2",
                submitting && "opacity-60 cursor-not-allowed"
              )}
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Masuk…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <LogIn size={16} /> Masuk
                </span>
              )}
            </button>
          </form>

          {/* Demo users */}
          <div className="mt-6 pt-6 border-t border-text-tertiary">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                Akun Demo Tersedia
              </p>
              <span className="badge badge-info">{filtered.length} akun</span>
            </div>

            {/* Category filter */}
            <div className="flex gap-1.5 mb-3 overflow-x-auto no-scrollbar">
              {[
                { cat: "all", label: "Semua" },
                { cat: "exec", label: "Admin/Exec" },
                { cat: "crm", label: "CRM" },
                { cat: "pm", label: "Project" },
                { cat: "fin", label: "Finance" },
              ].map(({ cat, label }) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFilterCat(cat)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                    filterCat === cat
                      ? "bg-brand-green text-white"
                      : "bg-gray-100 text-text-secondary hover:bg-brand-light-green"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* User cards */}
            <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
              {filtered.map((u) => (
                <div
                  key={u.email}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-text-tertiary bg-gray-50 hover:bg-brand-light-green transition-colors"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-text-primary">{u.label}</span>
                    <span className="text-2xs text-text-secondary">{u.email}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => quickLogin(u.email, u.password)}
                    className="px-3 py-1 rounded-full bg-brand-green text-white text-xs font-medium hover:opacity-90 transition-opacity flex-shrink-0 ml-2"
                  >
                    ⚡ Masuk
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-text-secondary mt-4">
          Marka+ ERP v1.0 · Backend: {process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"}
        </p>
      </div>
    </div>
  );
}
