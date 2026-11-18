/**
 * File: backend-express/src/modules/finance/inventory-gl-bridge.service.ts
 *
 * Purpose: Dual-Pipeline Outbox Consumer (Inventory -> Finance General Ledger & Budget Ledger).
 * Reads `inv_outbox_event` rows where `gl_status = 'PENDING'` (isolated from webhook `status`),
 * resolves accounts per product category (`inv_costing_policy` + `DEFAULT_COA`), posts balanced
 * `fin_journal_entry` & `fin_journal_line` rows, and triggers `BudgetingService.recordJournalActuals`
 * (or `BudgetingService.reverseJournalActuals` for reversals).
 */
import crypto from 'crypto';
import prisma from '../../config/database';
import { NotFoundError } from '../../utils/errors';
import { FinanceService } from './finance.service';
import { PeriodClosingService } from './period-closing.service';
import { BudgetingService } from './budgeting.service';

export interface BridgeJournalLineSpec {
  accountId: string;
  projectId?: string | null;
  productId?: string | null;
  warehouseId?: string | null;
  debit: number;
  credit: number;
  sourceLineId?: string | null;
}

export class InventoryGlBridgeService {
  static async loadPolicyResolver(companyId: string, postingDate: Date, tx: any) {
    const coaMap = await FinanceService.ensureStandardCOA(companyId, tx);
    const policies: any[] =
      (await tx.inv_costing_policy
        ?.findMany?.({
          where: {
            company_id: companyId,
            status: 'ACTIVE',
            effective_from: { lte: postingDate },
            OR: [{ effective_until: null }, { effective_until: { gte: postingDate } }],
          },
          orderBy: { created_at: 'desc' },
        })
        .catch(() => [])) ?? [];

    const defaultPolicy = policies.find((p: any) => !p.category_id) ?? null;

    return (categoryId?: string | null) => {
      const matched =
        (categoryId ? policies.find((p: any) => p.category_id === categoryId) : null) ??
        defaultPolicy;
      return {
        inventoryAccountId: matched?.inventory_gl_account_id ?? coaMap.get('1151')?.id,
        grIrAccountId: matched?.gr_ir_gl_account_id ?? coaMap.get('2131')?.id,
        cogsAccountId: matched?.cogs_gl_account_id ?? coaMap.get('5101')?.id,
        varianceAccountId: matched?.variance_gl_account_id ?? coaMap.get('5102')?.id,
        writeOffAccountId: matched?.write_off_gl_account_id ?? coaMap.get('6210')?.id,
        icArAccountId: coaMap.get('1135')?.id,
        icApAccountId: coaMap.get('2180')?.id,
      };
    };
  }

  static async loadProductCategoryMap(companyId: string, productIds: string[], tx: any): Promise<Map<string, string | null>> {
    const uniqueIds = Array.from(new Set(productIds.filter(Boolean)));
    if (!uniqueIds.length) return new Map();
    const products: any[] =
      (await tx.master_product
        ?.findMany?.({
          where: { company_id: companyId, id: { in: uniqueIds } },
          select: { id: true, category_id: true },
        })
        .catch(() => [])) ?? [];
    return new Map(products.map((p: any) => [String(p.id), p.category_id ?? null]));
  }

