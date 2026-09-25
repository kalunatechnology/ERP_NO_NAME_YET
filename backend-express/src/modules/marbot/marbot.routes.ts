import { randomUUID } from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { Prisma, RoleCode } from '@prisma/client';
import prisma from '../../config/database';
import { authenticate } from '../../middlewares/auth.middleware';
import { resolveTenant } from '../../middlewares/tenant.middleware';
import { AppError, ForbiddenError, UnauthorizedError, ValidationError } from '../../utils/errors';
import {
  canonicalJson,
  matchesHmac,
  signRuntimeContext,
  toolSignaturePayload,
} from './marbot-signature.service';
import { resolveMarbotTenantConfig } from './marbot.config';
import {
  buildMarbotRuntimeAuthority,
  mapRoleForChatbot,
  normalizeProjectScope,
  toolModules,
  toolPermissions,
  toolQueryKeys,
} from './marbot-access.service';
import { MarbotToolScope } from './marbot.types';
import { buildMarbotRuntimeContextV2 } from './marbot-runtime.service';
import { env } from '../../config/env';

// Re-export services for backwards compatibility with tests and callers
export { canonicalJson, toolSignaturePayload, matchesHmac, resolveMarbotTenantConfig };

/**
 * Validates HMAC signature, replay nonce, tenant claims, and RBAC permissions for outbound chatbot tool requests.
 */
async function verifyToolRequest(req: Request, toolName: string): Promise<MarbotToolScope> {
  if (
    Object.entries(req.query).some(
      ([key, value]) => !toolQueryKeys[toolName]?.includes(key) || typeof value !== 'string',
    )
  ) {
    throw new UnauthorizedError();
  }

  const tenantClaim = String(req.header('X-Tenant-Id') || '');
  const userId = String(req.header('X-User-Id') || '');
  const nonce = String(req.header('X-Nonce') || '');
  const timestamp = Number(req.header('X-Timestamp'));
  const requestId = String(req.header('X-Request-Id') || '');
  const companyClaim = String(req.header('X-Company-Id') || '');
  const roles = String(req.header('X-User-Roles') || '').split(',').map((role) => role.trim()).filter(Boolean).sort();
  const claimedPermissions = [...new Set(
    String(req.header('X-User-Permissions') || '').split(',').map((value) => value.trim()).filter(Boolean),
  )].sort();
  let claimedProjectScope;
  try {
    claimedProjectScope = normalizeProjectScope(JSON.parse(String(req.header('X-Project-Scope') || '')));
  } catch {
    throw new UnauthorizedError();
  }
  const signature = String(req.header('X-Chatbot-Signature') || '');

  const tenant = await prisma.core_tenant.findFirst({
    where: { code: tenantClaim, status: 'ACTIVE' },
    select: { id: true },
  });

  if (
    !tenant ||
    !userId ||
    !nonce ||
    !requestId ||
    !companyClaim ||
    !claimedPermissions.length ||
    roles.length !== 1 ||
    !Number.isInteger(timestamp) ||
    Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300 ||
    req.header('X-Tool-Name') !== toolName
  ) {
    throw new UnauthorizedError();
  }

  const config = await resolveMarbotTenantConfig(tenant.id);
  if (
    config.externalTenantId !== tenantClaim ||
    !matchesHmac(toolSignaturePayload(req, toolName, config), signature, config.outboundToolSecret)
  ) {
    throw new UnauthorizedError();
  }

  const membership = await prisma.iam_user_company_membership.findUnique({
    where: { user_id: userId },
  });
  if (
    !membership || membership.status !== 'ACTIVE' || membership.tenant_id !== tenant.id ||
    membership.company_id !== companyClaim
  ) {
    throw new ForbiddenError();
  }
  const companyId = companyClaim;

  // Atomic unique insert blocks replay across instances. Denials after signature verification are also recorded.
  await prisma.marbot_request.create({
    data: {
      nonce,
      tenant_id: tenant.id,
      company_id: companyId,
      user_id: userId,
      tool_name: toolName,
      request_id: requestId,
      outcome: 'VERIFIED',
    },
  }).catch(() => {
    throw new UnauthorizedError();
  });

  try {
    const authority = await buildMarbotRuntimeAuthority(userId, tenant.id, companyId);
    if (
      !authority.enabledModules.includes(toolModules[toolName]) ||
      mapRoleForChatbot(authority.roleCode, config) !== roles[0]
    ) {
      throw new ForbiddenError();
    }
    const currentPermissions = new Set(authority.permissions);
    const acceptedToolPermissions = toolPermissions[toolName] || [];
    if (
      !acceptedToolPermissions.some((permission) => claimedPermissions.includes(permission)) ||
      claimedPermissions.some((permission) => !currentPermissions.has(permission))
    ) throw new ForbiddenError();
    if (authority.projectScope.mode === 'LIST') {
      if (claimedProjectScope.mode === 'ALL') throw new ForbiddenError();
      const allowedProjects = new Set(authority.projectScope.projectIds);
      if (claimedProjectScope.projectIds.some((projectId) => !allowedProjects.has(projectId))) {
        throw new ForbiddenError();
      }
    }
    await prisma.marbot_request.update({
      where: { nonce },
      data: { outcome: 'ALLOWED' },
    });
    return {
      tenantId: tenant.id,
      companyId,
      userId,
      role: authority.roleCode,
      permissions: claimedPermissions,
      projectScope: claimedProjectScope,
    };
  } catch (error) {
    await prisma.marbot_request.update({
      where: { nonce },
      data: { outcome: 'DENIED' },
    }).catch(() => undefined);
    throw error;
  }
}

