"use client";

import React, { useState } from "react";
import {
  X,
  Lock,
  Mail,
  User,
  ShieldCheck,
  Building2,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { changePassword, updateUserProfile } from "@/lib/api/auth.api";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface UserProfileSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UserProfileSettingsModal({ isOpen, onClose }: UserProfileSettingsModalProps) {
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<"security" | "profile">("security");

  // Form State - Security / Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [isSubmittingPass, setIsSubmittingPass] = useState(false);

  // Form State - Profile & Email
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [isSubmittingProfile, setIsSubmittingProfile] = useState(false);

  if (!isOpen) return null;

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      toast.error("Silakan masukkan password saat ini.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password baru minimal harus 6 karakter.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Konfirmasi password baru tidak cocok.");
      return;
    }

    setIsSubmittingPass(true);
    try {
      await changePassword(currentPassword, newPassword);
      toast.success("Password berhasil diubah!", { icon: "🔑" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.response?.data?.detail || "Gagal mengubah password. Periksa password lama Anda.";
      toast.error(msg);
    } finally {
      setIsSubmittingPass(false);
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) {
      toast.error("Nama dan email tidak boleh kosong.");
      return;
    }

    setIsSubmittingProfile(true);
    try {
      const res = await updateUserProfile({ full_name: fullName.trim(), email: email.trim() });
      toast.success(res?.message || "Profil berhasil diperbarui!", { icon: "✅" });
      onClose();
      // Reload page to reflect user updates
      window.location.reload();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.response?.data?.detail || "Gagal memperbarui profil.";
      toast.error(msg);
    } finally {
      setIsSubmittingProfile(false);
    }
  };

  const initial = user?.full_name?.[0] ?? user?.email?.[0]?.toUpperCase() ?? "U";
  const userRole = user?.roles?.[0]?.role_name || (user?.is_superuser ? "Executive Administrator" : "Team Member");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-lg bg-white rounded-3xl border border-slate-200/90 shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Profile Banner */}
        <div className="bg-gradient-to-r from-[#0E341F] to-[#1E5631] text-white p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            aria-label="Tutup"
          >
            <X size={18} />
          </button>

          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-xl font-black text-emerald-300 shadow-inner">
              {initial}
            </div>
            <div className="flex flex-col min-w-0">
              <h2 className="text-lg font-bold truncate leading-tight">{user?.full_name || "User"}</h2>
              <span className="text-xs text-emerald-200/90 truncate font-mono mt-0.5">{user?.email}</span>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[11px] font-semibold bg-emerald-400/20 border border-emerald-300/30 px-2 py-0.5 rounded-md flex items-center gap-1">
                  <ShieldCheck size={12} className="text-emerald-300" />
                  {userRole}
                </span>
                <span className="text-[11px] text-white/70 flex items-center gap-1">
                  <Building2 size={12} />
                  PT. Arsalynt
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-slate-100 bg-slate-50/70 px-6 pt-2">
          <button
            onClick={() => setActiveTab("security")}
            className={cn(
              "flex items-center gap-2 py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer",
              activeTab === "security"
                ? "border-[#275433] text-[#275433]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            <KeyRound size={15} />
            Ganti Password
          </button>
          <button
            onClick={() => setActiveTab("profile")}
            className={cn(
              "flex items-center gap-2 py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer",
              activeTab === "profile"
                ? "border-[#275433] text-[#275433]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            <User size={15} />
            Ubah Email & Nama
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6">
          {activeTab === "security" ? (
            <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
              <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-3 text-xs text-amber-800 flex items-start gap-2.5">
                <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Gunakan password yang kuat dengan minimal 6 karakter. Setelah diubah, gunakan password baru Anda pada login berikutnya.
                </p>
              </div>

              {/* Current Password */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-700">Password Saat Ini</label>
                <div className="relative flex items-center">
                  <input
                    type={showCurrentPass ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Masukkan password saat ini"
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    className="absolute right-3 text-slate-400 hover:text-slate-600"
                  >
                    {showCurrentPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-700">Password Baru</label>
                <div className="relative flex items-center">
                  <input
                    type={showNewPass ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute right-3 text-slate-400 hover:text-slate-600"
                  >
                    {showNewPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-700">Konfirmasi Password Baru</label>
                <input
                  type={showNewPass ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ketik ulang password baru"
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                  required
                />
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPass}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-[#275433] hover:bg-[#1E4327] text-white shadow-xs transition-all disabled:opacity-50"
                >
                  {isSubmittingPass ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                  Simpan Password Baru
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleProfileSubmit} className="flex flex-col gap-4">
              <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-xl p-3 text-xs text-emerald-800 flex items-start gap-2.5">
                <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Perubahan email akan digunakan sebagai identitas akun resmi dan kredensial login Anda.
                </p>
              </div>

              {/* Full Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-700">Nama Lengkap</label>
                <div className="relative flex items-center">
                  <User size={15} className="absolute left-3 text-slate-400" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Nama Lengkap"
                    className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                    required
                  />
                </div>
              </div>

              {/* Email */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-700">Alamat Email Resmi</label>
                <div className="relative flex items-center">
                  <Mail size={15} className="absolute left-3 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@arsalynk.id"
                    className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                    required
                  />
                </div>
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingProfile}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-[#275433] hover:bg-[#1E4327] text-white shadow-xs transition-all disabled:opacity-50"
                >
                  {isSubmittingProfile ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Perbarui Profil
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default UserProfileSettingsModal;