  static async buildJournalLinesForEvent(
    evt: any,
    payload: any,
    postingDate: Date,
    tx: any,
  ): Promise<{ lines: BridgeJournalLineSpec[]; reversalOfEntryId: string | null }> {
    const companyId = String(evt.company_id);
    const resolveAccounts = await this.loadPolicyResolver(companyId, postingDate, tx);
    const lines: BridgeJournalLineSpec[] = [];
    let reversalOfEntryId: string | null = null;

    const eventType = String(evt.event_type || '');
    const moveType = String(payload?.move_type || '').toUpperCase();

    if (eventType === 'inventory.stock.posted') {
      if (moveType === 'TRANSFER' || moveType === 'INTERNAL') {
        return { lines: [], reversalOfEntryId: null };
      }

      if (moveType === 'RECEIPT') {
        const moveLines = await tx.inv_stock_move_line.findMany({
          where: { stock_move_id: evt.aggregate_id, company_id: companyId },
        });
        const categoryMap = await this.loadProductCategoryMap(
          companyId,
          moveLines.map((ml: any) => String(ml.product_id || '')),
          tx,
        );
        const destLoc = payload?.destination_location_id
          ? await tx.master_warehouse_location.findFirst({
              where: { id: payload.destination_location_id },
              select: { warehouse_id: true },
            })
          : null;
        for (const ml of moveLines) {
          const val = Math.abs(Number(ml.total_value ?? 0));
          const accounts = resolveAccounts(ml.product_id ? categoryMap.get(String(ml.product_id)) : null);
          if (val <= 0 || !accounts.inventoryAccountId || !accounts.grIrAccountId) continue;
          lines.push({
            accountId: accounts.inventoryAccountId,
            productId: ml.product_id ?? null,
            warehouseId: destLoc?.warehouse_id ?? null,
            debit: val,
            credit: 0,
            sourceLineId: ml.id,
          });
          lines.push({
            accountId: accounts.grIrAccountId,
            productId: ml.product_id ?? null,
            debit: 0,
            credit: val,
            sourceLineId: ml.id,
          });
        }
        return { lines, reversalOfEntryId: null };
      }

      if (moveType === 'ISSUE' || moveType === 'RETAIL_POS') {
        const ledgers = await tx.inv_stock_ledger_entry.findMany({
          where: { source_document_id: evt.aggregate_id, company_id: companyId },
        });
        const categoryMap = await this.loadProductCategoryMap(
          companyId,
          ledgers.map((l: any) => String(l.product_id || '')),
          tx,
        );
        for (const led of ledgers) {
          if (Number(led.quantity_delta ?? 0) >= 0) continue;
          const val = Math.abs(Number(led.value_delta ?? 0));
          const accounts = resolveAccounts(led.product_id ? categoryMap.get(String(led.product_id)) : null);
          if (val <= 0 || !accounts.cogsAccountId || !accounts.inventoryAccountId) continue;
          const loc = led.warehouse_location_id
            ? await tx.master_warehouse_location.findFirst({
                where: { id: led.warehouse_location_id },
                select: { warehouse_id: true },
              })
            : null;
          lines.push({
            accountId: accounts.cogsAccountId,
            projectId: led.project_id ?? payload?.project_id ?? null,
            productId: led.product_id ?? null,
            debit: val,
            credit: 0,
            sourceLineId: led.source_line_id ?? led.id,
          });
          lines.push({
            accountId: accounts.inventoryAccountId,
            productId: led.product_id ?? null,
            warehouseId: loc?.warehouse_id ?? null,
            debit: 0,
            credit: val,
            sourceLineId: led.source_line_id ?? led.id,
          });
        }
        return { lines, reversalOfEntryId: null };
      }

      if (moveType === 'ADJUSTMENT') {
        const ledgers = await tx.inv_stock_ledger_entry.findMany({
          where: { source_document_id: evt.aggregate_id, company_id: companyId },
        });
        const categoryMap = await this.loadProductCategoryMap(
          companyId,
          ledgers.map((l: any) => String(l.product_id || '')),
          tx,
        );
        for (const led of ledgers) {
          const valDelta = Number(led.value_delta ?? 0);
          const absVal = Math.abs(valDelta);
          const accounts = resolveAccounts(led.product_id ? categoryMap.get(String(led.product_id)) : null);
          if (absVal <= 0 || !accounts.writeOffAccountId || !accounts.inventoryAccountId) continue;
          if (valDelta < 0) {
            lines.push({ accountId: accounts.writeOffAccountId, projectId: led.project_id ?? payload?.project_id ?? null, productId: led.product_id ?? null, debit: absVal, credit: 0, sourceLineId: led.id });
            lines.push({ accountId: accounts.inventoryAccountId, productId: led.product_id ?? null, debit: 0, credit: absVal, sourceLineId: led.id });
          } else {
            lines.push({ accountId: accounts.inventoryAccountId, productId: led.product_id ?? null, debit: absVal, credit: 0, sourceLineId: led.id });
            lines.push({ accountId: accounts.writeOffAccountId, projectId: led.project_id ?? payload?.project_id ?? null, productId: led.product_id ?? null, debit: 0, credit: absVal, sourceLineId: led.id });
          }
        }
        return { lines, reversalOfEntryId: null };
      }
    }

    if (eventType === 'inventory.valuation.ppv_recorded') {
      const catId = payload?.product_id
        ? (await this.loadProductCategoryMap(companyId, [String(payload.product_id)], tx)).get(String(payload.product_id))
        : null;
      const accounts = resolveAccounts(catId);
      const ppv = Number(payload?.ppv_amount ?? 0);
      if (Math.abs(ppv) > 0 && accounts.varianceAccountId && accounts.grIrAccountId) {
        if (ppv > 0) {
          lines.push({ accountId: accounts.varianceAccountId, productId: payload?.product_id ?? null, debit: ppv, credit: 0 });
          lines.push({ accountId: accounts.grIrAccountId, productId: payload?.product_id ?? null, debit: 0, credit: ppv });
        } else {
          lines.push({ accountId: accounts.grIrAccountId, productId: payload?.product_id ?? null, debit: Math.abs(ppv), credit: 0 });
          lines.push({ accountId: accounts.varianceAccountId, productId: payload?.product_id ?? null, debit: 0, credit: Math.abs(ppv) });
        }
      }
      return { lines, reversalOfEntryId: null };
    }

    if (eventType === 'inventory.stock.written_off') {
      const trfLines = await tx.inv_transfer_order_line.findMany({
        where: { transfer_order_id: evt.aggregate_id, company_id: companyId },
      });
      const categoryMap = await this.loadProductCategoryMap(
        companyId,
        trfLines.map((tl: any) => String(tl.product_id || '')),
        tx,
      );
      for (const tl of trfLines) {
        const val = Math.abs(Number(tl.written_off_quantity ?? 0) * Number(tl.unit_cost ?? 0));
        const accounts = resolveAccounts(tl.product_id ? categoryMap.get(String(tl.product_id)) : null);
        if (val <= 0 || !accounts.writeOffAccountId || !accounts.inventoryAccountId) continue;
        lines.push({ accountId: accounts.writeOffAccountId, projectId: payload?.project_id ?? null, productId: tl.product_id ?? null, debit: val, credit: 0, sourceLineId: tl.id });
        lines.push({ accountId: accounts.inventoryAccountId, productId: tl.product_id ?? null, debit: 0, credit: val, sourceLineId: tl.id });
      }
      return { lines, reversalOfEntryId: null };
    }

    if (eventType === 'inventory.stock.reversed' && payload?.original_move_id) {
      const origEntry = await tx.fin_journal_entry.findFirst({
        where: { company_id: companyId, source_document_id: payload.original_move_id, status: 'POSTED' },
      });
      if (origEntry) {
        reversalOfEntryId = origEntry.id;
        const origLines = await tx.fin_journal_line.findMany({ where: { journal_entry_id: origEntry.id } });
        for (const ol of origLines) {
          lines.push({
            accountId: ol.account_id,
            projectId: ol.project_id ?? null,
            productId: ol.product_id ?? null,
            warehouseId: ol.warehouse_id ?? null,
            debit: Number(ol.credit_base ?? 0),
            credit: Number(ol.debit_base ?? 0),
          });
        }
      }
      return { lines, reversalOfEntryId };
    }

    if (eventType === 'inventory.intercompany.dispatched') {
      const accounts = resolveAccounts(null);
      const amt = Math.abs(Number(payload?.total_amount ?? 0));
      if (amt > 0 && accounts.icArAccountId && accounts.inventoryAccountId) {
        lines.push({ accountId: accounts.icArAccountId, debit: amt, credit: 0 });
        lines.push({ accountId: accounts.inventoryAccountId, debit: 0, credit: amt });
      }
      return { lines, reversalOfEntryId: null };
    }

    if (eventType === 'inventory.intercompany.received') {
      const accounts = resolveAccounts(null);
      const amt = Math.abs(Number(payload?.total_amount ?? 0));
      if (amt > 0 && accounts.inventoryAccountId && accounts.icApAccountId) {
        lines.push({ accountId: accounts.inventoryAccountId, debit: amt, credit: 0 });
        lines.push({ accountId: accounts.icApAccountId, debit: 0, credit: amt });
      }
      return { lines, reversalOfEntryId: null };
    }

    if (eventType === 'inventory.valuation.pup_posted' && Array.isArray(payload?.items)) {
      const categoryMap = await this.loadProductCategoryMap(
        companyId,
        payload.items.map((it: any) => String(it.product_id || '')),
        tx,
      );
      for (const item of payload.items) {
        const accounts = resolveAccounts(item.product_id ? categoryMap.get(String(item.product_id)) : null);
        const cogsDelta = Number(item.cogs_revaluation_delta ?? 0);
        const endDelta = Number(item.ending_inventory_revaluation_delta ?? 0);
        if (Math.abs(cogsDelta) > 0.01 && accounts.cogsAccountId && accounts.varianceAccountId) {
          if (cogsDelta > 0) {
            lines.push({ accountId: accounts.cogsAccountId, productId: item.product_id ?? null, debit: cogsDelta, credit: 0 });
            lines.push({ accountId: accounts.varianceAccountId, productId: item.product_id ?? null, debit: 0, credit: cogsDelta });
          } else {
            lines.push({ accountId: accounts.varianceAccountId, productId: item.product_id ?? null, debit: Math.abs(cogsDelta), credit: 0 });
            lines.push({ accountId: accounts.cogsAccountId, productId: item.product_id ?? null, debit: 0, credit: Math.abs(cogsDelta) });
          }
        }
        if (Math.abs(endDelta) > 0.01 && accounts.inventoryAccountId && accounts.varianceAccountId) {
          if (endDelta > 0) {
            lines.push({ accountId: accounts.inventoryAccountId, productId: item.product_id ?? null, debit: endDelta, credit: 0 });
            lines.push({ accountId: accounts.varianceAccountId, productId: item.product_id ?? null, debit: 0, credit: endDelta });
          } else {
            lines.push({ accountId: accounts.varianceAccountId, productId: item.product_id ?? null, debit: Math.abs(endDelta), credit: 0 });
            lines.push({ accountId: accounts.inventoryAccountId, productId: item.product_id ?? null, debit: 0, credit: Math.abs(endDelta) });
          }
        }
      }
      return { lines, reversalOfEntryId: null };
    }

    return { lines, reversalOfEntryId: null };
  }

