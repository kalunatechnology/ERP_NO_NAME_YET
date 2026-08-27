"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { fetchRealMonthlyStackedData } from "@/lib/api/finance.api";
import { RefreshCw, SlidersHorizontal, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";

export interface MonthlyBarItem {
  month: string; // e.g. "Jan", "Feb", "Mar"
  bottomValue: number; // in Millions (Juta Rupiah)
  topValue: number; // in Millions (Juta Rupiah)
  fullDate?: string;
  notes?: string;
  hasData?: boolean;
}

export interface MonthlyStackedBarChartProps {
  title?: string;
  subtitle?: string;
  data?: MonthlyBarItem[];
  maxValue?: number; // explicit max in Millions (e.g. 500 for 500 Jt, 1000 for 1 M, 100000 for 100 M)
  primaryColor?: string; // default bottom '#4E751D'
  secondaryColor?: string; // default top '#B5D96C'
  primaryLabel?: string;
  secondaryLabel?: string;
  unit?: string;
  className?: string;
  initialWindowStart?: number; // 0 for Jan, 2 for Mar
  visibleCount?: number; // default 9 months visible
  autoFetch?: boolean; // default true (loads real database aggregations)
}

export const MAX_SCALE_OPTIONS = [
  { label: "Otomatis (Auto)", value: 0 },
  { label: "500 Juta", value: 500 },
  { label: "1 Miliar", value: 1000 },
  { label: "2 Miliar", value: 2000 },
  { label: "5 Miliar", value: 5000 },
  { label: "10 Miliar", value: 10000 },
  { label: "25 Miliar", value: 25000 },
  { label: "50 Miliar", value: 50000 },
  { label: "100 Miliar", value: 100000 },
];

const MONTH_NAMES_DEFAULT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const DEFAULT_DATA: MonthlyBarItem[] = MONTH_NAMES_DEFAULT.map((month) => ({
  month,
  bottomValue: 0,
  topValue: 0,
  hasData: false,
  notes: "Belum ada data transaksi tercatat",
}));

function formatValueDisplay(valInJt: number): string {
  if (valInJt <= 0) return "Rp 0";
  if (valInJt >= 1000) {
    const valM = valInJt / 1000;
    return `Rp ${valM.toFixed(valM % 1 === 0 ? 0 : 2)} Miliar`;
  }
  return `Rp ${Math.round(valInJt).toLocaleString("id-ID")} Juta`;
}

export function MonthlyStackedBarChart({
  title,
  subtitle,
  data,
  maxValue: explicitMaxValue,
  primaryColor = "#4E751D",
  secondaryColor = "#B5D96C",
  primaryLabel = "Realisasi Kas",
  secondaryLabel = "WIP / Proyeksi Biaya",
  unit,
  className,
  initialWindowStart = 0,
  visibleCount = 9,
  autoFetch = true,
}: MonthlyStackedBarChartProps) {
  const [realData, setRealData] = useState<MonthlyBarItem[]>(data || DEFAULT_DATA);
  const [autoComputedMax, setAutoComputedMax] = useState<number>(500);
  const [selectedScale, setSelectedScale] = useState<number>(explicitMaxValue || 0); // 0 = Auto
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadRealFinancials = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetchRealMonthlyStackedData();
      if (res && res.data && res.data.length > 0) {
        setRealData(res.data);
        setAutoComputedMax(res.maxValue || 500);
      }
    } catch {
      // ignore silently and maintain current data
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (data && data.length > 0) {
      setRealData(data);
    } else if (autoFetch) {
      loadRealFinancials();
    }
  }, [data, autoFetch, loadRealFinancials]);

  // Determine active maximum scale value in Millions (Jt)
  const effectiveMax = useMemo(() => {
    if (selectedScale > 0) return selectedScale;
    return Math.max(500, autoComputedMax);
  }, [selectedScale, autoComputedMax]);

  const chartData = realData.length > 0 ? realData : DEFAULT_DATA;
  const totalMonths = chartData.length;

  // Slider State (0 to totalMonths - visibleCount)
  const maxStartIndex = Math.max(0, totalMonths - visibleCount);
  const [startIndex, setStartIndex] = useState(
    Math.min(initialWindowStart, maxStartIndex)
  );
  const [hoveredItem, setHoveredItem] = useState<{
    item: MonthlyBarItem;
    x: number;
    y: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const sliderTrackRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  // Visible items slice based on current slider window
  const visibleItems = useMemo(() => {
    return chartData.slice(startIndex, startIndex + visibleCount);
  }, [chartData, startIndex, visibleCount]);

  // Compute Y-Axis Ticks dynamically based on effectiveMax scale
  const yTicks = useMemo(() => {
    const isMiliar = effectiveMax >= 1000;
    const divisor = isMiliar ? 1000 : 1;
    const activeUnit = unit || (isMiliar ? " M" : " Jt");

    const formatTick = (val: number) => {
      const scaled = val / divisor;
      const formatted = isMiliar
        ? (scaled % 1 === 0 ? scaled.toFixed(0) : scaled.toFixed(1))
        : Math.round(scaled).toLocaleString("id-ID");
      return `${formatted}${activeUnit}`;
    };

    return [
      { label: formatTick(effectiveMax), val: effectiveMax },
      { label: formatTick(effectiveMax * 0.8), val: effectiveMax * 0.8 },
      { label: formatTick(effectiveMax * 0.6), val: effectiveMax * 0.6 },
      { label: formatTick(effectiveMax * 0.4), val: effectiveMax * 0.4 },
      { label: formatTick(effectiveMax * 0.2), val: effectiveMax * 0.2 },
      { label: `>0${activeUnit}`, val: 0 },
    ];
  }, [effectiveMax, unit]);

  // Calculate slider width and left position percentage
  const sliderWidthPercent = Math.min(100, (visibleCount / totalMonths) * 100);
  const sliderLeftPercent = (startIndex / totalMonths) * 100;

  // Handle slider interaction
  const handleSliderClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!sliderTrackRef.current) return;
    const rect = sliderTrackRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const targetStart = Math.round(ratio * (totalMonths - visibleCount));
    setStartIndex(Math.max(0, Math.min(maxStartIndex, targetStart)));
  };

  const handleMouseDown = () => {
    isDraggingRef.current = true;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !sliderTrackRef.current) return;
      const rect = sliderTrackRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, clickX / rect.width));
      const targetStart = Math.round(ratio * (totalMonths - visibleCount));
      setStartIndex(Math.max(0, Math.min(maxStartIndex, targetStart)));
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [maxStartIndex, totalMonths, visibleCount]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "w-full bg-white border border-[#E5E9E2] rounded-[24px] p-6 shadow-xs flex flex-col justify-between select-none relative",
        className
      )}
    >
      {/* ── Top Header Toolbar: Title, Scale Selector & Legend ── */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4 pb-3 border-b border-gray-100/90">
        <div>
          {title && <h3 className="text-base font-bold text-[#0E341F]">{title}</h3>}
          {subtitle && <p className="text-xs text-[#637566] mt-0.5">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-3.5 text-xs flex-wrap">
          {/* Legend Items */}
          <div className="flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-md"
              style={{ backgroundColor: primaryColor }}
            />
            <span className="text-[#637566] font-medium">{primaryLabel}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-md"
              style={{ backgroundColor: secondaryColor }}
            />
            <span className="text-[#637566] font-medium">{secondaryLabel}</span>
          </div>

          {/* ── Interactive Max Scale Selector (500 Jt s/d 100 Miliar) ── */}
          <div className="flex items-center gap-1.5 bg-[#F9FAFB] border border-[#E5E9E2] px-2.5 py-1 rounded-xl shadow-2xs">
            <SlidersHorizontal size={13} className="text-[#5A861F]" />
            <span className="text-[11px] font-semibold text-[#4A5D4E] hidden sm:inline">Skala:</span>
            <select
              value={selectedScale}
              onChange={(e) => {
                const val = Number(e.target.value);
                setSelectedScale(val);
                const opt = MAX_SCALE_OPTIONS.find((o) => o.value === val);
                toast.success(`Skala grafik diubah ke ${opt?.label || "Auto"}`, { icon: "📊" });
              }}
              className="bg-transparent text-xs font-bold text-[#0E341F] focus:outline-none cursor-pointer pr-1"
            >
              {MAX_SCALE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Live Refresh Trigger */}
          {autoFetch && (
            <button
              type="button"
              onClick={() => {
                loadRealFinancials(true);
                toast.success("Data finansial bulanan disinkronkan real-time", { icon: "🔄" });
              }}
              disabled={loading || refreshing}
              className="p-1.5 rounded-lg text-text-secondary hover:text-brand-green hover:bg-brand-light-green transition-colors cursor-pointer"
              title="Sinkronkan data live"
            >
              <RefreshCw size={13} className={cn((loading || refreshing) && "animate-spin text-brand-green")} />
            </button>
          )}
        </div>
      </div>

      {/* ── Main Chart Graphic Canvas ── */}
      <div className="relative w-full h-[320px] flex items-stretch pt-2 pb-6">
        {/* Y-Axis Column */}
        <div className="flex flex-col justify-between pr-3 select-none w-18 flex-shrink-0 text-right">
          {yTicks.map((tick, i) => (
            <div key={i} className="flex items-center justify-end h-0">
              <span className="text-xs font-semibold text-[#4E751D] tracking-tight">
                {tick.label}
              </span>
            </div>
          ))}
        </div>

        {/* Chart Bars & Horizontal Dashed Gridlines */}
        <div className="relative flex-1 flex flex-col justify-between pl-2">
          {/* Dashed Grid Lines */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
            {yTicks.map((_, i) => (
              <div
                key={i}
                className="w-full border-b border-dashed border-[#B5CCA5]/60 h-0"
              />
            ))}
          </div>

          {/* Bar Columns Container */}
          <div className="relative z-10 w-full h-full flex items-end justify-between px-2 gap-2 sm:gap-3">
            {visibleItems.map((item, idx) => {
              const isZero = item.bottomValue <= 0 && item.topValue <= 0;
              const hasOnlyBottom = item.bottomValue > 0 && item.topValue <= 0;
              const hasOnlyTop = item.bottomValue <= 0 && item.topValue > 0;
              const hasBoth = item.bottomValue > 0 && item.topValue > 0;

              const bottomHeightPercent = Math.min(
                100,
                Math.max(item.bottomValue > 0 ? 4 : 0, (item.bottomValue / effectiveMax) * 100)
              );
              const topHeightPercent = Math.min(
                100,
                Math.max(item.topValue > 0 ? 4 : 0, (item.topValue / effectiveMax) * 100)
              );

              return (
                <div
                  key={`${item.month}-${idx}`}
                  className="flex-1 flex flex-col items-center h-full justify-end group cursor-pointer relative"
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setHoveredItem({
                      item,
                      x: rect.left + rect.width / 2,
                      y: rect.top,
                    });
                  }}
                  onMouseLeave={() => setHoveredItem(null)}
                >
                  {/* The Stacked Bar Column */}
                  <div className="w-full max-w-[44px] sm:max-w-[52px] flex flex-col items-center justify-end h-full relative transition-transform duration-150 group-hover:scale-y-[1.02] origin-bottom">
                    {/* Censored / No Data State Bar */}
                    {isZero ? (
                      <div
                        className="w-full h-28 rounded-[14px] border border-dashed border-gray-300/80 flex flex-col items-center justify-center relative overflow-hidden transition-all duration-200 group-hover:border-gray-400 shadow-2xs"
                        style={{
                          background: "repeating-linear-gradient(45deg, #F9FAFB, #F9FAFB 6px, #ECEFF1 6px, #ECEFF1 12px)",
                        }}
                        title={`${item.month}: No Data (Belum ada transaksi)`}
                      >
                        <span className="text-[9px] font-extrabold text-gray-400/90 tracking-tighter uppercase select-none rotate-[-90deg] sm:rotate-0">
                          No Data
                        </span>
                      </div>
                    ) : (
                      <>
                        {/* Top Layer Bar (Lime Green) */}
                        {(hasBoth || hasOnlyTop) && (
                          <div
                            className={cn(
                              "w-full transition-all duration-300 shadow-2xs group-hover:brightness-105",
                              hasBoth ? "rounded-t-[14px] rounded-b-[4px] mb-[3px]" : "rounded-[14px]"
                            )}
                            style={{
                              height: `${topHeightPercent}%`,
                              backgroundColor: secondaryColor,
                            }}
                          />
                        )}

                        {/* Bottom Layer Bar (Olive Green) */}
                        {(hasBoth || hasOnlyBottom) && (
                          <div
                            className={cn(
                              "w-full transition-all duration-300 shadow-2xs group-hover:brightness-105",
                              hasBoth ? "rounded-b-[14px] rounded-t-[4px]" : "rounded-[14px]"
                            )}
                            style={{
                              height: `${bottomHeightPercent}%`,
                              backgroundColor: primaryColor,
                            }}
                          />
                        )}
                      </>
                    )}
                  </div>

                  {/* X-Axis Month Label */}
                  <span className={cn(
                    "absolute -bottom-6 text-xs font-semibold transition-colors",
                    isZero ? "text-[#9CA3AF] group-hover:text-[#4A5D4E]" : "text-[#4A5D4E] group-hover:text-[#275433] group-hover:font-bold"
                  )}>
                    {item.month}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Interactive Horizontal Range Slider / Navigator ── */}
      <div className="w-full pt-4 mt-2 flex flex-col items-center gap-1.5">
        <div
          ref={sliderTrackRef}
          onClick={handleSliderClick}
          className="w-full max-w-[85%] h-2 bg-[#D1D5DB] rounded-full cursor-pointer relative overflow-hidden"
          title="Geser rentang bulan"
        >
          {/* Active Highlight Bar */}
          <div
            onMouseDown={handleMouseDown}
            className="absolute top-0 bottom-0 bg-[#4E751D] rounded-full transition-all duration-150 cursor-grab active:cursor-grabbing hover:bg-[#3E6B17]"
            style={{
              width: `${sliderWidthPercent}%`,
              left: `${sliderLeftPercent}%`,
            }}
          />
        </div>
      </div>

      {/* Floating Tooltip Detail on Hover */}
      {hoveredItem && (
        <div
          className="fixed z-50 bg-[#0E341F] text-white text-xs px-3.5 py-2.5 rounded-xl shadow-xl pointer-events-none transform -translate-x-1/2 -translate-y-full -mt-2 flex flex-col gap-1 min-w-[190px]"
          style={{
            left: hoveredItem.x,
            top: hoveredItem.y,
          }}
        >
          {hoveredItem.item.bottomValue <= 0 && hoveredItem.item.topValue <= 0 ? (
            <>
              <div className="flex items-center justify-between border-b border-white/20 pb-1 font-bold text-gray-200">
                <span>Bulan {hoveredItem.item.month}</span>
                <span className="text-amber-300 font-semibold text-[10px] px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-500/40">
                  No Data
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 text-[11px] pt-1">
                <span className="text-gray-300">Realisasi Kas:</span>
                <span className="font-semibold text-gray-400">Rp 0</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-[11px]">
                <span className="text-gray-300">WIP/Proyeksi:</span>
                <span className="font-semibold text-gray-400">Rp 0</span>
              </div>
              <p className="text-[10px] text-gray-400 mt-1 border-t border-white/10 pt-1 italic">
                Belum ada transaksi riil tercatat pada bulan ini.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-white/20 pb-1 font-bold text-[#BBF7D0]">
                <span>Bulan {hoveredItem.item.month}</span>
                <span>
                  Total: {formatValueDisplay(hoveredItem.item.bottomValue + hoveredItem.item.topValue)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 text-[11px] pt-0.5">
                <span className="flex items-center gap-1 text-[#E5E9E2]">
                  <span className="w-2 h-2 rounded-full bg-[#4E751D]" />
                  {primaryLabel}:
                </span>
                <span className="font-semibold">{formatValueDisplay(hoveredItem.item.bottomValue)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-[11px]">
                <span className="flex items-center gap-1 text-[#E5E9E2]">
                  <span className="w-2 h-2 rounded-full bg-[#B5D96C]" />
                  {secondaryLabel}:
                </span>
                <span className="font-semibold">{formatValueDisplay(hoveredItem.item.topValue)}</span>
              </div>
              {hoveredItem.item.notes && (
                <p className="text-[10px] text-gray-300 mt-1 border-t border-white/10 pt-1 italic">
                  {hoveredItem.item.notes}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default MonthlyStackedBarChart;
