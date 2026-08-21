"use client";

import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import api from "@/lib/api/axios";
import { normalizeList } from "@/lib/api/auth.api";
import { loadAllProjects, Project, DailyTask, updateDailyTask } from "@/lib/api/project.api";
import { CheckCircle2, Plus, Search, Check, Filter, Layers, Clock, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";

export default function TasksClient() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const projs = await loadAllProjects();
      setProjects(projs);
    } catch {
      toast.error("Gagal memuat data task");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  /* Flatten all tasks across projects */
  const allTasks = useMemo(() => {
    const list: {
      projectId: string | number;
      projectName: string;
      projectCode: string;
      mainTaskName: string;
      weekNumber: number;
      task: DailyTask;
    }[] = [];

    projects.forEach(p => {
      (p.main_tasks || []).forEach(m => {
        (m.weekly_tasks || m.weekly_plans || []).forEach(w => {
          (w.daily_tasks || []).forEach(d => {
            list.push({
              projectId: p.id,
              projectName: p.project_name || p.name || `Proyek ${p.id}`,
              projectCode: p.project_code || p.code || "PRJ",
              mainTaskName: m.name || m.title || "Main Task",
              weekNumber: w.week_number || 1,
              task: d
            });
          });
        });
      });
    });

    return list;
  }, [projects]);

  const filteredTasks = useMemo(() => {
    return allTasks.filter(item => {
      const matchSearch = search ? (
        (item.task.title || "").toLowerCase().includes(search.toLowerCase()) ||
        item.projectName.toLowerCase().includes(search.toLowerCase()) ||
        item.mainTaskName.toLowerCase().includes(search.toLowerCase())
      ) : true;

      if (!matchSearch) return false;
      if (activeFilter === "ALL") return true;
      if (activeFilter === "TODAY") {
        const today = new Date().toISOString().split("T")[0];
        return item.task.planned_date === today;
      }
      if (activeFilter === "ACTIVE") return item.task.status === "ON_PROGRESS" || item.task.status === "PENDING";
      if (activeFilter === "COMPLETED") return item.task.status === "COMPLETED" || item.task.status === "DONE";
      if (activeFilter === "BLOCKED") return item.task.status === "BLOCKED" || item.task.is_blocked;
      return true;
    });
  }, [allTasks, activeFilter, search]);

  const toggleTaskStatus = async (task: DailyTask) => {
    const isDone = task.status === "COMPLETED" || task.status === "DONE";
    const nextStatus = isDone ? "ON_PROGRESS" : "COMPLETED";
    const nextProg = isDone ? 50 : 100;
    try {
      await updateDailyTask(task.id, { status: nextStatus, progress: nextProg });
      toast.success(isDone ? "Status task dibuka kembali" : "Task diselesaikan 100%!", { icon: "✅" });
      fetchTasks();
    } catch {
      toast.error("Gagal memperbarui status task");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <Layers size={22} className="text-brand-green" /> Tasks & Personal Workspace
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Daftar seluruh tugas operasional harian Anda yang dihimpun dari seluruh proyek (Cross-Project View)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={fetchTasks} className="btn-ghost py-1.5 px-3 text-xs gap-1.5">
            <RefreshCw size={13} /> Refresh Tasks
          </button>
        </div>
      </div>

      {/* Toolbar & Search */}
      <div className="card p-4 rounded-2xl bg-white border border-text-tertiary flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <Search size={16} className="text-text-secondary flex-shrink-0" />
          <input
            type="text"
            placeholder="Cari task, aktivitas, atau nama proyek…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input py-1.5 text-xs"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {[
            { id: "ALL", label: `Semua Task (${allTasks.length})` },
            { id: "TODAY", label: "⚡ Hari Ini (Today)" },
            { id: "ACTIVE", label: "Aktif / Berjalan" },
            { id: "COMPLETED", label: "Selesai" },
            { id: "BLOCKED", label: "Terkendala ⚠️" },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all",
                activeFilter === tab.id
                  ? "bg-brand-deep-green text-white shadow-xs"
                  : "bg-gray-100 text-text-secondary hover:bg-gray-200"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tasks Table */}
      <div className="card rounded-2xl border border-text-tertiary bg-white overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-xs text-text-secondary animate-pulse">
            Menyinkronkan seluruh task dari semua proyek…
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center text-text-secondary gap-3">
            <CheckCircle2 size={36} className="text-brand-green opacity-40" />
            <p className="text-xs font-medium">Tidak ada task yang sesuai dengan filter atau pencarian saat ini.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full data-table text-xs text-left">
              <thead>
                <tr className="bg-gray-50 text-text-secondary text-2xs uppercase tracking-wider">
                  <th className="py-3 px-4 font-bold">Proyek & WBS</th>
                  <th className="py-3 px-4 font-bold">Tanggal & Waktu</th>
                  <th className="py-3 px-4 font-bold">Aktivitas / Task</th>
                  <th className="py-3 px-4 font-bold">Output Hasil Kerja</th>
                  <th className="py-3 px-4 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map(({ projectId, projectName, projectCode, mainTaskName, weekNumber, task }) => {
                  const isDone = task.status === "COMPLETED" || task.status === "DONE";
                  const isBlocked = task.is_blocked || task.status === "BLOCKED";

                  return (
                    <tr key={task.id} className={cn("hover:bg-brand-light-green/20 border-b border-gray-100", isBlocked && "bg-red-50/50")}>
                      <td className="py-3 px-4 align-top">
                        <span className="text-2xs font-extrabold px-1.5 py-0.5 rounded bg-brand-light-green text-brand-deep-green mr-1.5">
                          {projectCode}
                        </span>
                        <strong className="text-xs text-text-primary block mt-0.5">{projectName}</strong>
                        <span className="text-2xs text-text-secondary block mt-0.5">
                          {mainTaskName} &bull; <b className="text-indigo-600">W#{weekNumber}</b>
                        </span>
                      </td>

                      <td className="py-3 px-4 align-top whitespace-nowrap font-medium text-text-primary">
                        <div>{task.planned_date}</div>
                        <span className="text-2xs text-text-secondary">{task.time_slot}</span>
                      </td>

                      <td className="py-3 px-4 align-top max-w-[280px]">
                        <div className="flex items-start gap-2.5">
                          <button
                            onClick={() => toggleTaskStatus(task)}
                            className={cn(
                              "w-4 h-4 rounded mt-0.5 flex items-center justify-center border transition-all flex-shrink-0",
                              isDone ? "bg-emerald-600 border-emerald-600 text-white" : "border-gray-300 hover:border-emerald-500"
                            )}
                            title={isDone ? "Tandai belum selesai" : "Tandai selesai"}
                          >
                            {isDone && <Check size={11} strokeWidth={3} />}
                          </button>
                          <div>
                            <strong className={cn("text-xs font-bold block text-text-primary", isDone && "line-through text-text-secondary")}>
                              {task.title || task.activity_input}
                            </strong>
                            {task.notes && (
                              <span className="text-2xs text-text-secondary block mt-0.5 italic">{task.notes}</span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 align-top max-w-[200px] text-emerald-800">
                        {task.output_result || <span className="text-text-secondary italic text-2xs">-</span>}
                      </td>

                      <td className="py-3 px-4 align-top whitespace-nowrap">
                        <span className={cn(
                          "badge text-2xs font-bold",
                          isDone ? "badge-success" : isBlocked ? "badge-danger" : "badge-info"
                        )}>
                          {task.status} ({task.progress}%)
                        </span>
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