export const marbotInternalRouter = Router();

marbotInternalRouter.get('/projects/summary', async (req, res, next) => {
  try {
    const scope = await verifyToolRequest(req, 'project.summary');
    const ids = scope.projectScope.mode === 'LIST' ? scope.projectScope.projectIds : null;
    const projectId = String(req.query.projectId || '');
    if (!projectId) throw new ValidationError('projectId wajib diisi.');
    if (ids && !ids.includes(projectId)) throw new ForbiddenError();

    const row = await prisma.project_project.findFirst({
      where: {
        id: projectId,
        tenant_id: scope.tenantId,
        company_id: scope.companyId,
      },
      select: {
        id: true,
        project_name: true,
        status: true,
        progress_percent: true,
        planned_end_date: true,
        customer_name: true,
        ...(scope.permissions.some((permission) =>
          ['READ_PROJECT_FINANCE', 'READ_COMPANY_FINANCE', 'READ_FINANCE_SUMMARY'].includes(permission))
          ? { budget_amount: true }
          : {}),
      },
    });
    if (!row) throw new ForbiddenError();

    res.json({
      data: {
        id: row.id,
        projectId: row.id,
        name: row.project_name,
        status: row.status,
        progressPercent: row.progress_percent,
        deadline: row.planned_end_date,
        clientName: row.customer_name,
        ...('budget_amount' in row ? { budget: row.budget_amount } : {}),
      },
    });
  } catch (error) {
    next(error);
  }
});

marbotInternalRouter.get('/projects/tasks', async (req, res, next) => {
  try {
    const scope = await verifyToolRequest(req, 'project.task_overview');
    const ids = scope.projectScope.mode === 'LIST' ? scope.projectScope.projectIds : null;
    const employee = await prisma.master_employee.findFirst({
      where: { tenant_id: scope.tenantId, company_id: scope.companyId, user_id: scope.userId },
      select: { id: true },
    });
    const selfRole = new Set<RoleCode>([RoleCode.STAFF, RoleCode.SUPERVISOR]).has(scope.role);
    const projectId = req.query.projectId ? String(req.query.projectId) : null;
    if (projectId && ids && !ids.includes(projectId)) throw new ForbiddenError();

    const status = String(req.query.status || 'ALL');
    if (!['ALL', 'OPEN', 'IN_PROGRESS', 'DONE'].includes(status)) {
      throw new ValidationError('Status tidak valid.');
    }

    const where: Prisma.project_taskWhereInput = {
      tenant_id: scope.tenantId,
      company_id: scope.companyId,
      ...(ids
        ? { project_id: { in: projectId ? [projectId] : ids } }
        : projectId
          ? { project_id: projectId }
          : {}),
      ...(selfRole
        ? { assigned_to_id: { in: [scope.userId, employee?.id].filter((id): id is string => Boolean(id)) } }
        : {}),
      ...(status !== 'ALL' ? { status } : {}),
    };

    const [totalTasks, openTasks, inProgressTasks, overdueTasks] = await Promise.all([
      prisma.project_task.count({ where }),
      prisma.project_task.count({ where: { ...where, status: 'OPEN' } }),
      prisma.project_task.count({ where: { ...where, status: 'IN_PROGRESS' } }),
      prisma.project_task.count({
        where: { ...where, status: { not: 'DONE' }, planned_end_at: { lt: new Date() } },
      }),
    ]);

    res.json({
      data: {
        totalTasks,
        openTasks,
        inProgressTasks,
        overdueTasks,
      },
    });
  } catch (error) {
    next(error);
  }
});

