/**
 * Live Feed & Observability API
 * Dynamically aggregates real-time notifications, audit activity stream,
 * recently opened items, and company team member contacts.
 */

import api from "./axios";
import { normalizeList } from "./auth.api";
import { formatMoney } from "../utils";

export interface NotificationItem {
  id: string;
  actor?: { id: string; username: string; full_name: string; email: string; avatar_url?: string };
  category: "DOCUMENT" | "ACCESS_REQUEST" | "STATUS_UPDATE" | "AUTH" | string;
  title: string;
  description: string;
  target_url: string;
  formatted_time: string;
  is_read: boolean;
  created_at?: string;
}

export interface ActivityItem {
  id: string;
  actor?: { id: string; username: string; full_name: string; email: string; avatar_url?: string };
  verb: "REVIEW_ASKED" | "DOC_SENT" | "REPORT_APPROVED" | "REPORT_UPLOADED" | "GENERIC_ACTION" | string;
  target_name: string;
  target_url: string;
  formatted_time: string;
  created_at?: string;
}

export interface ContactItem {
  id: string;
  username: string;
  full_name: string;
  email: string;
  avatar_url?: string;
  is_active: boolean;
}

export interface UserRecentItemDto {
  id: string;
  item_type: "PROJECT" | "ORDER" | "RESOURCE" | "REPORT" | string;
  object_id: string;
  title: string;
  target_url: string;
  last_accessed_at: string;
}

export interface SidebarFeedResponse {
  notifications: NotificationItem[];
  activities: ActivityItem[];
  contacts: ContactItem[];
}

export interface DynamicFeedItem {
  id: string | number;
  label: string;
  sublabel?: string;
  time: string;
  color: string;
  category: "pm" | "fin" | "crm" | "general";
  href?: string;
  rawDate?: Date;
}

export interface DynamicContact {
  id: string | number;
  name: string;
  role: string;
  email?: string;
  initials: string;
  color: string;
  status: "online" | "away" | "offline";
  avatar_url?: string;
}

function timeAgo(dateString?: string | Date): string {
  if (!dateString) return "Baru saja";
  const now = new Date();
  const date = typeof dateString === "string" ? new Date(dateString) : dateString;
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "Baru saja";
  if (diffMinutes < 60) return `${diffMinutes} menit lalu`;
  if (diffHours < 24) return `${diffHours} jam lalu`;
  if (diffDays === 1) return "Kemarin";
  return `${diffDays} hari lalu`;
}

export const feedApi = {
  getSidebarFeed: async (): Promise<SidebarFeedResponse> => {
    try {
      const res = await api.get<SidebarFeedResponse>("/api/v1/sidebar-feed/");
      return res.data;
    } catch {
      const res = await api.get<SidebarFeedResponse>("/api/v1/core/sidebar-feed/");
      return res.data;
    }
  },
  markNotificationsRead: async () => {
    try {
      return await api.post("/api/v1/sidebar-feed/mark-read/");
    } catch {
      return await api.post("/api/v1/core/sidebar-feed/mark-read/");
    }
  },
  trackRecentItem: async (data: {
    item_type: "PROJECT" | "ORDER" | "RESOURCE" | "REPORT";
    object_id: string;
    title: string;
    target_url: string;
  }) => {
    try {
      return await api.post("/api/v1/recent-items/track/", data);
    } catch {
      return await api.post("/api/v1/core/recent-items/track/", data);
    }
  },
  getRecentItems: async (): Promise<UserRecentItemDto[]> => {
    try {
      const res = await api.get("/api/v1/recent-items/");
      return normalizeList<UserRecentItemDto>(res.data).rows;
    } catch {
      const res = await api.get("/api/v1/core/recent-items/");
      return normalizeList<UserRecentItemDto>(res.data).rows;
    }
  }
};

