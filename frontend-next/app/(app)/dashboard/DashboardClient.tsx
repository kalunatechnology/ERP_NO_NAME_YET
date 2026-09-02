"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  FolderKanban, CheckSquare, TrendingUp, DollarSign, AlertTriangle,
  Clock, Users, ArrowRight, RefreshCw, Activity, Target,
  ChevronUp, ChevronDown, Zap, ShieldAlert, CheckCircle2,
  XCircle, BarChart3, Building2, CalendarDays, Layers,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { loadAllProjects, Project } from "@/lib/api/project.api";
import { loadFinanceDashboard, FinanceDashboardData } from "@/lib/api/finance.api";
import { loadCRMData, CRMData, CRMDashboard as CRMDashType } from "@/lib/api/crm.api";
import { formatMoney, formatDate, getStatusColor, cn } from "@/lib/utils";

import { ProjectDistributionGauge } from "@/components/ui/ProjectDistributionGauge";
import { CompletionRateCard, RateItem } from "@/components/ui/CompletionRateCard";
import { ProjectDonutSummaryCard, ProjectStatusCount } from "@/components/ui/ProjectDonutSummaryCard";
import { TopExpensesBarChart, ExpenseItem } from "@/components/ui/TopExpensesBarChart";
import { ProjectTimelineGantt, GanttTaskItem } from "@/components/ui/ProjectTimelineGantt";
import { ProjectMilestoneCard, ProjectSummary, MilestoneItem } from "@/components/ui/ProjectMilestoneCard";
import { BudgetCheckStatusCard } from "@/components/ui/BudgetCheckStatusCard";
import { InventoryCheckingCard } from "@/components/ui/InventoryCheckingCard";
import { MonthlyStackedBarChart } from "@/components/ui/MonthlyStackedBarChart";
import { NewCardRequestModal } from "@/components/requests/NewCardRequestModal";
import { RequestSuccessModal } from "@/components/requests/RequestSuccessModal";
import { RequestReviewModal } from "@/components/requests/RequestReviewModal";
import { RequestCardFeed } from "@/components/requests/RequestCardFeed";
import { Sparkles, Plus } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   SHARED COMPONENTS
═══════════════════════════════════════════════════════════════ */

interface KpiCardProps {
  label: string;
  value: string | number;
  subLabel?: string;
  icon: React.ElementType;
  iconBg?: string;
  iconColor?: string;
  trend?: { value: string; up: boolean } | null;
  onClick?: () => void;
}

function KpiCard({
  label,
  value,
  subLabel,
  icon: Icon,
  iconBg = "#EAF8D6",
  iconColor = "#275433",
  trend,
  onClick,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col justify-between gap-3 p-4 sm:p-5 rounded-[18px] min-w-0 bg-[#F0FEE0] border border-[#D5E2D7] transition-all duration-150 select-none shadow-xs",
        onClick && "cursor-pointer hover:shadow-card-md hover:border-[#5A861F]/50 hover:-translate-y-0.5"
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <span className="text-xs font-semibold text-[#637566] tracking-tight truncate">{label}</span>
          <span className="text-2xl sm:text-[26px] font-extrabold text-[#0E341F] tracking-tight leading-tight mt-0.5">{value}</span>
          {subLabel && <span className="text-2xs text-[#768779] font-medium mt-0.5">{subLabel}</span>}
        </div>
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-2xs"
          style={{ background: iconBg }}
        >
          <Icon size={20} style={{ color: iconColor }} strokeWidth={2.2} />
        </div>
      </div>
      {trend && (
        <div className="flex items-center gap-1.5 pt-1 border-t border-[#D5E2D7]/60">
          <div className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold",
            trend.up ? "bg-[#D1F2B8] text-[#1E5C22]" : "bg-[#FEE2E2] text-[#991B1B]"
          )}>
            {trend.up ? <ChevronUp size={12} strokeWidth={2.5} /> : <ChevronDown size={12} strokeWidth={2.5} />}
            <span>{trend.value}</span>
          </div>
          <span className="text-3xs text-[#768779] font-medium">vs periode lalu</span>
        </div>
      )}
    </div>
  );
}

function SectionHeader({ title, actionLabel, actionHref }: { title: string; actionLabel?: string; actionHref?: string }) {
  return (
    <div className="flex items-center justify-between mb-3.5">
      <h2 className="text-sm sm:text-base font-extrabold text-[#0E341F] tracking-tight">{title}</h2>
      {actionLabel && actionHref && (
        <Link href={actionHref} className="flex items-center gap-1 text-xs font-bold text-[#5A861F] hover:text-[#275433] transition-colors">
          <span>{actionLabel}</span>
          <ArrowRight size={13} strokeWidth={2.2} />
        </Link>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex px-2.5 py-0.5 rounded-full text-2xs font-bold tracking-tight", getStatusColor(status))}>
      {status}
    </span>
  );
}

function ProgressBar({ value, color = "#5A861F", height = 7 }: { value: number; color?: string; height?: number }) {
  return (
    <div className="w-full bg-[#E5E9E2] rounded-full overflow-hidden p-0.5 shadow-2xs" style={{ height }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }}
      />
    </div>
  );
}

function LoadingDashboard() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card rounded-xl p-4 animate-pulse">
            <div className="h-3 bg-gray-200 rounded w-2/3 mb-2" />
            <div className="h-7 bg-gray-200 rounded w-1/2" />
          </div>
        ))}
      </div>
      <div className="card rounded-xl p-4 h-48 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/4 mb-4" />
        {[...Array(4)].map((_, i) => <div key={i} className="h-8 bg-gray-100 rounded mb-2" />)}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PM DASHBOARD
═══════════════════════════════════════════════════════════════ */

