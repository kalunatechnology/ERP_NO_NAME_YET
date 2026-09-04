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
  const [data, setData] = useState({
    itemName: controlledItemName || 'Joint Copper Pipe 3"',
    warehouseCode: controlledWarehouseCode || "WH1-CGK",
    stockAvailable: controlledStockAvailable !== undefined ? controlledStockAvailable : 2500,
    stockNeeded: controlledStockNeeded !== undefined ? controlledStockNeeded : 1000,
    unit: controlledUnit || "units",
  });
  const [loading, setLoading] = useState(false);

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
      const real = await fetchRealInventoryCheckingData();
      setData({
        itemName: controlledItemName || real.itemName,
        warehouseCode: controlledWarehouseCode || real.warehouseCode,
        stockAvailable:
          controlledStockAvailable !== undefined ? controlledStockAvailable : real.stockAvailable,
        stockNeeded: controlledStockNeeded !== undefined ? controlledStockNeeded : real.stockNeeded,
        unit: controlledUnit || real.unit,
      });
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (controlledItemName) {
      setData({
        itemName: controlledItemName,
        warehouseCode: controlledWarehouseCode || "WH1-CGK",
        stockAvailable: controlledStockAvailable !== undefined ? controlledStockAvailable : 2500,
        stockNeeded: controlledStockNeeded !== undefined ? controlledStockNeeded : 1000,
        unit: controlledUnit || "units",
      });
    } else {
      loadData();
    }
  }, [controlledItemName, controlledWarehouseCode, controlledStockAvailable, controlledStockNeeded, controlledUnit]);

  const isAvailable = data.stockAvailable >= data.stockNeeded;

  return (
    <div
      className={cn(
        "w-full bg-white border border-[#E5E9E2] rounded-[24px] p-5 shadow-xs flex flex-col justify-between h-full select-none",
        className
      )}
    >
      {/* Header Banner */}
      <div className="bg-[#F0FEE0] rounded-xl px-3.5 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PackageCheck size={16} className="text-[#275433]" />
          <span className="text-xs font-bold text-[#0E341F]">Inventory Checking</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-[#5A861F] tracking-wider">REAL TIME</span>
          <button
            type="button"
            onClick={loadData}
            title="Muat ulang stok"
            className={cn(
              "p-0.5 text-[#5A861F] hover:text-[#275433] transition-colors cursor-pointer",
              loading && "animate-spin"
            )}
          >
            <RefreshCw size={11} />
          </button>
        </div>
      </div>

      {/* Item & Warehouse Header */}
      <div className="flex justify-between items-center pt-3 pb-1 border-b border-gray-100/80 gap-2">
        <span className="text-xs font-bold text-[#0E341F] truncate" title={data.itemName}>
          {data.itemName}
        </span>
        <span className="text-xs font-bold text-[#5A861F] flex-shrink-0 font-mono">
          {data.warehouseCode}
        </span>
      </div>

      {/* Stock Metrics Breakdown */}
      <div className="flex flex-col gap-2.5 text-xs py-2 my-auto">
        <div className="flex justify-between items-center gap-2">
          <span className="text-[#637566] font-medium truncate">Sufficient stock available</span>
          <span className="font-bold text-[#0E341F] flex-shrink-0">
            {data.stockAvailable.toLocaleString("id-ID")} {data.unit}
          </span>
        </div>

        <div className="flex justify-between items-center gap-2">
          <span className="text-[#637566] font-medium truncate">Stocks needed</span>
          <span className="font-bold text-[#0E341F] flex-shrink-0">
            {data.stockNeeded.toLocaleString("id-ID")} {data.unit}
          </span>
        </div>

        <hr className="border-gray-100 my-0.5" />

        {/* Status Badge Row */}
        <div className="flex justify-between items-center pt-0.5 gap-2">
          <span className="text-xs text-[#637566] font-medium">Stock status</span>
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold flex-shrink-0 ${
              isAvailable ? "bg-[#BBF7D0] text-[#166534]" : "bg-red-100 text-red-700"
            }`}
          >
            <span>{isAvailable ? "Available" : "Shortage / PO Req"}</span>
            {isAvailable ? (
              <CheckCircle2 size={13} className="text-[#166534]" />
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
