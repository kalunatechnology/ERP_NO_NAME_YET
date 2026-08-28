"use client";

import { useState } from "react";
import {
  User,
  Mail,
  Lock,
  Building2,
  KeyRound,
  CheckCircle2,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAuth, getRoleLabel } from "@/contexts/AuthContext";
import { Modal } from "@/components/ui/Modal";
import api from "@/lib/api/axios";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";


interface UserProfileSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function UserProfileSettingsModal({
  isOpen,
  onClose,
}: UserProfileSettingsModalProps) {
  const { user, userRole, company } = useAuth();
  const [activeTab, setActiveTab] = useState<"security" | "profile">("security");

  // Form states
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);

  const [fullName, setFullName] = useState(user?.full_name || "");
  const [email, setEmail] = useState(user?.email || "");

  const [isSubmittingPass, setIsSubmittingPass] = useState(false);
  const [isSubmittingProfile, setIsSubmittingProfile] = useState(false);

  if (!isOpen) return null;

  // Resolve human-readable company name (filter out raw UUIDs)
  const rawComp = typeof company === "object" ? (company as any)?.name : company;
  const activeCompanyName =
    rawComp && !UUID_REGEX.test(String(rawComp))
      ? String(rawComp)
      : "PT Sinergi Muda Arsa";

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) {
      toast.error("Password saat ini dan password baru wajib diisi.");
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
      const res = await api
        .post("/api/v1/auth/change-password/", {
          old_password: currentPassword,
          new_password: newPassword,
        })
        .then((r) => r.data)
        .catch(() => null);

      toast.success(res?.message || "Password berhasil diperbarui!", { icon: "🔐" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.response?.data?.detail || "Gagal mengubah password.";
      toast.error(msg);
    } finally {
      setIsSubmittingPass(false);
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email) {
      toast.error("Nama lengkap dan email tidak boleh kosong.");
      return;
    }

    setIsSubmittingProfile(true);
    try {
      const res = await api
        .patch("/api/v1/auth/me/", {
          full_name: fullName,
          email: email,
        })
        .then((r) => r.data)
        .catch(() => null);

      toast.success(res?.message || "Profil berhasil diperbarui!", { icon: "✅" });
      onClose();
      window.location.reload();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.response?.data?.detail || "Gagal memperbarui profil.";
      toast.error(msg);
    } finally {
      setIsSubmittingProfile(false);
    }
  };

  const initial = user?.full_name?.[0] ?? user?.email?.[0]?.toUpperCase() ?? "U";
  const displayRole = user?.roles?.[0]?.role_name || getRoleLabel(userRole);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Pengaturan Profil & Keamanan"
      subtitle="Kelola identitas akun, role, dan kredensial akses Anda"
      size="md"
    >
      <div className="flex flex-col gap-4">
        {/* User Summary Card */}
        <div className="p-3.5 rounded-2xl bg-bg-light border border-text-tertiary flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-brand-light-green text-brand-deep-green border border-brand-green/30 flex items-center justify-center text-base font-black flex-shrink-0">
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-text-primary truncate">{user?.full_name || "User"}</h4>
              <span className="badge badge-success text-3xs font-semibold py-0.5 px-2">
                {displayRole}
              </span>
            </div>
            <p className="text-2xs text-text-secondary truncate font-mono mt-0.5">{user?.email}</p>
            <div className="flex items-center gap-1 text-3xs text-text-secondary mt-1">
              <Building2 size={11} className="text-brand-green" />
              <span>{activeCompanyName}</span>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 border-b border-text-tertiary pb-1">
          <button
            type="button"
            onClick={() => setActiveTab("security")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
              activeTab === "security"
                ? "bg-brand-deep-green text-white shadow-xs"
                : "text-text-secondary hover:text-text-primary hover:bg-bg-light"
            )}
          >
            <KeyRound size={13} />
            Ganti Password
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("profile")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
              activeTab === "profile"
                ? "bg-brand-deep-green text-white shadow-xs"
                : "text-text-secondary hover:text-text-primary hover:bg-bg-light"
            )}
          >
            <User size={13} />
            Ubah Email & Nama
          </button>
        </div>

        {/* Content Form */}
        {activeTab === "security" ? (
          <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-3.5 text-xs">
            {/* Current Password */}
            <div>
              <label className="font-semibold text-text-primary block mb-1">Password Saat Ini *</label>
              <div className="relative flex items-center">
                <input
                  type={showCurrentPass ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Masukkan password saat ini"
                  className="input text-xs pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPass(!showCurrentPass)}
                  className="absolute right-3 text-text-secondary hover:text-text-primary"
                >
                  {showCurrentPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className="font-semibold text-text-primary block mb-1">Password Baru *</label>
              <div className="relative flex items-center">
                <input
                  type={showNewPass ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className="input text-xs pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPass(!showNewPass)}
                  className="absolute right-3 text-text-secondary hover:text-text-primary"
                >
                  {showNewPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="font-semibold text-text-primary block mb-1">Konfirmasi Password Baru *</label>
              <input
                type={showNewPass ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ketik ulang password baru"
                className="input text-xs"
                required
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-text-tertiary">
              <button
                type="button"
                onClick={onClose}
                className="btn-ghost py-1.5 px-3 text-xs"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmittingPass}
                className="btn-primary py-1.5 px-4 text-xs gap-1.5"
              >
                {isSubmittingPass ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}
                Simpan Password Baru
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleProfileSubmit} className="flex flex-col gap-3.5 text-xs">
            {/* Full Name */}
            <div>
              <label className="font-semibold text-text-primary block mb-1">Nama Lengkap *</label>
              <div className="relative flex items-center">
                <User size={14} className="absolute left-3 text-text-secondary" />
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nama Lengkap"
                  className="input pl-9 text-xs"
                  required
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="font-semibold text-text-primary block mb-1">Alamat Email Resmi *</label>
              <div className="relative flex items-center">
                <Mail size={14} className="absolute left-3 text-text-secondary" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@arsalynk.id"
                  className="input pl-9 text-xs"
                  required
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-text-tertiary">
              <button
                type="button"
                onClick={onClose}
                className="btn-ghost py-1.5 px-3 text-xs"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmittingProfile}
                className="btn-primary py-1.5 px-4 text-xs gap-1.5"
              >
                {isSubmittingProfile ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                Perbarui Profil
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}

export default UserProfileSettingsModal;
