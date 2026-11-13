/**
 * File: frontend-next/components/ui/InventoryCheckingCard.tsx
 *
 * Purpose: Defines the React component and its user-facing responsibility in the Marka+/Arsalynk frontend.
 * Integration: Called by Next routing or parent components; API and browser-state effects are documented on the responsible functions below.
 * Boundary: This file owns presentation/orchestration only and relies on shared context/API modules for identity and persistence.
 */
"use client";

import React, { useState, useEffect } from "react";
import { CheckCircle2, AlertTriangle, PackageCheck, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchRealInventoryCheckingData } from "@/lib/api/feed.api";
import { getUserFacingApiError } from "@/lib/api/error-message";
import { useAuth } from "@/contexts/AuthContext";

export interface InventoryCheckProps {
  itemName?: string;
  warehouseCode?: string;
  stockAvailable?: number;
  stockNeeded?: number;
  unit?: string;
  className?: string;
  autoFetch?: boolean;
}

/**
 * InventoryCheckingCard implements the local UI interaction represented by its typed signature.
 *
 * @param input - The declared props/event/value arguments; caller identity and company state come only from imported context/API helpers.
 * @returns The rendered React value, synchronous result, or Promise declared by the implementation.
 * Side effects: updates the local React/browser state or invokes callbacks visible below.
 */
export function InventoryCheckingCard({
  itemName: controlledItemName,
  warehouseCode: controlledWarehouseCode,
  stockAvailable: controlledStockAvailable,
  stockNeeded: controlledStockNeeded,
  unit: controlledUnit,
  className,
  autoFetch = true,
}: InventoryCheckProps) {
  const { user, userRole } = useAuth();
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchRealInventoryCheckingData>>>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

/**
 * loadData implements the local UI interaction represented by its typed signature.
 *
 * @param input - The declared props/event/value arguments; caller identity and company state come only from imported context/API helpers.
 * @returns The rendered React value, synchronous result, or Promise declared by the implementation.
 * Side effects: updates the local React/browser state or invokes callbacks visible below.
 */
  const loadData = async () => {
    if (!autoFetch && controlledItemName) return;
    setLoading(true);
    try {
      const real = await fetchRealInventoryCheckingData({
        enabledModules: user?.enabled_modules,
        delegatedModules: user?.delegated_modules,
        activeRoleCode: user?.active_role_code,
        isSuperAdmin: userRole === "super_admin",
      });
      if (!real) {
        setData(null);
        setLoadError(null);
        return;
      }
      setData({
        itemName: controlledItemName || real.itemName,
        warehouseCode: controlledWarehouseCode || real.warehouseCode,
        stockAvailable:
          controlledStockAvailable !== undefined ? controlledStockAvailable : real.stockAvailable,
        stockNeeded: controlledStockNeeded !== undefined ? controlledStockNeeded : real.stockNeeded,
        unit: controlledUnit || real.unit,
      });
      setLoadError(null);
    } catch (error) {
      setData(null);
      setLoadError(getUserFacingApiError(error, "Data stok belum dapat dimuat. Periksa akses Inventory dan koneksi, lalu coba lagi."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (controlledItemName) {
      setData({
        itemName: controlledItemName,
        warehouseCode: controlledWarehouseCode || "-",
        stockAvailable: controlledStockAvailable !== undefined ? controlledStockAvailable : 0,
        stockNeeded: controlledStockNeeded !== undefined ? controlledStockNeeded : 0,
        unit: controlledUnit || "unit",
      });
    } else {
      loadData();
    }
  }, [controlledItemName, controlledWarehouseCode, controlledStockAvailable, controlledStockNeeded, controlledUnit, user?.active_role_code, user?.delegated_modules, user?.enabled_modules, userRole]);

  if (!data) {
    return (
      <div className={cn("w-full bg-white border border-[#EFEFEF] rounded-2xl p-5 shadow-xs h-full", className)}>
        <div className="flex items-center gap-2 text-sm font-bold text-text-primary"><PackageCheck size={17} /> Pemeriksaan Inventory</div>
        <p role={loadError ? "alert" : undefined} className={cn("mt-3 text-xs", loadError ? "text-red-700" : "text-text-secondary")}>{loadError || "Data inventory tidak tersedia untuk modul dan role aktif Anda."}</p>
      </div>
    );
  }

  const isAvailable = data.stockAvailable >= data.stockNeeded;

  return (
    <div
      className={cn(
        "w-full bg-white border border-[#EFEFEF] rounded-2xl p-5 shadow-xs flex flex-col justify-between h-full select-none",
        className
      )}
    >
      {/* Header Banner */}
      <div className="bg-[#E7F2FF] rounded-xl px-3.5 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PackageCheck size={16} className="text-[#163D64]" />
          <span className="text-xs font-bold text-[#0F172A]">Inventory Checking</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-[#0876CD] tracking-wider">REAL TIME</span>
          <button
            type="button"
            onClick={loadData}
            title="Muat ulang stok"
            className={cn(
              "p-0.5 text-[#0876CD] hover:text-[#163D64] transition-colors cursor-pointer",
              loading && "animate-spin"
            )}
          >
            <RefreshCw size={11} />
          </button>
        </div>
      </div>

      {/* Item & Warehouse Header */}
      <div className="flex justify-between items-center pt-3 pb-1 border-b border-gray-100/80 gap-2">
        <span className="text-xs font-bold text-[#0F172A] truncate" title={data.itemName}>
          {data.itemName}
        </span>
        <span className="text-xs font-bold text-[#0876CD] flex-shrink-0 font-mono">
          {data.warehouseCode}
        </span>
      </div>

      {/* Stock Metrics Breakdown */}
      <div className="flex flex-col gap-2.5 text-xs py-2 my-auto">
        <div className="flex justify-between items-center gap-2">
          <span className="text-[#64748B] font-medium truncate">Sufficient stock available</span>
          <span className="font-bold text-[#0F172A] flex-shrink-0">
            {data.stockAvailable.toLocaleString("id-ID")} {data.unit}
          </span>
        </div>

        <div className="flex justify-between items-center gap-2">
          <span className="text-[#64748B] font-medium truncate">Stocks needed</span>
          <span className="font-bold text-[#0F172A] flex-shrink-0">
            {data.stockNeeded.toLocaleString("id-ID")} {data.unit}
          </span>
        </div>

        <hr className="border-gray-100 my-0.5" />

        {/* Status Badge Row */}
        <div className="flex justify-between items-center pt-0.5 gap-2">
          <span className="text-xs text-[#64748B] font-medium">Stock status</span>
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold flex-shrink-0 ${
              isAvailable ? "bg-[#BAE6FD] text-[#163D64]" : "bg-red-100 text-red-700"
            }`}
          >
            <span>{isAvailable ? "Available" : "Shortage / PO Req"}</span>
            {isAvailable ? (
              <CheckCircle2 size={13} className="text-[#163D64]" />
            ) : (
              <AlertTriangle size={13} className="text-red-700" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default InventoryCheckingCard;