  static async processSingleOutboxEvent(
    eventId: string,
    companyId: string,
    userId: string,
  ): Promise<{ outcome: 'POSTED' | 'SKIPPED'; journalEntryId?: string }> {
    return prisma.$transaction(async (tx: any): Promise<{ outcome: 'POSTED' | 'SKIPPED'; journalEntryId?: string }> => {
      await tx.$queryRawUnsafe(
        `SELECT id FROM "inv_outbox_event" WHERE "id" = $1 AND "company_id" = $2 FOR UPDATE SKIP LOCKED`,
        eventId,
        companyId,
      ).catch(() => []);

      const locked = await tx.inv_outbox_event.findFirst({
        where: { id: eventId, company_id: companyId },
      });
      if (!locked) throw new NotFoundError('InventoryOutboxEvent');
      if (locked.gl_status === 'POSTED' || locked.gl_status === 'SKIPPED') {
        const outcome: 'POSTED' | 'SKIPPED' = locked.gl_status === 'POSTED' ? 'POSTED' : 'SKIPPED';
        return { outcome, journalEntryId: locked.gl_journal_entry_id ?? undefined };
      }

      const existingJournal = await tx.fin_journal_entry.findFirst({
        where: {
          company_id: companyId,
          source_document_id: locked.aggregate_id,
          document_id: locked.id,
        },
        select: { id: true },
      });
      if (existingJournal) {
        await tx.inv_outbox_event.update({
          where: { id: locked.id },
          data: { gl_status: 'POSTED', gl_journal_entry_id: existingJournal.id, gl_processed_at: new Date(), gl_error: null },
        });
        return { outcome: 'POSTED', journalEntryId: existingJournal.id };
      }

      const payload = JSON.parse(locked.payload_json || '{}');
      const postingDate = locked.created_at ? new Date(locked.created_at) : new Date();
      await PeriodClosingService.assertPeriodOpen(postingDate, companyId);

      const fiscalPeriod = await tx.fin_fiscal_period.findFirst({
        where: { company_id: companyId, start_date: { lte: postingDate }, end_date: { gte: postingDate } },
        select: { id: true },
      });
      const journalBook = await FinanceService.ensureJournal(companyId, 'INV', 'Inventory Valuation Journal', 'GENERAL', tx);

      const { lines: linesToPost, reversalOfEntryId } = await this.buildJournalLinesForEvent(locked, payload, postingDate, tx);
      if (!linesToPost.length) {
        await tx.inv_outbox_event.update({
          where: { id: locked.id },
          data: { gl_status: 'SKIPPED', gl_processed_at: new Date(), gl_error: 'Zero monetary impact or internal transfer' },
        });
        return { outcome: 'SKIPPED' };
      }

      const entryId = crypto.randomUUID();
      const entry = await tx.fin_journal_entry.create({
        data: {
          id: entryId,
          tenant_id: locked.tenant_id,
          company_id: companyId,
          created_by_id: userId,
          journal_id: journalBook.id,
          fiscal_period_id: fiscalPeriod?.id ?? null,
          entry_number: `JE-INV-${locked.id.slice(0, 8).toUpperCase()}`,
          posting_date: postingDate,
          description: `Auto GL [${locked.event_type}] ref ${locked.aggregate_id}`,
          source_document_id: locked.aggregate_id,
          document_id: locked.id,
          reversal_of_entry_id: reversalOfEntryId,
          status: 'DRAFT',
        },
      });

      const createdLines = [];
      for (const line of linesToPost) {
        const jl = await tx.fin_journal_line.create({
          data: {
            id: crypto.randomUUID(),
            tenant_id: locked.tenant_id,
            company_id: companyId,
            created_by_id: userId,
            journal_entry_id: entryId,
            account_id: line.accountId,
            project_id: line.projectId ?? null,
            product_id: line.productId ?? null,
            warehouse_id: line.warehouseId ?? null,
            debit_base: line.debit,
            credit_base: line.credit,
            transaction_amount: line.debit > 0 ? line.debit : line.credit,
            source_document_line_id: line.sourceLineId ?? null,
          },
        });
        createdLines.push(jl);
      }

      if (reversalOfEntryId) {
        await BudgetingService.reverseJournalActuals(tx, reversalOfEntryId, entry, userId);
      } else {
        await BudgetingService.recordJournalActuals(tx, { ...entry, posting_date: postingDate }, createdLines);
      }
      await tx.fin_journal_entry.update({ where: { id: entryId }, data: { status: 'POSTED' } });
      await tx.inv_outbox_event.update({
        where: { id: locked.id },
        data: { gl_status: 'POSTED', gl_journal_entry_id: entryId, gl_processed_at: new Date(), gl_error: null },
      });

      return { outcome: 'POSTED', journalEntryId: entryId };
    });
  }

