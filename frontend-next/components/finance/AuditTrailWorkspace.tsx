/**
 * File: frontend-next/components/finance/AuditTrailWorkspace.tsx
 *
 * Purpose: Defines the React component and its user-facing responsibility in the Marka+/Arsalynk frontend.
 * Integration: Called by Next routing or parent components; API and browser-state effects are documented on the responsible functions below.
 * Boundary: This file owns presentation/orchestration only and relies on shared context/API modules for identity and persistence.
 */
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api/axios';
import { getUserFacingApiError } from '@/lib/api/error-message';

// =============================================================================
// AUDIT TRAIL WORKSPACE
// Fitur: Visual log audit, Filter, Field-level JSON Diff Viewer
// =============================================================================

interface AuditEvent {
  id: string;
  entity_name: string;
  entity_id: string | null;
  event_type: string;
  before_data: Record<string, unknown>;
  after_data: Record<string, unknown>;
  user_id: string | null;
  company_id: string | null;
  occurred_at: string | null;
}

const actionColor = (a: string) => {
  const m: Record<string, string> = {
    PERIOD_CLOSE:      'bg-blue-100 text-blue-700',
    YEAR_END_CLOSING:  'bg-purple-100 text-purple-700',
    YEAR_END_REOPEN:   'bg-orange-100 text-orange-700',
    DEPRECIATION_RUN:  'bg-yellow-100 text-yellow-700',
    ASSET_DISPOSED:    'bg-red-100 text-red-700',
    REVERSAL:          'bg-red-100 text-red-700',
    UPDATE:            'bg-gray-100 text-gray-600',
    CREATE:            'bg-brand-light-green text-brand-deep-green',
  };
  return m[a] ?? 'bg-gray-100 text-gray-600';
};

