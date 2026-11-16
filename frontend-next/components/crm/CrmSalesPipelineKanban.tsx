"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  TrendingUp, DollarSign, Clock, Award, XCircle,
  Kanban, Table2, Calculator, ShieldAlert, Plus,
  Building2, Calendar,
} from "lucide-react";
import { CRMData } from "@/lib/api/crm.api";
import { formatDate, formatMoney } from "@/lib/utils";
import {
  CRMAvatarBadge,
  CRMFilterBar,
  CRMKanbanBoard,
  CRMKanbanColumn,
  CRMKpiItem,
  CRMKpiRow,
  CRMTone,
} from "./CrmDesignSystem";
import { OpportunityStagePopupModal } from "./CrmStagePopupCard";

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
  onOpenActivity: _onOpenActivity,
  onOpenMeeting: _onOpenMeeting,
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
  onMoveStage: (opp: any, targetStage: string, meta?: { sourceStage?: string; position?: number }) => void | Promise<boolean | void>;
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
  const [brandFilter, setBrandFilter] = useState("ALL");
  const [ownerFilter, setOwnerFilter] = useState("ALL");
  const [stageFilter, setStageFilter] = useState("ALL");
  const [optimisticBuckets, setOptimisticBuckets] = useState<Record<string, string>>({});
  const [optimisticProbs, setOptimisticProbs] = useState<Record<string, number>>({});
  const [pendingOppIds, setPendingOppIds] = useState<Set<string>>(() => new Set());
  const latestMoveSeqRef = useRef<Record<string, number>>({});

  // Popup
  const [drawerOpp, setDrawerOpp] = useState<any | null>(null);
  const [columnOrder, setColumnOrder] = useState<Record<string, string[]>>({});

  const partyById = useMemo(
    () => new Map((data.parties || []).map((p: any) => [String(p.id), p])),
    [data.parties]
  );
  const userById = useMemo(
    () => new Map(teamUsers.map((u: any) => [String(u.id), u])),
    [teamUsers]
  );
  const brandById = useMemo(
    () => new Map((data.brands || []).map((b: any) => [String(b.id), b])),
    [data.brands]
  );

  const enrichedOpps = useMemo(() => {
    return (data.opportunities || []).map((o: any) => {
      const idStr = String(o.id);
      const serverBucket = normalizePipelineBucket(o);
      const bucket = optimisticBuckets[idStr] || serverBucket;
      const pid = o.customer_party_id ?? o.customer_party ?? o.customer;
      const party = pid ? partyById.get(String(pid)) : null;
      const brandObj = o.brand_id ? brandById.get(String(o.brand_id)) : null;
      const ownerId = String(o.owner_user_id || o.created_by_id || "");
      const ownerUser = userById.get(ownerId);
      const rawProb = optimisticProbs[idStr] !== undefined ? optimisticProbs[idStr] : Number(o.probability_percent || 0);
      return {
        ...o,
        _bucket: bucket,
        _brandId: o.brand_id ? String(o.brand_id) : "",
        _brandName: brandObj ? `${brandObj.brand_code} · ${brandObj.brand_name}` : "",
        _customerName: party?.display_name || party?.legal_name || o.customer_name || "Pelanggan Umum",
        _party: party,
        _ownerId: ownerId,
        _ownerName: ownerUser?.full_name || ownerUser?.email || "Unassigned",
        _amount: Number(o.expected_amount || 0),
        _prob: Math.max(0, Math.min(100, rawProb)),
      };
    });
  }, [data.opportunities, partyById, brandById, userById, optimisticBuckets, optimisticProbs]);

  const brandScopedOpps = useMemo(() => {
    if (brandFilter === "ALL") return enrichedOpps;
    return enrichedOpps.filter((o) => o._brandId === brandFilter);
  }, [enrichedOpps, brandFilter]);

  const kpiItems: CRMKpiItem[] = useMemo(() => {
    const total = brandScopedOpps.length;
    const active = brandScopedOpps.filter((o) => !["WON", "LOST"].includes(o._bucket));
    const pipelineValue = active.reduce((sum, o) => sum + o._amount, 0);
    const weightedValue = active.reduce((sum, o) => sum + o._amount * (o._prob / 100), 0);
    const closing = brandScopedOpps.filter((o) => ["NEGOTIATION", "FOLLOW_UP"].includes(o._bucket));
    const closingValue = closing.reduce((sum, o) => sum + o._amount, 0);
    const won = brandScopedOpps.filter((o) => o._bucket === "WON");
    const wonValue = won.reduce((sum, o) => sum + o._amount, 0);
    const lost = brandScopedOpps.filter((o) => o._bucket === "LOST");
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
  }, [brandScopedOpps, stageFilter]);

  const filteredOpps = useMemo(() => {
    const q = search.trim().toLowerCase();
    return brandScopedOpps.filter((o) => {
      if (ownerFilter !== "ALL" && o._ownerId !== ownerFilter) return false;
      if (stageFilter === "CLOSING" && !["NEGOTIATION", "FOLLOW_UP"].includes(o._bucket)) return false;
      if (!["ALL", "CLOSING"].includes(stageFilter) && o._bucket !== stageFilter) return false;
      if (!q) return true;
      return [o.opportunity_name, o._customerName, o._brandName, o._ownerName, o.pipeline_stage]
        .some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [brandScopedOpps, ownerFilter, stageFilter, search]);

  const STAGE_PROB_MAP: Record<string, number> = {
    PROSPECT: 10,
    DISCOVERY: 25,
    PROPOSAL_SENT: 50,
    NEGOTIATION: 75,
    FOLLOW_UP: 20,
  };

  const kanbanColumns: CRMKanbanColumn<any>[] = useMemo(() => {
    return PIPELINE_COLUMNS.map((col) => {
      const rawItems = filteredOpps.filter((o) => o._bucket === col.id);
      const order = columnOrder[col.id];
      const items = [...rawItems].sort((a, b) => {
        if (order && order.length > 0) {
          const ia = order.indexOf(String(a.id));
          const ib = order.indexOf(String(b.id));
          if (ia !== -1 || ib !== -1) {
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
          }
        }
        return Number(a.pipeline_position ?? 0) - Number(b.pipeline_position ?? 0);
      });
      const colSum = items.reduce((s, o) => s + o._amount, 0);
      return {
        id: col.id,
        title: col.title,
        tone: col.tone,
        items,
        headerMeta: items.length > 0 ? formatMoney(colSum) : undefined,
      };
    });
  }, [filteredOpps, columnOrder]);

  const applyCardOrder = (idKey: string, sourceCol: string, targetCol: string, targetIndex?: number) => {
    setColumnOrder((prev) => {
      const next = { ...prev };
      const getIds = (colId: string) =>
        next[colId] ??
        filteredOpps
          .filter((o) => o._bucket === colId)
          .sort((a, b) => Number(a.pipeline_position ?? 0) - Number(b.pipeline_position ?? 0))
          .map((o) => String(o.id));

      const sourceIds = getIds(sourceCol).filter((id) => id !== idKey);
      next[sourceCol] = sourceIds;

      const targetIds = sourceCol === targetCol ? [...sourceIds] : getIds(targetCol).filter((id) => id !== idKey);
      const insertAt =
        typeof targetIndex === "number"
          ? Math.max(0, Math.min(targetIndex, targetIds.length))
          : targetIds.length;
      targetIds.splice(insertAt, 0, idKey);
      next[targetCol] = targetIds;
      return next;
    });
  };

  const handleCardDrop = (oppId: string, targetCol: string, targetIndex?: number) => {
    const idKey = String(oppId);
    if (pendingOppIds.has(idKey)) return;

    const opp = enrichedOpps.find((o) => String(o.id) === idKey);
    if (!opp) return;
    if (["WON", "LOST"].includes(opp._bucket)) return;

    if (targetCol === "WON") {
      onDealWon(opp);
      return;
    }
    if (targetCol === "LOST") {
      onMarkLost(opp);
      return;
    }

    const prevBucket = opp._bucket;
    const prevProb = opp._prob;
    const isSameCol = prevBucket === targetCol;
    const targetIdsBefore = (columnOrder[targetCol] ??
      filteredOpps
        .filter((o) => o._bucket === targetCol)
        .sort((a, b) => Number(a.pipeline_position ?? 0) - Number(b.pipeline_position ?? 0))
        .map((o) => String(o.id))
    ).filter((id) => id !== idKey);
    const resolvedPos =
      typeof targetIndex === "number"
        ? Math.max(0, Math.min(targetIndex, targetIdsBefore.length))
        : targetIdsBefore.length;

    const seq = (latestMoveSeqRef.current[idKey] || 0) + 1;
    latestMoveSeqRef.current[idKey] = seq;

    // 1. Immediate Optimistic UI update (position + stage + probability)
    applyCardOrder(idKey, prevBucket, targetCol, resolvedPos);
    if (!isSameCol) {
      setOptimisticBuckets((prev) => ({ ...prev, [idKey]: targetCol }));
      if (STAGE_PROB_MAP[targetCol] !== undefined) {
        setOptimisticProbs((prev) => ({ ...prev, [idKey]: STAGE_PROB_MAP[targetCol] }));
      }
    }
    setPendingOppIds((prev) => {
      const next = new Set(prev);
      next.add(idKey);
      return next;
    });

    // 2. Background API sync with sourceStage + destinationStage + position
    Promise.resolve(onMoveStage(opp, targetCol, { sourceStage: prevBucket, position: resolvedPos }))
      .then((ok) => {
        if (latestMoveSeqRef.current[idKey] !== seq) return;
        if (ok === false) {
          setOptimisticBuckets((prev) => ({ ...prev, [idKey]: prevBucket }));
          setOptimisticProbs((prev) => ({ ...prev, [idKey]: prevProb }));
          applyCardOrder(idKey, targetCol, prevBucket);
        }
      })
      .catch(() => {
        if (latestMoveSeqRef.current[idKey] !== seq) return;
        setOptimisticBuckets((prev) => ({ ...prev, [idKey]: prevBucket }));
        setOptimisticProbs((prev) => ({ ...prev, [idKey]: prevProb }));
        applyCardOrder(idKey, targetCol, prevBucket);
      })
      .finally(() => {
        if (latestMoveSeqRef.current[idKey] !== seq) return;
        setPendingOppIds((prev) => {
          const next = new Set(prev);
          next.delete(idKey);
          return next;
        });
      });
  };

  const canManageDrawer = drawerOpp
    ? !readOnly && (canEditAll || Boolean(currentUserId && String(drawerOpp.created_by_id) === currentUserId))
    : false;

  return (
    <div className="flex flex-col gap-4">
      <CRMKpiRow items={kpiItems} columns={5} />

      <CRMFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Cari opportunity, customer, brand, atau PIC..."
        filters={
          viewMode === "PIPELINE" || viewMode === "LIST"
            ? [
                {
                  id: "brand",
                  value: brandFilter,
                  onChange: setBrandFilter,
                  ariaLabel: "Filter Brand Pipeline",
                  options: [
                    { value: "ALL", label: "All Brands" },
                    ...(data.brands || []).map((b: any) => ({
                      value: String(b.id),
                      label: `${b.brand_code} — ${b.brand_name}`,
                    })),
                  ],
                },
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
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#163D64] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#163D64] transition-all active:scale-98"
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
          pendingIds={pendingOppIds}
          emptyColumnText="Belum ada Opportunity"
          renderCard={(opp) => (
            <div
              onClick={() => {
                setDrawerOpp(opp);
              }}
              className="cursor-pointer space-y-2.5"
            >
              <div className="pr-4">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#0F172A]">
                  <Building2 size={13} className="shrink-0 text-[#0876CD]" />
                  <span className="truncate">{opp._customerName}</span>
                </div>
                <div className="mt-0.5 text-[11px] font-medium text-[#334155] line-clamp-2">
                  {opp.opportunity_name}
                </div>
                {opp._brandName && (
                  <div className="mt-1">
                    <span className="inline-block rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-800">
                      {opp._brandName}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-[#0876CD]">
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

      {/* Opportunity Stage Popup Modal (Sesuai SVG Marka) */}
      <OpportunityStagePopupModal
        opp={drawerOpp ? (enrichedOpps.find((o) => String(o.id) === String(drawerOpp.id)) || drawerOpp) : null}
        data={data}
        isOpen={Boolean(drawerOpp)}
        onClose={() => setDrawerOpp(null)}
        onMoveStage={(opp, targetStage) => onMoveStage(opp, targetStage)}
        onDealWon={onDealWon}
        onMarkLost={onMarkLost}
        onOpenCustomer360={onOpenCustomer360}
        onOpenDelegate={onOpenDelegate}
        onViewEstimate={() => onViewModeChange("ESTIMATE")}
        canManage={canManageDrawer}
        canDelegate={canDelegate}
      />
    </div>
  );
}

