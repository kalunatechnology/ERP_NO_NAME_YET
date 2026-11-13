"use client";

import React, { useMemo, useState } from "react";
import {
  TrendingUp, DollarSign, Clock, Award, XCircle,
  Kanban, Table2, Calculator, ShieldAlert, Plus,
  Building2, Calendar, UserPlus, CheckCircle2, FileText,
} from "lucide-react";
import { CRMData } from "@/lib/api/crm.api";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import {
  CRMAvatarBadge,
  CRMFilterBar,
  CRMKanbanBoard,
  CRMKanbanColumn,
  CRMKpiItem,
  CRMKpiRow,
  CRMRightDrawer,
  CRMTone,
} from "./CrmDesignSystem";

export type PipelineViewMode = "PIPELINE" | "LIST" | "ESTIMATE" | "CREDIT";

const PIPELINE_COLUMNS: Array<{ id: string; title: string; tone: CRMTone }> = [
  { id: "PROSPECT", title: "Meeting & Discussion", tone: "blue" },
  { id: "DISCOVERY", title: "Concept Development", tone: "purple" },
  { id: "PROPOSAL_SENT", title: "Quotation Submission", tone: "amber" },
  { id: "NEGOTIATION", title: "Negotiation", tone: "pink" },
  { id: "FOLLOW_UP", title: "Closing", tone: "amber" },
  { id: "WON", title: "Won", tone: "green" },
  { id: "LOST", title: "Lost", tone: "red" },
];

export function normalizePipelineBucket(opp: any): string {
  const st = String(opp?.status || "").toUpperCase();
  const ps = String(opp?.pipeline_stage || "").toUpperCase();
  if (["WON", "CLOSED_WON"].includes(st) || ["WON", "CLOSED_WON"].includes(ps)) return "WON";
  if (["LOST", "CLOSED_LOST", "CANCELLED", "CANCEL", "BATAL"].includes(st) || ["LOST", "CLOSED_LOST", "CANCELLED", "CANCEL", "BATAL"].includes(ps)) return "LOST";
  if (ps === "OPEN" || ps === "MEETING_DISCUSSION" || ps === "PROSPECT" || !ps) return "PROSPECT";
  if (ps === "QUALIFICATION" || ps === "CONCEPT_DEVELOPMENT" || ps === "DISCOVERY") return "DISCOVERY";
  if (ps === "PROPOSAL" || ps === "QUOTATION_SUBMISSION" || ps === "PROPOSAL_SENT") return "PROPOSAL_SENT";
  if (ps === "NEGOTIATION") return "NEGOTIATION";
  if (ps === "CLOSING" || ps === "FOLLOW_UP") return "FOLLOW_UP";
  return "PROSPECT";
}