marbotInternalRouter.get('/finance/expenses', async (req, res, next) => {
  try {
    const scope = await verifyToolRequest(req, 'finance.expense_summary');
    const period = String(req.query.period || new Date().toISOString().slice(0, 7));
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      throw new ValidationError('Periode tidak valid.');
    }

    const start = new Date(`${period}-01T00:00:00.000Z`);
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));

    const [result, company] = await Promise.all([
      prisma.fin_project_cost_entry.aggregate({
        where: {
          tenant_id: scope.tenantId,
          company_id: scope.companyId,
          ...(scope.projectScope.mode === 'LIST' ? { project_id: { in: scope.projectScope.projectIds } } : {}),
          transaction_date: { gte: start, lt: end },
          status: 'POSTED',
        },
        _sum: { total_cost: true },
      }),
      prisma.core_company.findUnique({
        where: { id: scope.companyId },
        select: { base_currency_id: true },
      }),
    ]);

    const currency = company?.base_currency_id
      ? await prisma.master_currency.findUnique({
          where: { id: company.base_currency_id },
          select: { currency_code: true },
        })
      : null;

    res.json({
      data: {
        period,
        totalExpense: result._sum.total_cost || 0,
        currency: currency?.currency_code || null,
        status: 'PROJECT_COST_ONLY',
      },
    });
  } catch (error) {
    next(error);
  }
});