function DiffViewer({ before, after }: { before: Record<string, unknown>; after: Record<string, unknown> }) {
  const allKeys = Array.from(new Set([
    ...Object.keys(before).filter(k => k !== '_description'),
    ...Object.keys(after).filter(k => k !== '_description'),
  ]));

  if (allKeys.length === 0) {
    return <span className="text-sm text-text-secondary italic">Tidak ada perubahan field terdeteksi.</span>;
  }

  return (
    <div className="space-y-1">
      {allKeys.map(key => (
        <div key={key} className="flex gap-2 text-sm font-mono">
          <span className="text-text-secondary min-w-[120px] shrink-0">{key}:</span>
          <span className="text-red-400 line-through opacity-70 truncate max-w-[180px]" title={String(before[key] ?? '—')}>
            {JSON.stringify(before[key] ?? null)}
          </span>
          <span className="text-text-secondary">→</span>
          <span className="text-brand-primary-soft truncate max-w-[180px]" title={String(after[key] ?? '—')}>
            {JSON.stringify(after[key] ?? null)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function AuditTrailWorkspace({ startDate, endDate }: { startDate?: string; endDate?: string }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [filterEntity, setFilterEntity] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: '25',
        ...(filterEntity ? { entity: filterEntity } : {}),
        ...(filterAction ? { action: filterAction } : {}),
        ...(filterUser   ? { user_id: filterUser } : {}),
        ...(filterFrom || startDate ? { from_date: filterFrom || startDate || "" } : {}),
        ...(filterTo || endDate ? { to_date: filterTo || endDate || "" } : {}),
      });
      const { data: json } = await api.get(`/api/v1/finance/audit-trail?${params}`);
      setEvents(json.data?.rows ?? []);
      setTotal(json.data?.total ?? 0);
      setLoadError(null);
    } catch (error) {
      setLoadError(getUserFacingApiError(error, 'Riwayat audit belum dapat dimuat. Periksa akses, lalu coba lagi.'));
    } finally {
      setLoading(false);
    }
  }, [page, filterEntity, filterAction, filterUser, filterFrom, filterTo, startDate, endDate]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const totalPages = Math.ceil(total / 25);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="page-title">Audit Trail & Governance Log</h2>
        <p className="text-sm text-text-secondary mt-1 leading-6">
          Field-level delta logger · Before/After diff viewer · SoD maker-checker signature
        </p>
      </div>

      {loadError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{loadError}</div>}

      {/* Stats */}
      <div className="flex gap-3 items-center text-sm text-text-secondary">
        <span className="font-semibold text-brand-green">{total.toLocaleString('id-ID')}</span> total event audit tercatat
        <span className="ml-auto text-sm">Halaman {page} / {totalPages || 1}</span>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {[
          { placeholder: 'Filter Entity (mis: fin_fiscal_year)', val: filterEntity, set: setFilterEntity },
          { placeholder: 'Filter Aksi (mis: YEAR_END_CLOSING)', val: filterAction, set: setFilterAction },
          { placeholder: 'Filter User ID', val: filterUser, set: setFilterUser },
        ].map((f, i) => (
          <input key={i} type="text" value={f.val} onChange={e => { f.set(e.target.value); setPage(1); }}
            placeholder={f.placeholder}
            className="col-span-1 px-3 py-2 text-sm rounded-lg border border-white/10 bg-white/5 text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-green/40 placeholder:text-text-secondary/70" />
        ))}
        <input type="date" value={filterFrom} onChange={e => { setFilterFrom(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm rounded-lg border border-white/10 bg-white/5 text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-green/40" />
        <input type="date" value={filterTo} onChange={e => { setFilterTo(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm rounded-lg border border-white/10 bg-white/5 text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-green/40" />
      </div>

      {/* Events */}
      {loading ? (
        <div className="text-center py-12 text-text-secondary text-sm animate-pulse">Memuat audit trail...</div>
      ) : events.length === 0 ? (
        <div className="text-center py-12 text-text-secondary text-sm">Belum ada audit event tercatat.</div>
      ) : (
        <div className="space-y-2">
          {events.map(event => {
            const isExpanded = expandedId === event.id;
            const description = (event.after_data?._description as string) ?? null;
            return (
              <div
                key={event.id}
                className="bg-white/5 rounded-xl border border-white/10 overflow-hidden transition-all"
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : event.id)}
                  className="w-full flex items-start gap-3 p-4 text-left hover:bg-white/5 transition-colors"
                >
                  {/* Timeline Dot */}
                  <div className="mt-1 shrink-0 w-2 h-2 rounded-full bg-brand-green/70" />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2.5 py-1 rounded-full text-sm font-semibold ${actionColor(event.event_type)}`}>
                        {event.event_type}
                      </span>
                      <span className="text-sm font-mono text-text-secondary">{event.entity_name}</span>
                      {event.entity_id && (
                        <span className="text-xs font-mono text-text-secondary/70">{event.entity_id.slice(0, 8)}...</span>
                      )}
                    </div>
                    {description && (
                      <p className="text-sm text-text-secondary mt-1 truncate">{description}</p>
                    )}
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-sm text-text-secondary">
                      {event.occurred_at ? new Date(event.occurred_at).toLocaleString('id-ID', {
                        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                      }) : '—'}
                    </p>
                    {event.user_id && (
                      <p className="text-xs font-mono text-text-secondary/70 mt-0.5">{event.user_id.slice(0, 8)}...</p>
                    )}
                    <span className="text-sm font-medium text-brand-green mt-1 block">{isExpanded ? '▲ Sembunyikan' : '▼ Lihat Diff'}</span>
                  </div>
                </button>

                {/* Expanded: JSON Diff Viewer */}
                {isExpanded && (
                  <div className="border-t border-white/10 px-6 py-4 bg-black/20">
                    <p className="text-sm font-bold text-text-secondary mb-2">Perubahan field (sebelum → sesudah)</p>
                    <DiffViewer before={event.before_data ?? {}} after={event.after_data ?? {}} />
                    <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-semibold text-text-secondary mb-1">Before State:</p>
                        <pre className="text-[13px] font-mono text-red-300/80 bg-red-500/5 rounded p-2 overflow-auto max-h-28">
                          {JSON.stringify(
                            Object.fromEntries(Object.entries(event.before_data ?? {}).filter(([k]) => k !== '_description')),
                            null, 2
                          )}
                        </pre>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-text-secondary mb-1">After State:</p>
                        <pre className="text-[13px] font-mono text-brand-primary-soft/80 bg-brand-light-green0/5 rounded p-2 overflow-auto max-h-28">
                          {JSON.stringify(
                            Object.fromEntries(Object.entries(event.after_data ?? {}).filter(([k]) => k !== '_description')),
                            null, 2
                          )}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 pt-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            className="px-3 py-2 text-sm rounded-lg bg-white/10 text-text-secondary hover:bg-white/15 disabled:opacity-40 transition-colors">
            ← Prev
          </button>
          <span className="px-3 py-2 text-sm text-text-secondary">
            {page} / {totalPages}
          </span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="px-3 py-2 text-sm rounded-lg bg-white/10 text-text-secondary hover:bg-white/15 disabled:opacity-40 transition-colors">
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