export function CrmSalesPipelineShell({
  data,
  teamUsers,
  viewMode,
  onViewModeChange,
  onOpenNewOpp,
  onMoveStage,
  onDealWon,
  onMarkLost,
  onOpenActivity,
  onOpenMeeting,
  onOpenCustomer360,
  onOpenDelegate,
  canDelegate = false,
  readOnly = false,
  canEditAll = false,
  currentUserId,
  listSlot,
  estimateSlot,
  creditSlot,
}: {
  data: CRMData;
  teamUsers: any[];
  viewMode: PipelineViewMode;
  onViewModeChange: (mode: PipelineViewMode) => void;
  onOpenNewOpp: () => void;
  onMoveStage: (opp: any, targetStage: string) => void;
  onDealWon: (opp: any) => void;
  onMarkLost: (opp: any) => void;
  onOpenActivity: (opp: any) => void;
  onOpenMeeting: (opp: any) => void;
  onOpenCustomer360: (oppId: string | number) => void;
  onOpenDelegate?: (opp: any) => void;
  canDelegate?: boolean;
  readOnly?: boolean;
  canEditAll?: boolean;
  currentUserId?: string;
  listSlot: React.ReactNode;
  estimateSlot: React.ReactNode;
  creditSlot: React.ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("ALL");
  const [stageFilter, setStageFilter] = useState("ALL");

  // Drawer
  const [drawerOpp, setDrawerOpp] = useState<any | null>(null);
  const [drawerTab, setDrawerTab] = useState<"overview" | "activities" | "notes" | "estimate">("overview");

  const partyById = useMemo(
    () => new Map((data.parties || []).map((p: any) => [String(p.id), p])),
    [data.parties]
  );
  const userById = useMemo(
    () => new Map(teamUsers.map((u: any) => [String(u.id), u])),
    [teamUsers]
  );

  const enrichedOpps = useMemo(() => {
    return (data.opportunities || []).map((o: any) => {
      const bucket = normalizePipelineBucket(o);
      const pid = o.customer_party_id ?? o.customer_party ?? o.customer;
      const party = pid ? partyById.get(String(pid)) : null;
      const ownerId = String(o.owner_user_id || o.created_by_id || "");
      const ownerUser = userById.get(ownerId);
      return {
        ...o,
        _bucket: bucket,
        _customerName: party?.display_name || party?.legal_name || o.customer_name || "Pelanggan Umum",
        _party: party,
        _ownerId: ownerId,
        _ownerName: ownerUser?.full_name || ownerUser?.email || "Unassigned",
        _amount: Number(o.expected_amount || 0),
        _prob: Math.max(0, Math.min(100, Number(o.probability_percent || 0))),
      };
    });
  }, [data.opportunities, partyById, userById]);

  const kpiItems: CRMKpiItem[] = useMemo(() => {
    const total = enrichedOpps.length;
    const active = enrichedOpps.filter((o) => !["WON", "LOST"].includes(o._bucket));
    const pipelineValue = active.reduce((sum, o) => sum + o._amount, 0);
    const weightedValue = active.reduce((sum, o) => sum + o._amount * (o._prob / 100), 0);
    const closing = enrichedOpps.filter((o) => ["NEGOTIATION", "FOLLOW_UP"].includes(o._bucket));
    const closingValue = closing.reduce((sum, o) => sum + o._amount, 0);
    const won = enrichedOpps.filter((o) => o._bucket === "WON");
    const wonValue = won.reduce((sum, o) => sum + o._amount, 0);
    const lost = enrichedOpps.filter((o) => o._bucket === "LOST");
    const closedTotal = won.length + lost.length;
    const winRate = closedTotal > 0 ? Math.round((won.length / closedTotal) * 100) : 0;

    return [
      {
        id: "ALL",
        label: "Total Opportunity",
        value: total,
        subtitle: `${active.length} aktif di pipeline`,
        tone: "blue",
        icon: TrendingUp,
        active: stageFilter === "ALL",
        onClick: () => setStageFilter("ALL"),
      },
      {
        id: "VALUE",
        label: "Pipeline Value",
        value: formatMoney(pipelineValue),
        subtitle: `Weighted: ${formatMoney(weightedValue)}`,
        tone: "blue",
        icon: DollarSign,
      },
      {
        id: "CLOSING",
        label: "Expected Closing",
        value: closing.length,
        subtitle: formatMoney(closingValue),
        tone: "amber",
        icon: Clock,
        active: stageFilter === "CLOSING",
        onClick: () => setStageFilter(stageFilter === "CLOSING" ? "ALL" : "CLOSING"),
      },
      {
        id: "WON",
        label: "Won",
        value: `${won.length} (${winRate}%)`,
        subtitle: formatMoney(wonValue),
        tone: "green",
        icon: Award,
        active: stageFilter === "WON",
        onClick: () => setStageFilter(stageFilter === "WON" ? "ALL" : "WON"),
      },
      {
        id: "LOST",
        label: "Lost",
        value: lost.length,
        subtitle: formatMoney(lost.reduce((s, o) => s + o._amount, 0)),
        tone: "red",
        icon: XCircle,
        active: stageFilter === "LOST",
        onClick: () => setStageFilter(stageFilter === "LOST" ? "ALL" : "LOST"),
      },
    ];
  }, [enrichedOpps, stageFilter]);

  const filteredOpps = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enrichedOpps.filter((o) => {
      if (ownerFilter !== "ALL" && o._ownerId !== ownerFilter) return false;
      if (stageFilter === "CLOSING" && !["NEGOTIATION", "FOLLOW_UP"].includes(o._bucket)) return false;
      if (!["ALL", "CLOSING"].includes(stageFilter) && o._bucket !== stageFilter) return false;
      if (!q) return true;
      return [o.opportunity_name, o._customerName, o._ownerName, o.pipeline_stage]
        .some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [enrichedOpps, ownerFilter, stageFilter, search]);

  const kanbanColumns: CRMKanbanColumn<any>[] = useMemo(() => {
    return PIPELINE_COLUMNS.map((col) => {
      const items = filteredOpps.filter((o) => o._bucket === col.id);
      const colSum = items.reduce((s, o) => s + o._amount, 0);
      return {
        id: col.id,
        title: col.title,
        tone: col.tone,
        items,
        headerMeta: items.length > 0 ? formatMoney(colSum) : undefined,
      };
    });
  }, [filteredOpps]);

  const handleCardDrop = (oppId: string, targetCol: string) => {
    const opp = enrichedOpps.find((o) => String(o.id) === String(oppId));
    if (!opp || opp._bucket === targetCol) return;
    if (["WON", "LOST"].includes(opp._bucket)) return;
    if (targetCol === "WON") {
      onDealWon(opp);
      return;
    }
    if (targetCol === "LOST") {
      onMarkLost(opp);
      return;
    }
    onMoveStage(opp, targetCol);
  };

  const drawerActivities = useMemo(() => {
    if (!drawerOpp) return [];
    return (data.activities || []).filter((a: any) => String(a.opportunity_id) === String(drawerOpp.id));
  }, [drawerOpp, data.activities]);

  const drawerEstimates = useMemo(() => {
    if (!drawerOpp) return [];
    return (data.estimates || []).filter((e: any) => String(e.opportunity_id || e.opportunity) === String(drawerOpp.id));
  }, [drawerOpp, data.estimates]);

  const drawerQuotations = useMemo(() => {
    if (!drawerOpp) return [];
    return (data.quotations || []).filter((q: any) => String(q.opportunity_id || q.opportunity) === String(drawerOpp.id));
  }, [drawerOpp, data.quotations]);

  const isDrawerClosed = drawerOpp ? ["WON", "LOST"].includes(drawerOpp._bucket) : false;
  const canManageDrawer = drawerOpp
    ? !readOnly && (canEditAll || Boolean(currentUserId && String(drawerOpp.created_by_id) === currentUserId))
    : false;

  return (
    <div className="flex flex-col gap-4">
      <CRMKpiRow items={kpiItems} columns={5} />

      <CRMFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Cari opportunity, customer, atau PIC..."
        filters={
          viewMode === "PIPELINE"
            ? [
                {
                  id: "stage",
                  value: stageFilter,
                  onChange: setStageFilter,
                  ariaLabel: "Filter Tahap Pipeline",
                  options: [
                    { value: "ALL", label: "All Stages" },
                    ...PIPELINE_COLUMNS.map((c) => ({ value: c.id, label: c.title })),
                  ],
                },
                {
                  id: "owner",
                  value: ownerFilter,
                  onChange: setOwnerFilter,
                  ariaLabel: "Filter Sales Owner",
                  options: [
                    { value: "ALL", label: "All Sales Owner" },
                    ...teamUsers.map((u: any) => ({ value: String(u.id), label: u.full_name || u.email })),
                  ],
                },
              ]
            : []
        }
        viewOptions={[
          { id: "PIPELINE", label: "Pipeline", icon: Kanban },
          { id: "LIST", label: "List", icon: Table2 },
          { id: "ESTIMATE", label: "Estimating & Quotations", icon: Calculator, badge: (data.quotations || []).length },
          { id: "CREDIT", label: "Credit Control", icon: ShieldAlert },
        ]}
        activeView={viewMode}
        onViewChange={(v) => onViewModeChange(v as PipelineViewMode)}
        rightActions={
          !readOnly &&
          (viewMode === "PIPELINE" || viewMode === "LIST") && (
            <button
              type="button"
              onClick={onOpenNewOpp}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#2649B3] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#1E3A8A] transition-all active:scale-98"
            >
              <Plus size={14} /> Add Opportunity
            </button>
          )
        }
      />

      {viewMode === "PIPELINE" && (
        <CRMKanbanBoard
          columns={kanbanColumns}
          canDrag={!readOnly}
          onMoveCard={handleCardDrop}
          emptyColumnText="Belum ada Opportunity"
          renderCard={(opp) => (
            <div
              onClick={() => {
                setDrawerOpp(opp);
                setDrawerTab("overview");
              }}
              className="cursor-pointer space-y-2.5"
            >
              <div className="pr-4">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#090909]">
                  <Building2 size={13} className="shrink-0 text-[#006BBC]" />
                  <span className="truncate">{opp._customerName}</span>
                </div>
                <div className="mt-0.5 text-[11px] font-medium text-[#353535] line-clamp-2">
                  {opp.opportunity_name}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-[#006BBC]">
                  {formatMoney(opp._amount)}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                  {opp._prob}%
                </span>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                <CRMAvatarBadge name={opp._ownerName} size="xs" />
                <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                  <Calendar size={10} />
                  {opp.expected_close_date
                    ? formatDate(opp.expected_close_date)
                    : opp.created_at
                    ? formatDate(opp.created_at)
                    : "—"}
                </span>
              </div>
            </div>
          )}
        />
      )}

      {viewMode === "LIST" && listSlot}
      {viewMode === "ESTIMATE" && estimateSlot}
      {viewMode === "CREDIT" && creditSlot}

      {/* Right Contextual Drawer: Opportunity Details */}
      <CRMRightDrawer
        isOpen={Boolean(drawerOpp)}
        onClose={() => setDrawerOpp(null)}
        title={drawerOpp?.opportunity_name || "Opportunity Details"}
        subtitle={drawerOpp?._customerName}
        badge={
          drawerOpp && (
            <span className={cn(
              "rounded-full border px-2.5 py-0.5 text-[11px] font-bold",
              drawerOpp._bucket === "CONCEPT_DEVELOPMENT" ? "border-[#DDD6FE] bg-[#F4E7FE] text-[#A600FF]" :
              drawerOpp._bucket === "QUOTATION_SUBMISSION" ? "border-[#FFD2A4] bg-[#FFEBD4] text-[#E28000]" :
              drawerOpp._bucket === "NEGOTIATION" ? "border-[#FFCCFD] bg-[#FFE5FE] text-[#FF00F2]" :
              drawerOpp._bucket === "CLOSING" || drawerOpp._bucket === "WON" ? "border-[#B0E2AC] bg-[#DAF8D7] text-[#0B8E00]" :
              drawerOpp._bucket === "LOST" ? "border-[#FFB6B6] bg-[#FFE5E5] text-[#FF0000]" :
              "border-[#A9D9FF] bg-[#EDF6FF] text-[#006BBC]"
            )}>
              {PIPELINE_COLUMNS.find((c) => c.id === drawerOpp._bucket)?.title || drawerOpp.pipeline_stage}
            </span>
          )
        }
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "activities", label: "Activities", badge: drawerActivities.length },
          { id: "notes", label: "Notes" },
          { id: "estimate", label: "Estimate & Quotation", badge: drawerEstimates.length + drawerQuotations.length },
        ]}
        activeTab={drawerTab}
        onTabChange={(t) => setDrawerTab(t as any)}
        footer={
          drawerOpp && (
            <>
              {canManageDrawer && !isDrawerClosed && (
                <button
                  type="button"
                  onClick={() => {
                    const target = drawerOpp;
                    setDrawerOpp(null);
                    onMarkLost(target);
                  }}
                  className="mr-auto inline-flex items-center gap-1.5 rounded-xl border border-[#FFB6B6] bg-[#FFE5E5] px-3.5 py-2 text-xs font-bold text-[#FF0000] hover:bg-[#FED7D7] transition-colors"
                >
                  <XCircle size={14} /> Mark Lost
                </button>
              )}
              {drawerOpp._party && (
                <button
                  type="button"
                  onClick={() => {
                    const id = drawerOpp.id;
                    setDrawerOpp(null);
                    onOpenCustomer360(id);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#D9D9D9] bg-white px-3.5 py-2 text-xs font-semibold text-[#353535] hover:bg-[#F8FAFC] transition-colors"
                >
                  Customer 360
                </button>
              )}
              {canManageDrawer && !isDrawerClosed && drawerOpp._party && (
                <button
                  type="button"
                  onClick={() => {
                    const target = drawerOpp;
                    setDrawerOpp(null);
                    onDealWon(target);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B8E00] px-4 py-2 text-xs font-bold text-white hover:bg-[#075500] shadow-xs transition-colors"
                >
                  <CheckCircle2 size={14} /> Process Deal Won
                </button>
              )}
            </>
          )
        }
      >
        {drawerOpp && drawerTab === "overview" && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3.5 rounded-2xl border border-[#D9D9D9] bg-[#F8FAFC] p-4 shadow-2xs">
              <div>
                <div className="text-[11px] font-medium text-[#7D7D7D]">Expected Amount</div>
                <div className="mt-1 text-base font-black text-[#006BBC]">{formatMoney(drawerOpp._amount)}</div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-[#7D7D7D]">Probability</div>
                <div className="mt-1 text-base font-bold text-[#0B8E00]">{drawerOpp._prob}%</div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-[#7D7D7D]">Customer</div>
                <div className="mt-1 font-bold text-[#090909]">{drawerOpp._customerName}</div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-[#7D7D7D]">Sales Owner</div>
                <div className="mt-1.5"><CRMAvatarBadge name={drawerOpp._ownerName} size="xs" /></div>
              </div>
            </div>

            {canManageDrawer && !isDrawerClosed && (
              <div className="rounded-2xl border border-[#D9D9D9] p-4 bg-white shadow-2xs">
                <div className="mb-2.5 font-bold text-[#090909]">Pindahkan Tahap Pipeline</div>
                <div className="flex flex-wrap gap-1.5">
                  {PIPELINE_COLUMNS.filter((c) => !["WON", "LOST"].includes(c.id)).map((col) => (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => {
                        onMoveStage(drawerOpp, col.id);
                        setDrawerOpp(null);
                      }}
                      className={cn(
                        "rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all",
                        drawerOpp._bucket === col.id
                          ? "border-[#2649B3] bg-[#2649B3] text-white shadow-2xs font-bold"
                          : "border-[#D9D9D9] bg-white text-[#353535] hover:bg-[#F6FBFF] hover:border-[#A9D9FF]"
                      )}
                    >
                      {col.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {canDelegate && onOpenDelegate && !isDrawerClosed && (
              <button
                type="button"
                onClick={() => {
                  const target = drawerOpp;
                  setDrawerOpp(null);
                  onOpenDelegate(target);
                }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#A9D9FF] bg-[#EDF6FF] py-2.5 text-xs font-bold text-[#2649B3] hover:bg-[#D8EEFF] transition-colors shadow-2xs"
              >
                <UserPlus size={14} /> Delegasikan PIC Sales / Departemen
              </button>
            )}
          </div>
        )}

        {drawerOpp && drawerTab === "activities" && (
          <div className="space-y-3 text-xs">
            {canManageDrawer && !isDrawerClosed && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const target = drawerOpp;
                    setDrawerOpp(null);
                    onOpenActivity(target);
                  }}
                  className="flex-1 rounded-xl bg-[#2649B3] px-3.5 py-2 font-bold text-white hover:bg-[#1E3A8A] transition-colors shadow-xs"
                >
                  + Catat Aktivitas
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = drawerOpp;
                    setDrawerOpp(null);
                    onOpenMeeting(target);
                  }}
                  className="flex-1 rounded-xl border border-[#D9D9D9] bg-white px-3.5 py-2 font-semibold text-[#353535] hover:bg-[#F8FAFC] transition-colors"
                >
                  Jadwalkan Meeting
                </button>
              </div>
            )}
            {drawerActivities.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-slate-400">
                Belum ada aktivitas tercatat.
              </p>
            ) : (
              drawerActivities.map((a: any) => (
                <div key={a.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="font-bold text-slate-900">{a.activity_type} · {a.subject}</div>
                  <div className="mt-1 text-[11px] text-slate-400">{formatDate(a.scheduled_at || a.created_at)}</div>
                </div>
              ))
            )}
          </div>
        )}

        {drawerOpp && drawerTab === "notes" && (
          <div className="space-y-3 text-xs">
            <div className="rounded-xl border border-slate-200 p-3.5">
              <div className="font-semibold text-slate-700 mb-1">Catatan Follow-Up / Pipeline</div>
              <p className="text-slate-600 whitespace-pre-wrap">{drawerOpp.follow_up_reason || "Belum ada catatan follow-up."}</p>
            </div>
            {drawerOpp.lost_reason && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-red-800">
                <div className="font-semibold mb-1">Alasan Lost: {drawerOpp.lost_reason}</div>
                <p>{drawerOpp.lost_reason_detail || ""}</p>
              </div>
            )}
          </div>
        )}

        {drawerOpp && drawerTab === "estimate" && (
          <div className="space-y-3 text-xs">
            <button
              type="button"
              onClick={() => {
                setDrawerOpp(null);
                onViewModeChange("ESTIMATE");
              }}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#2649B3] px-3.5 py-2.5 font-bold text-white hover:bg-[#1E3A8A] transition-colors shadow-xs"
            >
              <Calculator size={14} /> Kelola di Estimating &amp; Quotations
            </button>
            {drawerEstimates.map((e: any) => (
              <div key={e.id} className="flex items-center justify-between rounded-xl border border-[#D9D9D9] p-3 bg-white">
                <div>
                  <div className="font-bold text-[#090909]">{e.estimate_number || `EST-${String(e.id).slice(0, 8)}`}</div>
                  <div className="text-[11px] text-[#626262]">Status: {e.status}</div>
                </div>
                <div className="font-bold text-[#006BBC]">{formatMoney(e.offered_amount || e.total_cost)}</div>
              </div>
            ))}
            {drawerQuotations.map((q: any) => (
              <div key={q.id} className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
                <div>
                  <div className="font-bold text-slate-900 flex items-center gap-1"><FileText size={12} /> {q.quotation_code || `QUO-${String(q.id).slice(0, 8)}`}</div>
                  <div className="text-[11px] text-slate-500">Status: {q.status}</div>
                </div>
                <div className="font-bold text-emerald-700">{formatMoney(q.total_amount)}</div>
              </div>
            ))}
            {drawerEstimates.length === 0 && drawerQuotations.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-slate-400">
                Belum ada Cost Estimate atau Quotation untuk Opportunity ini.
              </p>
            )}
          </div>
        )}
      </CRMRightDrawer>
    </div>
  );
}