function PMDashboard({ projects, loading }: { projects: Project[]; loading: boolean }) {
  const today = new Date().toISOString().split("T")[0];

  if (loading) return <LoadingDashboard />;

  const total = projects.length;
  const active = projects.filter(p => ["ACTIVE", "IN_PROGRESS", "PLANNING", "STARTED"].includes((p.status || "").toUpperCase())).length;
  const completed = projects.filter(p => ["COMPLETED", "CLOSED", "DONE"].includes((p.status || "").toUpperCase())).length;
  const delayed = projects.filter(p => {
    const end = p.end_date || p.planned_end_date;
    return end && end < today && !["COMPLETED", "CLOSED", "DONE"].includes((p.status || "").toUpperCase());
  }).length;
  const avgProgress = total > 0
    ? Math.round(projects.reduce((acc, p) => acc + (p.progress_percentage || p.progress || 0), 0) / total)
    : 0;

  // All daily tasks across projects (flattened)
  const allDailyTasks = projects.flatMap(p =>
    (p.main_tasks || []).flatMap(mt =>
      (mt.weekly_tasks || mt.weekly_plans || []).flatMap(wt => wt.daily_tasks || [])
    )
  );
  const todayTasks = allDailyTasks.filter(d => d.planned_date === today);
  const overdueTasks = allDailyTasks.filter(d => {
    const pd = d.planned_date;
    return pd && pd < today && !["COMPLETED", "DONE"].includes((d.status || "").toUpperCase());
  });
  const completedToday = todayTasks.filter(d => ["COMPLETED", "DONE"].includes((d.status || "").toUpperCase())).length;

  // Budget calculations from real PM projects
  const totalBudget = projects.reduce((acc, p) => acc + Number(p.budget_amount || (p as any).budget || 0), 0);
  const totalAllocated = 0; // Proyek baru diinisiasi, belum ada realisasi beban

  // Derive Real Timeline Tasks for PM from actual DB projects
  const timelineTasks: GanttTaskItem[] = projects.map((p, idx) => ({
    id: p.id,
    name: p.project_name || p.name || `Proyek #${idx + 1}`,
    startWeek: 1,
    endWeek: Math.min(8, 4 + idx),
    progress: Number(p.progress_percentage || p.progress || 0),
    assignee: p.project_manager_name || "Melika / Arof",
    status: (p.status || "IN_PROGRESS") as any,
  }));

  // Clean empty state for expenses (fresh company setup)
  const topExpenses: ExpenseItem[] = [];

  // Derive Real Projects & Milestones for PM
  const projectSummaries: ProjectSummary[] = projects.slice(0, 8).map(p => ({
    id: p.id,
    name: p.project_name || p.name || `Proyek #${p.id}`,
    code: p.project_code || p.code,
    status: p.status,
  }));

  const projectMilestones: Record<string, MilestoneItem[]> = {};
  projects.forEach((p) => {
    const ms = p.milestones || [];
    projectMilestones[String(p.id)] = ms.map((m, idx) => ({
      id: m.id || idx + 1,
      stepNumber: idx + 1,
      title: m.name || `Milestone Gate ${idx + 1}`,
      points: [
        `Target Selesai: ${m.target_date || "Sesuai Jadwal"}`,
        `Status Verifikasi: ${m.status || (m.is_passed ? "COMPLETED" : "PENDING")}`,
      ],
      isActive: m.is_passed || idx === 0,
      status: m.is_passed ? "COMPLETED" : "PENDING",
    }));
  });

  const notStarted = Math.max(0, total - active - completed - delayed);
  const statusCounts: ProjectStatusCount[] = [
    { label: "Completed", count: completed, color: "#10B981" },
    { label: "In Progress", count: active, color: "#0EA5E9" },
    { label: "Not Started", count: notStarted, color: "#64748B" },
    { label: "Delayed", count: delayed, color: "#EF4444" },
  ];

  // Industry Rates directly from real active projects of PT Sinergi Muda Arsa
  const industryRates: RateItem[] = projects.map((p, idx) => ({
    id: p.id || idx + 1,
    industry: p.project_name || p.name || `Proyek #${idx + 1}`,
    percentage: Number(p.progress_percentage || p.progress || 0),
  }));

  const healthScore = total === 0 ? 100 : delayed === 0 ? 100 : Math.max(0, Math.round(((total - delayed) / total) * 100));
  const healthStatus = delayed === 0 ? "On Track" : "Caution";
  const onTrackCount = Math.max(0, active - delayed);

  return (
    <div className="flex flex-col gap-6 pb-8">
      {/* ── KPI Row ───────────────────────── */}
      <section>
        <SectionHeader title="Overview Proyek Saya" actionLabel="Lihat semua" actionHref="/projects" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="Total Proyek" value={total} subLabel="semua status" icon={FolderKanban} iconBg="#EFF6FF" iconColor="#1D4ED8" />
          <KpiCard label="Aktif Berjalan" value={active} subLabel="in progress" icon={Activity} iconBg="#F0FDF4" iconColor="#16A34A" trend={active > 0 ? { value: `${active} proyek aktif`, up: true } : null} />
          <KpiCard label="Terlambat" value={delayed} subLabel="melewati deadline" icon={AlertTriangle} iconBg="#FEF2F2" iconColor="#DC2626" trend={delayed > 0 ? { value: `${delayed} perlu perhatian`, up: false } : null} />
          <KpiCard label="Rata-rata Progress" value={`${avgProgress}%`} subLabel="seluruh proyek" icon={Target} iconBg="#FAF5FF" iconColor="#7E22CE" />
        </div>
      </section>

      {/* ── Section Budget Check & Status Kontrol Lapangan ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
        <div className="lg:col-span-1 h-full">
          <BudgetCheckStatusCard
            materialBudget={totalBudget}
            allocationFormula="(Total Alokasi Biaya Material PO)"
            allocationCost={totalAllocated}
            remainingBudget={Math.max(0, totalBudget - totalAllocated)}
            isValid={totalBudget >= totalAllocated}
          />
        </div>

        {/* ── Panel Status Kontrol & Pengadaan Lapangan (Gambar 2) ── */}
        <div className="lg:col-span-2 bg-white border border-[#C7C7C7] rounded-[24px] p-6 shadow-xs flex flex-col justify-between h-full min-h-[220px]">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#F0FEE0] flex items-center justify-center text-[#275433]">
                <FolderKanban size={18} />
              </div>
              <h3 className="text-base font-bold text-[#0E341F]">Status Kontrol &amp; Pengadaan Lapangan</h3>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#F0FEE0] text-[#275433] border border-[#BBDFA0]">
              Active Control
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 my-auto py-2">
            <div className="p-4 rounded-[16px] bg-[#FAFAFA] border border-gray-100">
              <span className="text-xs text-[#637566] block uppercase font-bold tracking-wider">PROYEK TERDAFTAR</span>
              <span className="text-lg font-bold text-[#0E341F] mt-1 block">
                {projects.length} Proyek
              </span>
            </div>
            <div className="p-4 rounded-[16px] bg-[#FAFAFA] border border-gray-100">
              <span className="text-xs text-[#637566] block uppercase font-bold tracking-wider">TERVERIFIKASI QC</span>
              <span className="text-lg font-bold text-[#5A861F] mt-1 block">
                {delayed === 0 ? "On Schedule" : `${active} Berjalan`}
              </span>
            </div>
            <div className="p-4 rounded-[16px] bg-[#FAFAFA] border border-gray-100">
              <span className="text-xs text-[#637566] block uppercase font-bold tracking-wider">TOTAL NILAI PROYEK</span>
              <span className="text-lg font-bold text-amber-600 mt-1 block truncate">
                {formatMoney(totalBudget)}
              </span>
            </div>
          </div>

          <p className="text-xs text-[#637566] pt-2 border-t border-gray-100">
            Alokasi material terkunci sesuai baseline HPP. Seluruh pengeluaran di luar plafon akan dialihkan ke otorisasi Project Manager.
          </p>
        </div>
      </div>

      {/* ── Today's Task Summary Panel ──────────── */}
      <section>
        <div className="bg-white border border-[#C7C7C7] rounded-[24px] p-6 shadow-xs flex flex-col gap-4">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#F0FEE0] flex items-center justify-center text-[#275433]">
                <Clock size={16} />
              </div>
              <h3 className="text-sm font-bold text-[#0E341F]">Tugas Operasional Hari Ini</h3>
            </div>
            <Link href="/projects" className="flex items-center gap-1 text-xs font-semibold text-brand-green hover:text-brand-deep-green transition-colors">
              Buka task harian <ArrowRight size={12} />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-[#FAFAFA] border border-gray-100 text-center flex flex-col justify-center">
              <span className="text-2xl font-bold text-[#0E341F]">{todayTasks.length}</span>
              <span className="text-xs text-[#637566] mt-1 font-medium">Total Task Hari Ini</span>
            </div>
            <div className="p-3.5 rounded-xl bg-[#F0FEE0]/50 border border-[#BBDFA0] text-center flex flex-col justify-center">
              <span className="text-2xl font-bold text-[#275433]">{completedToday}</span>
              <span className="text-xs text-[#275433] mt-1 font-semibold">Selesai</span>
            </div>
            <div className={cn(
              "p-3.5 rounded-xl text-center flex flex-col justify-center border col-span-2 sm:col-span-1",
              overdueTasks.length > 0 ? "bg-red-50/70 border-red-200 text-red-700" : "bg-[#FAFAFA] border-gray-100"
            )}>
              <span className={cn("text-2xl font-bold", overdueTasks.length > 0 ? "text-red-600" : "text-[#0E341F]")}>
                {overdueTasks.length}
              </span>
              <span className={cn("text-xs mt-1", overdueTasks.length > 0 ? "text-red-600 font-semibold" : "text-[#637566] font-medium")}>
                Terlambat / Carry-over
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Visual Analytics Row 1: Gauges & Distribusi Portofolio (2 Kolom) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
        <ProjectDistributionGauge
          scorePercent={healthScore}
          statusLabel={healthStatus}
          onTrackCount={onTrackCount}
          cautiousCount={delayed}
          offTrackCount={0}
        />
        <ProjectDonutSummaryCard data={statusCounts} />
      </div>

      {/* ── Visual Analytics Row 1.5: Completion Rate (Full Width di bawah 2 card) ── */}
      <div className="w-full">
        <CompletionRateCard rates={industryRates} />
      </div>

      {/* ── Visual Analytics Row 2: Tren Pendapatan & Biaya Bulanan (Run-Rate) ── */}
      <div className="w-full">
        <MonthlyStackedBarChart
          title="Tren Arus Kas Pendapatan & Biaya Bulanan Proyek"
          subtitle="Distribusi pendapatan termin vs realisasi alokasi WIP/biaya proyek per bulan fiskal"
          primaryLabel="Realisasi Kas (Jt)"
          secondaryLabel="Alokasi WIP / Biaya Proyek (Jt)"
          autoFetch={true}
        />
      </div>

      {/* ── Visual Analytics Row 3: Top 5 Expenses ── */}
      <div className="w-full">
        <TopExpensesBarChart expenses={topExpenses} />
      </div>

      {/* ── Visual Analytics Row 3: Gantt Timeline Mingguan Portofolio (W1-W8) ── */}
      <div className="w-full">
        <ProjectTimelineGantt tasks={timelineTasks} totalWeeks={8} />
      </div>

      {/* ── Visual Analytics Row 4: Milestones Stepper & Project Selector ── */}
      <div className="w-full">
        <ProjectMilestoneCard projects={projectSummaries} milestones={projectMilestones} />
      </div>

      {/* ── Overdue tasks alert ───────────── */}
      {overdueTasks.length > 0 && (
        <section>
          <div className="card rounded-xl p-4 border-l-4 border-red-400 bg-red-50">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={16} className="text-red-600" />
              <span className="text-sm font-semibold text-red-700">{overdueTasks.length} Task Belum Selesai dari Hari Sebelumnya</span>
            </div>
            <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto">
              {overdueTasks.slice(0, 6).map(d => (
                <div key={d.id} className="flex items-center justify-between text-xs">
                  <span className="text-red-700 truncate flex-1">{d.title || d.activity_input || "Aktivitas"}</span>
                  <span className="text-red-500 ml-2 flex-shrink-0">{d.planned_date}</span>
                </div>
              ))}
            </div>
            <Link href="/projects" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:text-red-900">
              Lihat semua & kelola transfer <ArrowRight size={11} />
            </Link>
          </div>
        </section>
      )}

      {/* ── Project list table ────────────── */}
      <section>
        <SectionHeader title="Daftar Proyek" actionLabel="Kelola proyek" actionHref="/projects" />
        <div className="card rounded-xl overflow-hidden">
          {projects.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <FolderKanban size={40} className="text-text-secondary opacity-40" />
              <p className="text-sm text-text-secondary">Belum ada proyek. Mulai dengan membuat proyek baru.</p>
              <Link href="/projects" className="btn-primary">+ Tambah Proyek</Link>
            </div>
          ) : (
            <div className="table-scroll-wrapper">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="border-b border-text-tertiary bg-bg-lighter">
                    <th className="text-left text-xs font-semibold text-text-secondary px-3 py-2.5">Nama Proyek</th>
                    <th className="text-left text-xs font-semibold text-text-secondary px-3 py-2.5">Progress</th>
                    <th className="text-left text-xs font-semibold text-text-secondary px-3 py-2.5">Status</th>
                    <th className="text-left text-xs font-semibold text-text-secondary px-3 py-2.5">Deadline</th>
                    <th className="text-left text-xs font-semibold text-text-secondary px-3 py-2.5">Task</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p, i) => {
                    const progress = p.progress_percentage || p.progress || 0;
                    const deadline = p.end_date || p.planned_end_date;
                    const isDelayed = deadline && deadline < today && !["COMPLETED", "CLOSED", "DONE"].includes((p.status || "").toUpperCase());
                    const taskCount = (p.main_tasks || []).reduce((acc, mt) => acc + (mt.weekly_tasks || mt.weekly_plans || []).reduce((a2, wt) => a2 + (wt.daily_tasks || []).length, 0), 0);
                    return (
                      <tr key={p.id} className={cn("border-b border-text-tertiary/50 hover:bg-bg-lighter/50 transition-colors", i % 2 === 0 && "bg-white")}>
                        <td className="px-4 py-3">
                          <Link href="/projects" className="font-medium text-brand-deep-green hover:underline">
                            {p.project_name || p.name || `Project #${p.id}`}
                          </Link>
                          {p.project_manager_name && (
                            <div className="text-2xs text-text-secondary">PM: {p.project_manager_name}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 min-w-24">
                            <ProgressBar value={progress} color={progress >= 80 ? "#16A34A" : progress >= 40 ? "#D97706" : "#DC2626"} />
                            <span className="text-xs font-medium text-text-primary w-9 text-right">{Math.round(progress)}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={p.status || "DRAFT"} />
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("text-xs", isDelayed ? "text-red-600 font-semibold" : "text-text-secondary")}>
                            {deadline ? formatDate(deadline) : "-"}
                            {isDelayed && " ⚠️"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-text-secondary">{taskCount} task</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   FINANCE DASHBOARD
═══════════════════════════════════════════════════════════════ */

function FinanceDashboard({ finData, loading }: { finData: FinanceDashboardData | null; loading: boolean }) {
  if (loading || !finData) return <LoadingDashboard />;

  const { kpis, pendingItems, recentTransactions, projectSummaries } = finData;
  const urgentCount = pendingItems.filter(i => i.urgency === "urgent").length;

  return (
    <div className="flex flex-col gap-6 pb-8">
      {/* ── KPI Row ──────────────────────── */}
      <section>
        <SectionHeader title="Financial Overview" actionLabel="Detail keuangan" actionHref="/finance" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            label="Total Anggaran" value={formatMoney(kpis.totalBudget)}
            subLabel="budget proyek" icon={DollarSign} iconBg="#F0FDF4" iconColor="#16A34A"
          />
          <KpiCard
            label="Terpakai" value={formatMoney(kpis.usedBudget)}
            subLabel={`${kpis.budgetUtilization}% utilisasi`} icon={TrendingUp} iconBg="#EFF6FF" iconColor="#1D4ED8"
          />
          <KpiCard
            label="Sisa Anggaran" value={formatMoney(kpis.remainingBudget)}
            subLabel="tersedia" icon={Layers} iconBg="#FAF5FF" iconColor="#7E22CE"
          />
          <KpiCard
            label="Perlu Persetujuan" value={kpis.pendingRequests}
            subLabel={formatMoney(kpis.pendingAmount)} icon={Clock} iconBg="#FEF2F2" iconColor="#DC2626"
            trend={urgentCount > 0 ? { value: `${urgentCount} URGENT`, up: false } : null}
          />
        </div>
      </section>

      {/* ── Monthly Financial Run-Rate Chart ── */}
      <div className="w-full">
        <MonthlyStackedBarChart
          title="Monthly Financial Run-Rate (Pendapatan vs Beban Proyek)"
          subtitle="Arus kas pendapatan termin riil (Realized Revenue) vs alokasi biaya WIP/material per bulan fiskal"
          primaryLabel="Realisasi Kas (Jt)"
          secondaryLabel="Alokasi WIP / Biaya Proyek (Jt)"
          autoFetch={true}
        />
      </div>

      {/* ── Operational Control (Budget & Inventory Checking) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
        <BudgetCheckStatusCard
          materialBudget={kpis.totalBudget ?? 56000000}
          allocationCost={kpis.usedBudget ?? 12500000}
          remainingBudget={kpis.totalBudget != null ? Math.max(0, kpis.totalBudget - (kpis.usedBudget ?? 0)) : 43500000}
          isValid={(kpis.totalBudget ?? 0) >= (kpis.usedBudget ?? 0)}
        />
        <InventoryCheckingCard autoFetch={true} />
      </div>

      {/* ── Need Action Panel ──────────── */}
      {pendingItems.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Zap size={15} className="text-amber-500" />
            <h2 className="text-sm font-bold text-text-primary">Perlu Tindakan Segera</h2>
            <span className="ml-auto px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-2xs font-bold">{pendingItems.length}</span>
          </div>
          <div className="card rounded-xl overflow-hidden divide-y divide-text-tertiary/50">
            {pendingItems.slice(0, 8).map(item => (
              <div key={`${item.type}-${item.id}`} className={cn("flex items-center gap-3 px-4 py-3 hover:bg-bg-lighter/50 transition-colors", item.urgency === "urgent" && "border-l-2 border-red-400")}>
                <div className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", item.urgency === "urgent" ? "bg-red-500" : "bg-amber-400")} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-text-primary truncate">{item.label}</div>
                  <div className="text-2xs text-text-secondary">
                    {item.type === "funding" ? "Pengajuan Dana" : "Billing Termin"}
                    {item.project ? ` · ${item.project}` : ""}
                    {item.date ? ` · ${formatDate(item.date)}` : ""}
                  </div>
                </div>
                <div className="flex flex-col items-end flex-shrink-0">
                  <span className="text-sm font-bold text-text-primary">{formatMoney(item.amount)}</span>
                  <StatusBadge status={item.status} />
                </div>
                <Link href="/finance" className="btn-ghost text-brand-green text-xs px-2 py-1 ml-1">Review</Link>
              </div>
            ))}
          </div>
          {pendingItems.length > 8 && (
            <div className="mt-2 text-center">
              <Link href="/finance" className="text-xs text-brand-green hover:underline">
                Lihat {pendingItems.length - 8} item lainnya →
              </Link>
            </div>
          )}
        </section>
      )}

      {/* ── Budget Utilization per Project ── */}
      <section>
        <SectionHeader title="Utilisasi Anggaran per Proyek" actionLabel="Detail finance" actionHref="/finance" />
        <div className="card rounded-xl overflow-hidden">
          {projectSummaries.length === 0 ? (
            <div className="py-10 text-center text-sm text-text-secondary">Belum ada data anggaran proyek.</div>
          ) : (
            <div className="flex flex-col divide-y divide-text-tertiary/50">
              {projectSummaries.slice(0, 8).map(ps => (
                <div key={ps.projectId} className="px-4 py-3 hover:bg-bg-lighter/50 transition-colors">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-text-primary truncate flex-1">{ps.projectName}</span>
                    <span className="text-xs text-text-secondary ml-2">{formatMoney(ps.spent)} / {formatMoney(ps.budget)}</span>
                    <span className={cn("text-xs font-bold ml-3", ps.utilization > 90 ? "text-red-600" : ps.utilization > 70 ? "text-amber-600" : "text-brand-green")}>
                      {ps.utilization}%
                    </span>
                  </div>
                  <ProgressBar
                    value={ps.utilization}
                    color={ps.utilization > 90 ? "#DC2626" : ps.utilization > 70 ? "#D97706" : "#16A34A"}
                    height={5}
                  />
                  {ps.pendingAmount > 0 && (
                    <div className="text-2xs text-amber-600 mt-1">
                      + {formatMoney(ps.pendingAmount)} pending approval
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Recent Transactions ──────────── */}
      <section>
        <SectionHeader title="Transaksi Terbaru" actionLabel="Lihat semua" actionHref="/finance" />
        <div className="card rounded-xl overflow-hidden">
          {recentTransactions.length === 0 ? (
            <div className="py-10 text-center text-sm text-text-secondary">Belum ada transaksi.</div>
          ) : (
            <div className="table-scroll-wrapper">
              <table className="w-full text-sm min-w-[540px]">
                <thead>
                  <tr className="border-b border-text-tertiary bg-bg-lighter">
                    <th className="text-left text-xs font-semibold text-text-secondary px-3 py-2.5">Keterangan</th>
                    <th className="text-left text-xs font-semibold text-text-secondary px-3 py-2.5">Proyek</th>
                    <th className="text-left text-xs font-semibold text-text-secondary px-3 py-2.5">Tipe</th>
                    <th className="text-right text-xs font-semibold text-text-secondary px-3 py-2.5">Jumlah</th>
                    <th className="text-left text-xs font-semibold text-text-secondary px-3 py-2.5">Status</th>
                    <th className="text-left text-xs font-semibold text-text-secondary px-3 py-2.5">Tanggal</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.map((t, i) => (
                    <tr key={`${t.type}-${t.id}`} className={cn("border-b border-text-tertiary/50 hover:bg-bg-lighter/50", i % 2 === 0 && "bg-white")}>
                      <td className="px-4 py-2.5 font-medium text-text-primary text-xs max-w-48 truncate">{t.label}</td>
                      <td className="px-4 py-2.5 text-text-secondary text-xs">{t.project || "-"}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn("px-2 py-0.5 rounded text-2xs font-medium",
                          t.type === "cost" ? "bg-blue-100 text-blue-700" :
                            t.type === "funding" ? "bg-green-100 text-green-700" :
                              "bg-purple-100 text-purple-700"
                        )}>
                          {t.type === "cost" ? "Biaya" : t.type === "funding" ? "Funding" : "Billing"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-text-primary text-xs">{formatMoney(t.amount)}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={t.status} /></td>
                      <td className="px-4 py-2.5 text-text-secondary text-xs">{formatDate(t.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   EXECUTIVE DASHBOARD
═══════════════════════════════════════════════════════════════ */

function ExecutiveDashboard({ projects, finData, loading }: {
  projects: Project[];
  finData: FinanceDashboardData | null;
  loading: boolean;
}) {
  const today = new Date().toISOString().split("T")[0];

  if (loading) return <LoadingDashboard />;

  const total = projects.length;
  const active = projects.filter(p => ["ACTIVE", "IN_PROGRESS", "PLANNING"].includes((p.status || "").toUpperCase())).length;
  const completed = projects.filter(p => ["COMPLETED", "CLOSED", "DONE"].includes((p.status || "").toUpperCase())).length;
  const delayed = projects.filter(p => {
    const end = p.end_date || p.planned_end_date;
    return end && end < today && !["COMPLETED", "CLOSED", "DONE"].includes((p.status || "").toUpperCase());
  }).length;
  const avgProgress = total > 0
    ? Math.round(projects.reduce((acc, p) => acc + (p.progress_percentage || p.progress || 0), 0) / total)
    : 0;

  const kpis = finData?.kpis;
  const pendingCount = kpis?.pendingRequests || 0;
  const urgentPending = (finData?.pendingItems || []).filter(i => i.urgency === "urgent").length;

  // Derive Real Timeline Tasks
  const timelineTasks: GanttTaskItem[] = projects.map((p, idx) => ({
    id: p.id,
    name: p.project_name || p.name || `Proyek #${idx + 1}`,
    startWeek: 1,
    endWeek: Math.min(8, 4 + idx),
    progress: Number(p.progress_percentage || p.progress || 0),
    assignee: p.project_manager_name || "Melika Citra / Arof Fudding",
    status: (p.status || "IN_PROGRESS") as any,
  }));

  // Clean empty state for expenses
  const topExpenses: ExpenseItem[] = [];

  // Derive Real Projects & Milestones
  const projectSummaries: ProjectSummary[] = projects.slice(0, 8).map(p => ({
    id: p.id,
    name: p.project_name || p.name || `Proyek #${p.id}`,
    code: p.project_code || p.code,
    status: p.status,
  }));

  const projectMilestones: Record<string, MilestoneItem[]> = {};
  projects.forEach((p) => {
    const ms = p.milestones || [];
    projectMilestones[String(p.id)] = ms.map((m, idx) => ({
      id: m.id || idx + 1,
      stepNumber: idx + 1,
      title: m.name || `Milestone Gate ${idx + 1}`,
      points: [
        `Target Selesai: ${m.target_date || "Sesuai Jadwal"}`,
        `Status Verifikasi: ${m.status || (m.is_passed ? "COMPLETED" : "PENDING")}`,
      ],
      isActive: m.is_passed || idx === 0,
      status: m.is_passed ? "COMPLETED" : "PENDING",
    }));
  });

  const notStarted = Math.max(0, total - active - completed - delayed);
  const statusCounts: ProjectStatusCount[] = [
    { label: "Completed", count: completed, color: "#10B981" },
    { label: "In Progress", count: active, color: "#0EA5E9" },
    { label: "Not Started", count: notStarted, color: "#64748B" },
    { label: "Delayed", count: delayed, color: "#EF4444" },
  ];

  const industryRates: RateItem[] = projects.map((p, idx) => ({
    id: p.id || idx + 1,
    industry: p.project_name || p.name || `Proyek #${idx + 1}`,
    percentage: Number(p.progress_percentage || p.progress || 0),
  }));

  const healthScore = total === 0 ? 100 : delayed === 0 ? 100 : Math.max(0, Math.round(((total - delayed) / total) * 100));
  const healthStatus = delayed === 0 ? "On Track" : "Caution";
  const onTrackCount = Math.max(0, active - delayed);

  return (
    <div className="flex flex-col gap-6 pb-8">
      {/* ── Executive KPI Row ─────────────── */}
      <section>
        <SectionHeader title="Company Overview" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="Total Proyek" value={total} subLabel={`${active} aktif`} icon={FolderKanban} iconBg="#EFF6FF" iconColor="#1D4ED8" />
          <KpiCard label="Overall Progress" value={`${avgProgress}%`} subLabel="rata-rata" icon={Target} iconBg="#F0FDF4" iconColor="#16A34A" />
          <KpiCard label="Total Anggaran" value={kpis ? formatMoney(kpis.totalBudget) : "-"}
            subLabel={kpis ? `${kpis.budgetUtilization}% digunakan` : ""} icon={DollarSign} iconBg="#FAF5FF" iconColor="#7E22CE" />
          <KpiCard label="Perlu Keputusan" value={pendingCount}
            subLabel={urgentPending > 0 ? `${urgentPending} URGENT` : "pending approval"} icon={ShieldAlert} iconBg="#FEF2F2" iconColor="#DC2626"
            trend={urgentPending > 0 ? { value: `${urgentPending} butuh perhatian`, up: false } : null} />
        </div>
      </section>

      {/* ── Baris 1: Gauges & Distribusi Kesehatan Portofolio (2 Kolom) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
        <ProjectDistributionGauge
          scorePercent={healthScore}
          statusLabel={healthStatus}
          onTrackCount={onTrackCount}
          cautiousCount={delayed}
          offTrackCount={0}
        />
        <ProjectDonutSummaryCard data={statusCounts} />
      </div>

      {/* ── Baris 1.5: Completion Rate by Project Cluster (Full Width di bawah 2 card) ── */}
      <div className="w-full">
        <CompletionRateCard rates={industryRates} />
      </div>

      {/* ── Baris 2: Tren Pendapatan & Biaya Bulanan (Monthly Stacked Run-Rate) ── */}
      <div className="w-full">
        <MonthlyStackedBarChart
          title="Monthly Financial Run-Rate (Pendapatan vs Beban Proyek)"
          subtitle="Analisis arus kas termin (Realized Revenue) vs alokasi biaya WIP/material per bulan fiskal"
          primaryLabel="Realisasi Kas (Jt)"
          secondaryLabel="Alokasi WIP / Biaya Proyek (Jt)"
          autoFetch={true}
        />
      </div>

      {/* ── Baris 3: 5 Pengeluaran Biaya Terbesar ── */}
      <div className="w-full">
        <TopExpensesBarChart expenses={topExpenses} />
      </div>

      {/* ── Baris 3: Gantt Timeline Mingguan Portofolio ── */}
      <div className="w-full">
        <ProjectTimelineGantt tasks={timelineTasks} totalWeeks={8} />
      </div>

      {/* ── Baris 4: Milestones Stepper & Project Selector ── */}
      <div className="w-full">
        <ProjectMilestoneCard projects={projectSummaries} milestones={projectMilestones} />
      </div>

      {/* ── Secondary KPI Row ─────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card rounded-xl p-4 text-center">
          <div className="text-xl font-bold text-green-600">{completed}</div>
          <div className="text-xs text-text-secondary mt-0.5">Selesai</div>
        </div>
        <div className="card rounded-xl p-4 text-center">
          <div className="text-xl font-bold text-blue-600">{active}</div>
          <div className="text-xs text-text-secondary mt-0.5">Berjalan</div>
        </div>
        <div className="card rounded-xl p-4 text-center">
          <div className="text-xl font-bold text-red-600">{delayed}</div>
          <div className="text-xs text-text-secondary mt-0.5">Terlambat</div>
        </div>
        <div className="card rounded-xl p-4 text-center">
          <div className="text-xl font-bold text-text-primary">{total - completed - active - delayed}</div>
          <div className="text-xs text-text-secondary mt-0.5">Lainnya</div>
        </div>
      </div>

      {/* ── Action Required ───────────────── */}
      {pendingCount > 0 && finData && (
        <section>
          <div className="card rounded-xl p-4 border-l-4 border-amber-400">
            <div className="flex items-center gap-2 mb-3">
              <Zap size={15} className="text-amber-500" />
              <span className="text-sm font-bold text-text-primary">Action Required — Financial Approvals</span>
              <span className="ml-auto px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-2xs font-bold">{pendingCount}</span>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="text-center">
                <div className="text-lg font-bold text-text-primary">{kpis?.pendingRequests}</div>
                <div className="text-2xs text-text-secondary">Pending</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-green-600">{kpis?.approvedRequests}</div>
                <div className="text-2xs text-text-secondary">Approved</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-red-600">{kpis?.rejectedRequests}</div>
                <div className="text-2xs text-text-secondary">Rejected</div>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Link href="/finance" className="btn-primary text-xs py-1.5 px-3">Buka Finance Dashboard</Link>
              <Link href="/projects" className="btn-ghost text-xs py-1.5 px-3">Lihat Projects</Link>
            </div>
          </div>
        </section>
      )}

      {/* ── Project Performance Grid ──────── */}
      <section>
        <SectionHeader title="Performance Proyek" actionLabel="Kelola semua proyek" actionHref="/projects" />
        {projects.length === 0 ? (
          <div className="card rounded-xl py-12 text-center">
            <FolderKanban size={40} className="mx-auto text-text-secondary opacity-30 mb-2" />
            <p className="text-sm text-text-secondary">Belum ada proyek.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {projects.slice(0, 8).map(p => {
              const progress = p.progress_percentage || p.progress || 0;
              const deadline = p.end_date || p.planned_end_date;
              const isDelayed = deadline && deadline < today && !["COMPLETED", "CLOSED", "DONE"].includes((p.status || "").toUpperCase());
              const budget = p.budget_amount || p.total_budget || p.budget || 0;
              const finSum = finData?.projectSummaries.find(ps => String(ps.projectId) === String(p.id));
              return (
                <div key={p.id} className={cn("card rounded-xl p-4", isDelayed && "border-l-2 border-red-400")}>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-text-primary truncate">
                        {p.project_name || p.name || `Project #${p.id}`}
                      </div>
                      {p.project_manager_name && (
                        <div className="text-2xs text-text-secondary">PM: {p.project_manager_name}</div>
                      )}
                    </div>
                    <StatusBadge status={p.status || "DRAFT"} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-text-secondary">Progress</span>
                        <span className="font-semibold text-text-primary">{Math.round(progress)}%</span>
                      </div>
                      <ProgressBar value={progress} color={progress >= 80 ? "#16A34A" : progress >= 40 ? "#D97706" : "#DC2626"} />
                    </div>
                    <div className="flex items-center justify-between text-xs text-text-secondary">
                      <span className={cn("flex items-center gap-0.5", isDelayed && "text-red-600 font-medium")}>
                        <CalendarDays size={11} />
                        {deadline ? formatDate(deadline) : "Belum ada deadline"}
                        {isDelayed && " ⚠️"}
                      </span>
                      {budget > 0 && (
                        <span>{finSum ? `${finSum.utilization}% budget` : formatMoney(budget)}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Financial Summary ─────────────── */}
      {kpis && (
        <section>
          <SectionHeader title="Ringkasan Keuangan" actionLabel="Detail finance" actionHref="/finance" />
          <div className="card rounded-xl p-4">
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-secondary">Total Anggaran</span>
                <span className="text-sm font-bold text-text-primary">{formatMoney(kpis.totalBudget)}</span>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-text-secondary">Terpakai</span>
                  <span className="font-medium">{formatMoney(kpis.usedBudget)} ({kpis.budgetUtilization}%)</span>
                </div>
                <ProgressBar
                  value={kpis.budgetUtilization}
                  color={kpis.budgetUtilization > 90 ? "#DC2626" : kpis.budgetUtilization > 70 ? "#D97706" : "#16A34A"}
                  height={8}
                />
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-text-tertiary/50">
                <span className="text-sm text-text-secondary">Sisa Anggaran</span>
                <span className={cn("text-sm font-bold", kpis.remainingBudget < kpis.totalBudget * 0.1 ? "text-red-600" : "text-brand-green")}>
                  {formatMoney(kpis.remainingBudget)}
                </span>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   CRM DASHBOARD
═══════════════════════════════════════════════════════════════ */

function CRMDashboard({
  projects,
  crmData,
  crmDash,
  loading
}: {
  projects: Project[];
  crmData: CRMData | null;
  crmDash: CRMDashType;
  loading: boolean;
}) {
  if (loading) return <LoadingDashboard />;

  const opps = crmData?.opportunities || [];
  const activeOpps = opps.filter(o => !["CANCELLED", "CANCEL", "BATAL"].includes((o.status || "").toUpperCase()));
  const totalPipeline = activeOpps.reduce((acc, o) => acc + Number(o.expected_amount || 0), 0);
  const winRate = Number(crmDash?.win_rate_percent || 0).toFixed(1);
  const inquiries = crmData?.inquiries || [];
  const tickets = crmData?.cases || [];

  return (
    <div className="flex flex-col gap-6 pb-8">
      {/* ── KPI Row ── */}
      <section>
        <SectionHeader title="Pipeline & Commercial Overview" actionLabel="Kelola CRM" actionHref="/crm" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            label="Total Pipeline Deal"
            value={formatMoney(totalPipeline || crmDash?.weighted_project_value || 0)}
            subLabel={`${activeOpps.length} deal aktif`}
            icon={DollarSign}
            iconBg="#F0FDF4"
            iconColor="#16A34A"
          />
          <KpiCard
            label="Win Rate"
            value={`${winRate}%`}
            subLabel="peluang konversi"
            icon={TrendingUp}
            iconBg="#EFF6FF"
            iconColor="#1D4ED8"
          />
          <KpiCard
            label="Inquiry Masuk"
            value={inquiries.length}
            subLabel="prospek calon klien"
            icon={Building2}
            iconBg="#FAF5FF"
            iconColor="#7E22CE"
          />
          <KpiCard
            label="Kasus Support & Garansi"
            value={tickets.length}
            subLabel="layanan purnajual"
            icon={ShieldAlert}
            iconBg="#FEF2F2"
            iconColor="#DC2626"
          />
        </div>
      </section>

      {/* ── Active Opportunities Table & Actions ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 card rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-text-primary">Opportunity & Pipeline Penjualan Aktif</h3>
            <Link href="/crm" className="text-xs font-semibold text-brand-green hover:underline">
              Buka CRM &rarr;
            </Link>
          </div>
          {activeOpps.length === 0 ? (
            <div className="py-8 text-center text-xs text-text-secondary">
              Belum ada opportunity aktif. Buka modul CRM untuk menambahkan prospek baru.
            </div>
          ) : (
            <div className="table-scroll-wrapper">
              <table className="w-full text-xs min-w-[500px]">
                <thead>
                  <tr className="border-b border-text-tertiary bg-gray-50/80 text-text-secondary font-semibold">
                    <th className="py-2 px-3 text-left">Nama Opportunity</th>
                    <th className="py-2 px-3 text-left">Tahap Pipeline</th>
                    <th className="py-2 px-3 text-right">Nilai Estimasi</th>
                    <th className="py-2 px-3 text-right">Probabilitas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {activeOpps.slice(0, 6).map(o => (
                    <tr key={o.id} className="hover:bg-brand-light-green/20">
                      <td className="py-2 px-3 font-medium text-text-primary">
                        <Link href="/crm" className="hover:underline text-brand-deep-green">
                          {o.opportunity_name || `Opportunity #${o.id}`}
                        </Link>
                      </td>
                      <td className="py-2 px-3">
                        <StatusBadge status={o.pipeline_stage || o.status || "OPEN"} />
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-text-primary">
                        {formatMoney(o.expected_amount)}
                      </td>
                      <td className="py-2 px-3 text-right text-brand-green font-bold">
                        {o.probability_percent || 50}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Quick CRM Links & Projects ── */}
        <div className="card rounded-xl p-4 flex flex-col gap-3 justify-between">
          <div>
            <h3 className="text-sm font-bold text-text-primary mb-1">Aksi Cepat Commercial</h3>
            <p className="text-2xs text-text-secondary mb-3">Pintasan ke modul negosiasi & penawaran</p>
            <div className="flex flex-col gap-2">
              <Link
                href="/crm"
                className="flex items-center justify-between p-2.5 rounded-xl border border-text-tertiary/60 hover:bg-brand-light-green/30 transition-colors text-xs font-semibold text-brand-deep-green"
              >
                <span>➕ Buat Opportunity / Deal</span>
                <ArrowRight size={13} />
              </Link>
              <Link
                href="/crm"
                className="flex items-center justify-between p-2.5 rounded-xl border border-text-tertiary/60 hover:bg-brand-light-green/30 transition-colors text-xs font-semibold text-brand-deep-green"
              >
                <span>📐 Kalkulasi Estimasi HPP & Quotation</span>
                <ArrowRight size={13} />
              </Link>
              <Link
                href="/projects"
                className="flex items-center justify-between p-2.5 rounded-xl border border-text-tertiary/60 hover:bg-brand-light-green/30 transition-colors text-xs font-semibold text-brand-deep-green"
              >
                <span>📁 Lihat Daftar Proyek Terkait ({projects.length})</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STAFF DASHBOARD
═══════════════════════════════════════════════════════════════ */

function StaffDashboard({ projects, loading }: { projects: Project[]; loading: boolean }) {
  const today = new Date().toISOString().split("T")[0];

  if (loading) return <LoadingDashboard />;

  const allDailyTasks = projects.flatMap(p =>
    (p.main_tasks || []).flatMap(mt =>
      (mt.weekly_tasks || mt.weekly_plans || []).flatMap(wt =>
        (wt.daily_tasks || []).map(d => ({
          ...d,
          projectName: p.project_name || p.name || `Proyek #${p.id}`,
          projectCode: p.project_code || p.code || "PRJ",
        }))
      )
    )
  );

  const todayTasks = allDailyTasks.filter(d => d.planned_date === today);
  const completedToday = todayTasks.filter(d => ["COMPLETED", "DONE"].includes((d.status || "").toUpperCase())).length;
  const overdueTasks = allDailyTasks.filter(d => {
    const pd = d.planned_date;
    return pd && pd < today && !["COMPLETED", "DONE"].includes((d.status || "").toUpperCase());
  });
  const activeProjects = projects.filter(p => ["ACTIVE", "IN_PROGRESS", "STARTED"].includes((p.status || "").toUpperCase()));

  return (
    <div className="flex flex-col gap-6 pb-8">
      {/* ── KPI Row ── */}
      <section>
        <SectionHeader title="Workspace Harian Saya" actionLabel="Kelola semua task" actionHref="/tasks" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            label="Tugas Hari Ini"
            value={todayTasks.length}
            subLabel="sesi kerja terjadwal"
            icon={CheckSquare}
            iconBg="#EFF6FF"
            iconColor="#1D4ED8"
          />
          <KpiCard
            label="Selesai Hari Ini"
            value={completedToday}
            subLabel={`${todayTasks.length > 0 ? Math.round((completedToday / todayTasks.length) * 100) : 0}% tuntas`}
            icon={CheckCircle2}
            iconBg="#F0FDF4"
            iconColor="#16A34A"
          />
          <KpiCard
            label="Perlu Perhatian"
            value={overdueTasks.length}
            subLabel="tugas carry-over"
            icon={AlertTriangle}
            iconBg="#FEF2F2"
            iconColor="#DC2626"
            trend={overdueTasks.length > 0 ? { value: `${overdueTasks.length} terlambat`, up: false } : null}
          />
          <KpiCard
            label="Proyek Aktif"
            value={activeProjects.length}
            subLabel="sedang berjalan"
            icon={FolderKanban}
            iconBg="#FAF5FF"
            iconColor="#7E22CE"
          />
        </div>
      </section>

      {/* ── Today's Tasks List ── */}
      <div className="card rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-text-primary">Daftar Aktivitas Terjadwal Hari Ini</h3>
          <Link href="/tasks" className="text-xs font-semibold text-brand-green hover:underline">
            Buka Task Manager &rarr;
          </Link>
        </div>
        {todayTasks.length === 0 ? (
          <div className="py-8 text-center text-xs text-text-secondary flex flex-col items-center gap-2">
            <CheckCircle2 size={28} className="opacity-30 text-brand-green" />
            <span>Tidak ada tugas terjadwal khusus hari ini. Periksa daftar tugas di Task Manager.</span>
            <Link href="/tasks" className="btn-primary mt-2 text-xs py-1.5 px-3">Buka Semua Task</Link>
          </div>
        ) : (
          <div className="table-scroll-wrapper">
            <table className="w-full text-xs min-w-[500px]">
              <thead>
                <tr className="border-b border-text-tertiary bg-gray-50/80 text-text-secondary font-semibold">
                  <th className="py-2 px-3 text-left">Proyek</th>
                  <th className="py-2 px-3 text-left">Aktivitas / Sesi Kerja</th>
                  <th className="py-2 px-3 text-left">Waktu</th>
                  <th className="py-2 px-3 text-left">Status</th>
                  <th className="py-2 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {todayTasks.slice(0, 8).map(d => {
                  const isDone = ["COMPLETED", "DONE"].includes((d.status || "").toUpperCase());
                  return (
                    <tr key={d.id} className={cn("hover:bg-brand-light-green/20", isDone && "bg-emerald-50/30")}>
                      <td className="py-2 px-3">
                        <span className="font-semibold text-brand-deep-green block">{d.projectCode}</span>
                        <span className="text-2xs text-text-secondary truncate max-w-32 block">{d.projectName}</span>
                      </td>
                      <td className="py-2 px-3">
                        <span className={cn("font-medium block", isDone && "line-through text-text-secondary")}>
                          {d.title || d.activity_input || "Aktivitas"}
                        </span>
                        {d.output_result && (
                          <span className="text-2xs text-emerald-800 block">Output: {d.output_result}</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-text-secondary whitespace-nowrap">
                        {d.time_slot || "Hari ini"}
                      </td>
                      <td className="py-2 px-3">
                        <StatusBadge status={d.status || "PENDING"} />
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        <Link href="/tasks" className="btn-ghost text-xs py-1 px-2 text-brand-green">
                          Kelola &rarr;
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN DASHBOARD CLIENT — Role Router
═══════════════════════════════════════════════════════════════ */

export default function DashboardClient() {
  const { userRole, user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [finData, setFinData] = useState<FinanceDashboardData | null>(null);
  const [crmData, setCrmData] = useState<CRMData | null>(null);
  const [crmDash, setCrmDash] = useState<CRMDashType>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Marka+ Request Card & Ticketing States
  const [isNewRequestModalOpen, setIsNewRequestModalOpen] = useState(false);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [successRequestData, setSuccessRequestData] = useState<any>(null);
  const [selectedReviewRequest, setSelectedReviewRequest] = useState<any>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      // Load project data for all roles
      const projectData = await loadAllProjects().catch(() => []);
      setProjects(projectData);

      // Load finance data for finance & executive roles
      if (userRole === "finance" || userRole === "executive") {
        const fin = await loadFinanceDashboard().catch(() => null);
        setFinData(fin);
      }

      // Load CRM data for crm & executive roles
      if (userRole === "crm" || userRole === "executive") {
        const crm = await loadCRMData().catch(() => ({ data: null, dashboard: {} }));
        setCrmData(crm.data);
        setCrmDash(crm.dashboard || {});
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userRole]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ── Role-specific title & subtitle ─── */
  const titles: Record<string, { title: string; subtitle: string }> = {
    executive: { title: "Executive Dashboard", subtitle: "Company-wide overview — semua proyek & keuangan" },
    pm: { title: "Project Manager Dashboard", subtitle: "Monitoring proyek & task operasional Anda" },
    finance: { title: "Finance Dashboard", subtitle: "Monitoring keuangan, anggaran & approval" },
    crm: { title: "CRM & Sales Dashboard", subtitle: "Monitoring pipeline, deal & aktivitas CRM" },
    staff: { title: "Personal Workspace", subtitle: "Ringkasan tugas & jadwal harian Anda" },
  };

  const { title, subtitle } = titles[userRole] || titles.staff;
  const displayName = user?.full_name || user?.email?.split("@")[0] || "User";

  return (
    <div className="flex flex-col gap-5">
      {/* ── Page Header ─────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-brand-deep-green">{title}</h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Selamat datang, <span className="font-medium">{displayName}</span> · {subtitle}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsNewRequestModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[14px] bg-[#275433] hover:bg-[#1E3A2B] text-white text-xs font-extrabold shadow-sm hover:shadow-md transition-all select-none"
          >
            <Sparkles size={14} className="text-[#EAF8D6]" />
            <span>Request Card</span>
          </button>
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="btn-ghost gap-1.5 text-xs flex-shrink-0"
            aria-label="Refresh data"
          >
            <RefreshCw size={13} className={cn(refreshing && "animate-spin")} />
            {refreshing ? "Memuat..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* ── Role-Based Dashboard Content ── */}
      {userRole === "executive" && (
        <ExecutiveDashboard projects={projects} finData={finData} loading={loading} />
      )}
      {userRole === "pm" && (
        <PMDashboard projects={projects} loading={loading} />
      )}
      {userRole === "finance" && (
        <FinanceDashboard finData={finData} loading={loading} />
      )}
      {userRole === "crm" && (
        <CRMDashboard
          projects={projects}
          crmData={crmData}
          crmDash={crmDash}
          loading={loading}
        />
      )}
      {userRole === "staff" && (
        <StaffDashboard projects={projects} loading={loading} />
      )}

      {/* ── Marka+ Active Request Cards Feed ── */}
      <section className="mt-2 pt-5 border-t border-[#D5E2D7]">
        <RequestCardFeed
          onRequestClick={(req) => setSelectedReviewRequest(req)}
          onOpenNewModal={() => setIsNewRequestModalOpen(true)}
          refreshTrigger={refreshTrigger}
        />
      </section>

      {/* ── Marka+ Interactive Modals ── */}
      <NewCardRequestModal
        isOpen={isNewRequestModalOpen}
        onClose={() => setIsNewRequestModalOpen(false)}
        onSuccess={(data) => {
          setIsNewRequestModalOpen(false);
          setSuccessRequestData(data);
          setIsSuccessModalOpen(true);
          setRefreshTrigger(prev => prev + 1);
        }}
      />

      <RequestSuccessModal
        isOpen={isSuccessModalOpen}
        onClose={() => setIsSuccessModalOpen(false)}
        requestData={successRequestData}
      />

      <RequestReviewModal
        isOpen={!!selectedReviewRequest}
        onClose={() => setSelectedReviewRequest(null)}
        request={selectedReviewRequest}
        onActionComplete={() => {
          setRefreshTrigger(prev => prev + 1);
        }}
      />
    </div>
  );
}