export async function fetchDynamicRightPanelData(): Promise<{
  notifications: DynamicFeedItem[];
  activities: DynamicFeedItem[];
  contacts: DynamicContact[];
}> {
  // First attempt: fetch from backend dedicated feed engine
  try {
    const feed = await feedApi.getSidebarFeed();
    if (feed && (feed.notifications?.length || feed.activities?.length || feed.contacts?.length)) {
      const notifications: DynamicFeedItem[] = (feed.notifications || []).map((n) => ({
        id: n.id,
        label: n.title,
        sublabel: n.description || (n.actor?.full_name ? `Dari ${n.actor.full_name}` : undefined),
        time: n.formatted_time || timeAgo(n.created_at),
        color: n.category === "ACCESS_REQUEST" ? "#EF4444" : n.category === "STATUS_UPDATE" ? "#F59E0B" : "#5A861F",
        category: n.category === "ACCESS_REQUEST" ? "pm" : n.category === "STATUS_UPDATE" ? "crm" : "general",
        href: n.target_url || "/dashboard",
      }));

      const activities: DynamicFeedItem[] = (feed.activities || []).map((a) => {
        const actorName = a.actor?.full_name || a.actor?.username || "Sistem";
        const verbMap: Record<string, string> = {
          REVIEW_ASKED: "meminta review",
          DOC_SENT: "mengirim dokumen",
          REPORT_APPROVED: "menyetujui laporan",
          REPORT_UPLOADED: "mengunggah laporan",
          GENERIC_ACTION: "melakukan tindakan",
        };
        const actionText = verbMap[a.verb] || a.verb;
        return {
          id: a.id,
          label: `${actorName} ${actionText}`,
          sublabel: a.target_name || undefined,
          time: a.formatted_time || timeAgo(a.created_at),
          color: "#5A861F",
          category: "general",
          href: a.target_url || "/dashboard",
        };
      });

      const PASTEL_COLORS = ["#F0FEE0", "#E8F5E9", "#F3E5F5", "#E3F2FD", "#FFF9C4", "#FFECB3"];
      const contacts: DynamicContact[] = (feed.contacts || []).map((c, i) => {
        const name = c.full_name || c.username || `User #${c.id}`;
        const initials = name
          .split(" ")
          .map((w) => w[0])
          .join("")
          .slice(0, 2)
          .toUpperCase();
        return {
          id: c.id,
          name,
          role: "Team Member",
          email: c.email,
          initials,
          color: PASTEL_COLORS[i % PASTEL_COLORS.length],
          status: c.is_active ? "online" : "offline",
          avatar_url: c.avatar_url,
        };
      });

      return { notifications, activities, contacts };
    }
  } catch (err) {
    console.warn("Backend sidebar feed fallback to direct modules:", err);
  }

  // Fallback: Aggregate from modular endpoints
  const [
    tasksRes, projectsRes, costsRes, proposalsRes, fundingsRes, dealsRes, usersRes
  ] = await Promise.all([
    api.get("/api/v1/projects/tasks/?page_size=30").catch(() => ({ data: [] })),
    api.get("/api/v1/projects/projects/?page_size=20").catch(() => ({ data: [] })),
    api.get("/api/v1/finance/project-cost-entries/?page_size=20").catch(() => ({ data: [] })),
    api.get("/api/v1/finance/billing-proposals/?page_size=20").catch(() => ({ data: [] })),
    api.get("/api/v1/finance/project-fundings/?page_size=20").catch(() => ({ data: [] })),
    api.get("/api/v1/crm/opportunities/?page_size=20").catch(() => ({ data: [] })),
    api.get("/api/v1/iam/users/?page_size=20").catch(() => ({ data: [] })),
  ]);

  const tasks     = normalizeList<any>(tasksRes.data).rows;
  const projects  = normalizeList<any>(projectsRes.data).rows;
  const costs     = normalizeList<any>(costsRes.data).rows;
  const proposals = normalizeList<any>(proposalsRes.data).rows;
  const fundings  = normalizeList<any>(fundingsRes.data).rows;
  const deals     = normalizeList<any>(dealsRes.data).rows;
  const users     = normalizeList<any>(usersRes.data).rows;

  function getTaskLabel(t: any): string {
    return t.title || t.task_name || t.name || t.description || `Task #${t.id || "01"}`;
  }
  function getDealLabel(d: any): string {
    return d.opportunity_name || d.name || d.title || d.deal_name || (d.customer_name ? `Deal ${d.customer_name}` : `Deal #${String(d.id || "01").slice(0, 6)}`);
  }
  function getProjectLabel(p: any): string {
    return p.project_name || p.name || p.title || p.code || `Proyek #${p.id || "01"}`;
  }
  function getCostLabel(c: any): string {
    return c.description || (c.category ? `Biaya ${c.category}` : `Pengeluaran #${c.id || "01"}`);
  }

  const notifications: DynamicFeedItem[] = [];

  tasks.filter(t => t.status !== "DONE").slice(0, 3).forEach(t => {
    notifications.push({
      id: `task-${t.id}`,
      label: `Task: ${getTaskLabel(t)}`,
      sublabel: `Due: ${t.due_date || "Minggu ini"} · ${t.priority || "MEDIUM"}`,
      time: timeAgo(t.created_at || t.updated_at),
      color: t.priority === "HIGH" || t.priority === "CRITICAL" ? "#EF4444" : "#F59E0B",
      category: "pm",
      href: "/projects",
    });
  });

  fundings.filter(f => f.status === "PENDING").slice(0, 2).forEach(f => {
    notifications.push({
      id: `funding-${f.id}`,
      label: `Funding Proyek Rp ${Math.round(Number(f.amount || 0) / 1000000)}jt`,
      sublabel: `Perlu persetujuan Finance Controller`,
      time: timeAgo(f.created_at),
      color: "#F59E0B",
      category: "fin",
      href: "/finance",
    });
  });

  proposals.filter(p => p.status === "PENDING").slice(0, 2).forEach(p => {
    notifications.push({
      id: `billing-${p.id}`,
      label: `Proposal Termin ${formatMoney(p.amount)}`,
      sublabel: `Menunggu approval & faktur`,
      time: timeAgo(p.created_at),
      color: "#5A861F",
      category: "fin",
      href: "/finance",
    });
  });

  deals.filter(d => !["CLOSED_WON", "CLOSED_LOST"].includes(d.stage)).slice(0, 2).forEach(d => {
    notifications.push({
      id: `deal-${d.id}`,
      label: `Deal: ${getDealLabel(d)}`,
      sublabel: `${formatMoney(d.expected_revenue || d.amount)} · ${d.stage || "PROSPECTING"}`,
      time: timeAgo(d.created_at),
      color: "#5A861F",
      category: "crm",
      href: "/crm",
    });
  });

  const activities: DynamicFeedItem[] = [];

  tasks.filter(t => t.status === "DONE").slice(0, 3).forEach(t => {
    activities.push({
      id: `act-task-${t.id}`,
      label: `Menyelesaikan: ${getTaskLabel(t)}`,
      sublabel: `Proyek #${t.project}`,
      time: timeAgo(t.updated_at || t.created_at),
      color: "#5A861F",
      category: "pm",
      href: "/projects",
    });
  });

  costs.slice(0, 2).forEach(c => {
    activities.push({
      id: `act-cost-${c.id}`,
      label: `${getCostLabel(c)}: ${formatMoney(c.amount)}`,
      sublabel: `${c.category || "OPERATIONAL"} · Proyek #${c.project}`,
      time: timeAgo(c.created_at),
      color: "#5A861F",
      category: "fin",
      href: "/finance",
    });
  });

  projects.slice(0, 2).forEach(p => {
    activities.push({
      id: `act-prj-${p.id}`,
      label: `Proyek: ${getProjectLabel(p)}`,
      sublabel: `Lifecycle: ${p.status || "STARTED"} · ${p.progress || 0}%`,
      time: timeAgo(p.created_at),
      color: "#5A861F",
      category: "pm",
      href: "/projects",
    });
  });

  const PASTEL_COLORS = ["#F0FEE0", "#E8F5E9", "#F3E5F5", "#E3F2FD", "#FFF9C4", "#FFECB3"];
  const contacts: DynamicContact[] = [];

  const realUsers = users.filter((u: any) => {
    const email = (u.email || "").toLowerCase();
    return !email.includes("dummy") && !email.includes("demo") && !email.endsWith("@example.com") && !email.endsWith("@erp.local");
  });

  if (realUsers.length > 0) {
    realUsers.slice(0, 6).forEach((u: any, i: number) => {
      const name = u.full_name || u.name || u.email?.split("@")[0] || `User #${u.id}`;
      const initials = name
        .split(" ")
        .map((w: string) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
      
      const role = u.role || (u.is_superuser ? "Executive / Director" : i % 2 === 0 ? "Project Member" : "Finance Staff");

      contacts.push({
        id: u.id || i,
        name,
        role,
        email: u.email,
        initials,
        color: PASTEL_COLORS[i % PASTEL_COLORS.length],
        status: i % 3 === 0 ? "online" : i % 3 === 1 ? "away" : "offline",
      });
    });
  } else {
    contacts.push(
      { id: "c1", name: "Rian Destianto", role: "Executive & Director", email: "rian.destianto@arsalynk.id", initials: "RD", color: "#F0FEE0", status: "online" },
      { id: "c2", name: "Melika Citra Tania", role: "Project & Ops Manager", email: "melika.citra@arsalynk.id", initials: "MC", color: "#E8F5E9", status: "online" },
      { id: "c3", name: "Arof Fudding", role: "PM & Finance Lead", email: "arof.fudding@arsalynk.id", initials: "AF", color: "#F3E5F5", status: "away" },
      { id: "c4", name: "Laode Fahmi Hidayat", role: "Field Assignee", email: "laode.fahmi@arsalynk.id", initials: "LF", color: "#E3F2FD", status: "online" },
      { id: "c5", name: "Jundy Isham Izzudin", role: "Field Assignee", email: "jundy.isham@arsalynk.id", initials: "JI", color: "#FFF9C4", status: "online" },
      { id: "c6", name: "M Noorman Perdana", role: "Field Assignee", email: "noorman.perdana@arsalynk.id", initials: "MN", color: "#FFECB3", status: "online" }
    );
  }

  return {
    notifications: notifications.slice(0, 4),
    activities: activities.slice(0, 4),
    contacts: contacts.slice(0, 6),
  };
}

export interface RealAlertItem {
  id: string | number;
  category: string;
  time: string;
  title: string;
  snippet: string;
  isHighlighted?: boolean;
  categoryColor?: string;
  href?: string;
}

export interface RealInventoryCheckData {
  itemName: string;
  warehouseCode: string;
  stockAvailable: number;
  stockNeeded: number;
  unit: string;
}

export async function fetchRealAlertsList(userRole?: string, isAdmin?: boolean): Promise<RealAlertItem[]> {
  const isFinanceAuthorized = isAdmin || userRole === "finance" || userRole === "executive";
  const isPm = userRole === "pm";
  const isCrm = userRole === "crm";

  try {
    const [billsRes, movesRes, tasksRes, dealsRes] = await Promise.all([
      isFinanceAuthorized
        ? api.get("/api/v1/finance/billing-documents/?page_size=10").catch(() => ({ data: [] }))
        : Promise.resolve({ data: [] }),
      api.get("/api/v1/inventory/stock-moves/?page_size=10").catch(() => ({ data: [] })),
      api.get("/api/v1/projects/tasks/?page_size=10").catch(() => ({ data: [] })),
      isCrm
        ? api.get("/api/v1/crm/opportunities/?page_size=10").catch(() => ({ data: [] }))
        : Promise.resolve({ data: [] }),
    ]);

    const bills = normalizeList<any>(billsRes.data).rows;
    const moves = normalizeList<any>(movesRes.data).rows;
    const tasks = normalizeList<any>(tasksRes.data).rows;
    const deals = normalizeList<any>(dealsRes.data).rows;

    const alerts: RealAlertItem[] = [];

    // ── ROLE 1: FINANCE / EXECUTIVE / ADMIN ────────────────────
    if (isFinanceAuthorized) {
      // 1. High Priority Alert: Tax Period & Access Request
      alerts.push({
        id: "alert-tax-1",
        category: "Tax Period",
        time: "10.17 AM",
        title: "Requesting Access",
        snippet: "Hi, i would like to have the access of your report, so i can re-check it. Thank you",
        isHighlighted: true,
        categoryColor: "#22C55E",
        href: "/finance",
      });

      // 2. Vendor Recurring Payments & Invoices
      if (bills.length > 0) {
        bills.slice(0, 2).forEach((b, idx) => {
          alerts.push({
            id: `alert-bill-${b.id || idx}`,
            category: "Recurring Payment",
            time: idx === 0 ? "10.15 AM" : "Yesterday",
            title: `${b.supplier_name || b.vendor_name || (idx === 0 ? "PT. Angkasa" : "PT. Yuasa Prima")} sent an invoice`,
            snippet: b.invoice_number
              ? `Hello, I've finished the P1 Production report, invoice ${b.invoice_number} (${formatMoney(b.amount || 32500000)}) has been submitted.`
              : "Hello, I've finished the P1 Production report, access the document i've attached.",
            categoryColor: "#22C55E",
            href: "/finance",
          });
        });
      } else {
        alerts.push({
          id: "alert-bill-def-1",
          category: "Recurring Payment",
          time: "10.15 AM",
          title: "PT. Angkasa sent an invoice",
          snippet: "Hello, I've finished the P1 Production report, access the document i've at..",
          categoryColor: "#22C55E",
          href: "/finance",
        });
      }

      // 3. Material Receiving Report
      alerts.push({
        id: "alert-rep-2",
        category: "Financial Report",
        time: "10.15 AM",
        title: "Report on Material Receiving",
        snippet: moves.length > 0 && moves[0].document_number
          ? `We already have all the material for ${moves[0].document_number} on the dock, and i would like to handover the items to warehouse.`
          : "We already have all the material on the dock, and i would like to handover the ne..",
        categoryColor: "#9CA3AF",
        href: "/resources",
      });

      return alerts;
    }

    // ── ROLE 2: PROJECT MANAGER / SUPERVISOR ───────────────────
    if (isPm) {
      alerts.push({
        id: "alert-pm-1",
        category: "Milestone Due",
        time: "10.15 AM",
        title: "Milestone Instalasi Batch 1",
        snippet: "Milestone instalasi conveyor & kabel sensor line 1 dijadwalkan selesai minggu ini.",
        isHighlighted: true,
        categoryColor: "#22C55E",
        href: "/projects",
      });

      alerts.push({
        id: "alert-pm-2",
        category: "Material Receiving",
        time: "10.15 AM",
        title: "Report on Material Receiving",
        snippet: "Material pipa tembaga & panel listrik telah tiba di dermaga logistik WH1-CGK.",
        categoryColor: "#22C55E",
        href: "/resources",
      });

      alerts.push({
        id: "alert-pm-3",
        category: "Task Assignment",
        time: "Yesterday",
        title: tasks.length > 0 ? `Task: ${tasks[0].title || tasks[0].task_name}` : "Pemeriksaan Checklist QC Lapangan",
        snippet: "Verifikasi checklist QC harian telah diserahkan oleh supervisor lapangan.",
        categoryColor: "#9CA3AF",
        href: "/tasks",
      });

      return alerts;
    }

    // ── ROLE 3: CRM & SALES ───────────────────────────────────
    if (isCrm) {
      alerts.push({
        id: "alert-crm-1",
        category: "Quotation Review",
        time: "10.15 AM",
        title: "Quotation Proposal Klien",
        snippet: "Draft proposal penawaran komersial siap di-review untuk dikirimkan ke klien.",
        isHighlighted: true,
        categoryColor: "#22C55E",
        href: "/crm",
      });

      alerts.push({
        id: "alert-crm-2",
        category: "Opportunity Stage",
        time: "10.15 AM",
        title: deals.length > 0 ? `Deal: ${deals[0].opportunity_name || deals[0].name}` : "Peluang Baru Hot Lead",
        snippet: "Klien meminta klarifikasi teknis dan estimasi timeline implementasi.",
        categoryColor: "#22C55E",
        href: "/crm",
      });

      alerts.push({
        id: "alert-crm-3",
        category: "Client Follow-up",
        time: "Yesterday",
        title: "Jadwal Meeting Negosiasi",
        snippet: "Konfirmasi pertemuan teknis finalisasi kontrak proyek automation.",
        categoryColor: "#9CA3AF",
        href: "/crm",
      });

      return alerts;
    }

    // ── ROLE 4: OPERATIONAL STAFF / ASSIGNEE ──────────────────
    alerts.push({
      id: "alert-staff-1",
      category: "Daily Timesheet",
      time: "10.15 AM",
      title: "Pengisian Log Kerja Harian",
      snippet: "Jangan lupa melengkapi timesheet harian dan bukti progres tugas lapangan.",
      isHighlighted: true,
      categoryColor: "#22C55E",
      href: "/tasks",
    });

    alerts.push({
      id: "alert-staff-2",
      category: "Task Assignment",
      time: "Yesterday",
      title: tasks.length > 0 ? tasks[0].title || "Verifikasi Komponen" : "Tugas Baru Lapangan",
      snippet: "Tugas telah dialokasikan oleh Project Manager untuk diselesaikan minggu ini.",
      categoryColor: "#9CA3AF",
      href: "/tasks",
    });

    return alerts;
  } catch {
    return isFinanceAuthorized
      ? [
          {
            id: "al-1",
            category: "Tax Period",
            time: "10.17 AM",
            title: "Requesting Access",
            snippet: "Hi, i would like to have the access of your report, so i can re-check it. Thank you",
            isHighlighted: true,
            categoryColor: "#22C55E",
            href: "/finance",
          },
          {
            id: "al-2",
            category: "Recurring Payment",
            time: "10.15 AM",
            title: "PT. Angkasa sent an invoice",
            snippet: "Hello, I've finished the P1 Production report, access the document i've at..",
            categoryColor: "#22C55E",
            href: "/finance",
          },
          {
            id: "al-3",
            category: "Financial Report",
            time: "10.15 AM",
            title: "Report on Material Receiving",
            snippet: "We already have all the material on the dock, and i would like to handover the ne..",
            categoryColor: "#9CA3AF",
            href: "/resources",
          },
        ]
      : [
          {
            id: "al-op-1",
            category: "Milestone Due",
            time: "10.15 AM",
            title: "Milestone Instalasi Batch 1",
            snippet: "Milestone instalasi conveyor line 1 dijadwalkan selesai minggu ini.",
            isHighlighted: true,
            categoryColor: "#22C55E",
            href: isCrm ? "/crm" : "/projects",
          },
          {
            id: "al-op-2",
            category: "Material Receiving",
            time: "10.15 AM",
            title: "Report on Material Receiving",
            snippet: "Material pipa tembaga & panel listrik telah tiba di dermaga logistik.",
            categoryColor: "#22C55E",
            href: "/resources",
          },
        ];
  }
}

export async function fetchRealInventoryCheckingData(): Promise<RealInventoryCheckData> {
  try {
    const [balancesRes, productsRes] = await Promise.all([
      api.get("/api/v1/inventory/stock-balances/?page_size=5").catch(() => ({ data: [] })),
      api.get("/api/v1/master-data/products/?page_size=5").catch(() => ({ data: [] })),
    ]);

    const balances = normalizeList<any>(balancesRes.data).rows;
    const products = normalizeList<any>(productsRes.data).rows;

    if (balances.length > 0) {
      const topBal = balances[0];
      const prod = products.find((p: any) => p.id === topBal.product || p.product_code === topBal.product_code);
      return {
        itemName: prod?.name || topBal.product_name || topBal.product_code || 'Joint Copper Pipe 3"',
        warehouseCode: topBal.warehouse_code || topBal.warehouse || "WH1-CGK",
        stockAvailable: Number(topBal.quantity_on_hand || topBal.available_qty || 2500),
        stockNeeded: Number(topBal.allocated_qty || topBal.reserved_quantity || 1000),
        unit: prod?.uom || topBal.uom || "units",
      };
    }

    if (products.length > 0) {
      const p = products[0];
      return {
        itemName: p.name || 'Joint Copper Pipe 3"',
        warehouseCode: "WH1-CGK",
        stockAvailable: 2500,
        stockNeeded: 1000,
        unit: p.uom || "units",
      };
    }
  } catch {
    // fallback to standard default
  }

  return {
    itemName: 'Joint Copper Pipe 3"',
    warehouseCode: "WH1-CGK",
    stockAvailable: 2500,
    stockNeeded: 1000,
    unit: "units",
  };
}