marbotInternalRouter.get('/crm/tickets', async (req, res, next) => {
  try {
    const scope = await verifyToolRequest(req, 'crm.open_tickets');
    if (!new Set<RoleCode>([RoleCode.DIRECTOR, RoleCode.CRM_LEAD, RoleCode.SALES]).has(scope.role)) {
      throw new ForbiddenError();
    }

    const where: Prisma.service_caseWhereInput = {
      tenant_id: scope.tenantId,
      company_id: scope.companyId,
      ...(scope.role === RoleCode.SALES ? { assigned_user_id: scope.userId } : {}),
      ...(req.query.customerId ? { customer_party_id: String(req.query.customerId) } : {}),
      status: { notIn: ['CLOSED', 'RESOLVED'] },
      ...(req.query.priority && req.query.priority !== 'ALL' ? { priority: String(req.query.priority) } : {}),
    };

    if (
      req.query.priority &&
      !['ALL', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(String(req.query.priority))
    ) {
      throw new ValidationError('Prioritas tidak valid.');
    }

    const [tickets, ticketCount, urgentCount] = await Promise.all([
      prisma.service_case.findMany({
        where,
        select: { id: true, subject: true, priority: true },
        take: 5,
        orderBy: { created_at: 'desc' },
      }),
      prisma.service_case.count({ where }),
      prisma.service_case.count({ where: { ...where, priority: 'URGENT' } }),
    ]);

    res.json({
      data: {
        ticketCount,
        urgentCount,
        recentTickets: tickets.map((t) => ({ id: t.id, title: t.subject, priority: t.priority })),
      },
    });
  } catch (error) {
    next(error);
  }
});

export const marbotUserRouter = Router();
marbotUserRouter.use(authenticate, resolveTenant);

marbotUserRouter.get('/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.tenant_id || !req.companyId) throw new ForbiddenError();
    const config = await resolveMarbotTenantConfig(req.user.tenant_id);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    try {
      const [healthResult, capabilitiesResult] = await Promise.allSettled([
        fetch(new URL('/health', config.chatbotUrl), {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
        }),
        fetch(new URL('/.well-known/marbot-capabilities', config.chatbotUrl), {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
        }),
      ]);

      const health = healthResult.status === 'fulfilled' ? healthResult.value : null;
      const capabilitiesResponse = capabilitiesResult.status === 'fulfilled'
        ? capabilitiesResult.value
        : null;
      let capabilities: any = null;
      if (capabilitiesResponse?.ok) {
        capabilities = await capabilitiesResponse.json().catch(() => null);
      }

      const preferredVersion = capabilities?.preferredVersion
        ?? capabilities?.contract?.preferredVersion
        ?? capabilities?.runtimeContext?.preferredVersion
        ?? null;
      const acceptedVersionCandidate = capabilities?.acceptedVersions
        ?? capabilities?.acceptedContextVersions
        ?? capabilities?.contract?.acceptedVersions
        ?? capabilities?.runtimeContext?.acceptedVersions;
      const acceptedVersions = Array.isArray(acceptedVersionCandidate)
        ? acceptedVersionCandidate
        : [];

      res.json({
        data: {
          online: Boolean(health?.ok),
          contractMode: env.CHATBOT_CONTRACT_MODE,
          preferredVersion,
          v2Supported: acceptedVersions.includes(2),
        },
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    next(error);
  }
});

marbotUserRouter.post('/chat/completions', async (req: Request, res: Response, next: NextFunction) => {
  let auditNonce: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    if (!req.user?.tenant_id || !req.companyId) throw new ForbiddenError();
    const config = await resolveMarbotTenantConfig(req.user.tenant_id);
    const message = req.body?.message;
    const conversationId = req.body?.conversationId;

    if (
      typeof message !== 'string' ||
      !message.trim() ||
      message.length > 4000 ||
      (conversationId !== undefined && (typeof conversationId !== 'string' || conversationId.length > 128))
    ) {
      throw new ValidationError('Pesan atau conversationId tidak valid.');
    }

    const context = await buildMarbotRuntimeContextV2(
      req.user.id, req.user.tenant_id, req.companyId, config,
    );
    const useContractV2 = env.CHATBOT_CONTRACT_MODE === 'v2';
    const signature = useContractV2
      ? signRuntimeContext(context, config.inboundContextSecret)
      : null;

    await prisma.marbot_request.create({
      data: {
        nonce: context.jti,
        tenant_id: req.user.tenant_id,
        company_id: req.companyId,
        user_id: req.user.id,
        tool_name: 'chat.completions',
        request_id: req.requestId || randomUUID(),
        outcome: 'FORWARDED',
      },
    });
    auditNonce = context.jti;

    const url = new URL('/api/v1/chat/completions', config.chatbotUrl);
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), 60000);
    res.on('close', () => controller.abort());

    let upstream: globalThis.Response;
    try {
      const upstreamHeaders: Record<string, string> = {
        Authorization: `Bearer ${config.chatbotApiKey}`,
        'Content-Type': 'application/json',
        'X-External-User-Id': req.user.id,
        'X-Request-Id': req.requestId || context.jti,
      };
      if (signature) upstreamHeaders['X-Context-Signature'] = signature;
      upstream = await fetch(url, {
        method: 'POST',
        redirect: 'manual',
        signal: controller.signal,
        headers: upstreamHeaders,
        body: JSON.stringify(useContractV2
          ? { message, conversationId, context }
          : { message, conversationId }),
      });
    } catch {
      throw new AppError('Layanan MarBot tidak dapat dihubungi.', 502, 'MARBOT_NETWORK_ERROR');
    }

    if (upstream.status === 401) {
      throw new AppError(
        'Autentikasi integrasi MarBot gagal. Periksa tenant API key dan signed context.',
        502,
        'MARBOT_UPSTREAM_AUTH',
      );
    }
    if (upstream.status === 403) throw new ForbiddenError('Akses MarBot ditolak untuk sesi ini.');
    if (upstream.status === 429) {
      throw new AppError('Kapasitas MarBot sedang penuh. Coba lagi nanti.', 503, 'MARBOT_RATE_LIMIT');
    }
    if (!upstream.ok || !upstream.body) {
      throw new AppError('Layanan MarBot tidak tersedia.', 502, 'MARBOT_UPSTREAM_UNAVAILABLE');
    }

    res.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    });

    for await (const chunk of upstream.body) res.write(chunk);

    clearTimeout(timer);
    timer = null;
    await prisma.marbot_request.update({
      where: { nonce: context.jti },
      data: { outcome: 'STREAMED' },
    });
    res.end();
  } catch (error) {
    if (timer) clearTimeout(timer);
    if (auditNonce) {
      await prisma.marbot_request.update({
        where: { nonce: auditNonce },
        data: { outcome: 'FAILED' },
      }).catch(() => undefined);
    }
    if (!res.headersSent) next(error);
    else res.end();
  }
});