  static async syncCompanyOutboxToGl(companyId: string, userId: string, limit = 50) {
    const pendingEvents = await (prisma as any).inv_outbox_event.findMany({
      where: { company_id: companyId, gl_status: 'PENDING' },
      orderBy: { created_at: 'asc' },
      take: limit,
    });

    const summary = { processed: 0, skipped: 0, failed: 0, journal_entry_ids: [] as string[] };
    for (const evt of pendingEvents) {
      try {
        const res = await this.processSingleOutboxEvent(evt.id, companyId, userId);
        if (res.outcome === 'SKIPPED') summary.skipped += 1;
        else {
          summary.processed += 1;
          if (res.journalEntryId) summary.journal_entry_ids.push(res.journalEntryId);
        }
      } catch (err: any) {
        await (prisma as any).inv_outbox_event.update({
          where: { id: evt.id },
          data: {
            gl_status: 'FAILED',
            attempt_count: { increment: 1 },
            gl_error: String(err?.message || 'Unknown GL Bridge error').slice(0, 500),
          },
        });
        summary.failed += 1;
      }
    }
    return summary;
  }

  static async retryOutboxEvent(eventId: string, companyId: string, userId: string) {
    const evt = await (prisma as any).inv_outbox_event.findFirst({
      where: { id: eventId, company_id: companyId },
    });
    if (!evt) throw new NotFoundError('InventoryOutboxEvent');
    await (prisma as any).inv_outbox_event.update({
      where: { id: evt.id },
      data: { gl_status: 'PENDING', gl_error: null },
    });
    return this.processSingleOutboxEvent(evt.id, companyId, userId);
  }

  static async getBridgeStatus(companyId: string) {
    const [grouped, recentEvents] = await Promise.all([
      (prisma as any).inv_outbox_event.groupBy({
        by: ['gl_status'],
        where: { company_id: companyId },
        _count: { _all: true },
      }),
      (prisma as any).inv_outbox_event.findMany({
        where: { company_id: companyId },
        orderBy: { created_at: 'desc' },
        take: 25,
      }),
    ]);

    const counts: Record<string, number> = { PENDING: 0, POSTED: 0, SKIPPED: 0, FAILED: 0 };
    for (const g of grouped || []) {
      counts[String(g.gl_status || 'PENDING')] = Number(g._count?._all ?? 0);
    }

    return { counts, recent_events: recentEvents };
  }
}
