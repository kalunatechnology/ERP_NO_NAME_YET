import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { Prisma, RoleCode } from '@prisma/client';
import prisma from '../../config/database';
import { authenticate } from '../../middlewares/auth.middleware';
import { resolveTenant } from '../../middlewares/tenant.middleware';
import { loadUserAccessContext } from '../accounts/access-context.service';
import { AppError, ForbiddenError, UnauthorizedError, ValidationError } from '../../utils/errors';

type TenantConfig = {
  externalTenantId: string;
  chatbotUrl: string;
  chatbotApiKey: string;
  inboundContextSecret: string;
  outboundToolSecret: string;
  roleMap?: Partial<Record<RoleCode, string>>;
};

const roleDefaults: Partial<Record<RoleCode, string>> = { DIRECTOR: 'EXECUTIVE' };
const toolModules: Record<string, string> = {
  'project.summary': 'PROJECTS',
  'project.task_overview': 'PROJECTS',
  'finance.expense_summary': 'FINANCE',
  'crm.open_tickets': 'CRM',
};
const toolPermissions: Record<string, string> = {
  'project.summary': 'READ_PROJECT',
  'project.task_overview': 'READ_TASK',
  'finance.expense_summary': 'READ_FINANCE_SUMMARY',
  'crm.open_tickets': 'READ_TICKET',
};
const toolQueryKeys: Record<string, string[]> = {
  'project.summary': ['projectId'],
  'project.task_overview': ['projectId', 'status'],
  'finance.expense_summary': ['period'],
  'crm.open_tickets': ['customerId', 'priority'],
};

function envTenantConfig(tenantId: string): TenantConfig | null {
  try {
    const map = JSON.parse(process.env.MARBOT_TENANT_CONFIG_JSON || '{}');
    const config = map[tenantId];
    if (!config?.externalTenantId || !config.chatbotUrl || !config.chatbotApiKey || !config.inboundContextSecret || !config.outboundToolSecret) {
      return null;
    }
    return config as TenantConfig;
  } catch {
    return null;
  }
}

/**
 * Resolves MarBot config for a tenant using a two-step fallback chain:
 *  1. Database: marbot_tenant_config (managed by Super Admin via dashboard)
 *  2. Legacy: MARBOT_TENANT_CONFIG_JSON environment variable (backward compat)
 *
 * Throws ForbiddenError if neither source has a valid config.
 */
async function resolveTenantConfig(tenantId: string): Promise<TenantConfig> {
  // Step 1: Try database
  const dbRow = await prisma.marbot_tenant_config.findUnique({
    where: { tenant_id: tenantId },
    select: {
      external_tenant_id: true,
      chatbot_url: true,
      chatbot_api_key: true,
      inbound_context_secret: true,
      outbound_tool_secret: true,
      role_map_json: true,
    },
  });

  if (dbRow) {
    let roleMap: Partial<Record<RoleCode, string>> | undefined;
    if (dbRow.role_map_json) {
      try { roleMap = JSON.parse(dbRow.role_map_json); } catch { /* ignore malformed JSON */ }
    }
    const config: TenantConfig = {
      externalTenantId: dbRow.external_tenant_id,
      chatbotUrl: dbRow.chatbot_url,
      chatbotApiKey: dbRow.chatbot_api_key,
      inboundContextSecret: dbRow.inbound_context_secret,
      outboundToolSecret: dbRow.outbound_tool_secret,
      roleMap,
    };
    // Validate URL
    try {
      const url = new URL(config.chatbotUrl);
      if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.hostname === 'localhost')) {
        throw new ForbiddenError('Endpoint MarBot dari database tidak aman (harus HTTPS).');
      }
    } catch (err) {
      if (err instanceof ForbiddenError) throw err;
      throw new ForbiddenError('Endpoint MarBot dari database tidak valid.');
    }
    return config;
  }

  // Step 2: Fallback to env var (backward compatibility for existing tenants)
  const envConfig = envTenantConfig(tenantId);
  if (envConfig) {
    const url = new URL(envConfig.chatbotUrl);
    if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.hostname === 'localhost')) {
      throw new ForbiddenError('Endpoint MarBot tidak aman.');
    }
    return envConfig;
  }

  throw new ForbiddenError('Integrasi MarBot belum dikonfigurasi untuk tenant ini.');
}

/** @deprecated Use resolveTenantConfig() (async) instead. Kept for synchronous callers that will be migrated. */
function tenantConfig(tenantId: string): TenantConfig {
  let map: Record<string, TenantConfig>;
  try {
    map = JSON.parse(process.env.MARBOT_TENANT_CONFIG_JSON || '{}');
  } catch {
    throw new ForbiddenError('Konfigurasi Marbot tidak valid.');
  }
  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    throw new ForbiddenError('Konfigurasi Marbot tidak valid.');
  }
  const config = map[tenantId];
  if (!config?.externalTenantId || !config.chatbotUrl || !config.chatbotApiKey || !config.inboundContextSecret || !config.outboundToolSecret) {
    throw new ForbiddenError('Integrasi Marbot belum dikonfigurasi untuk tenant ini.');
  }
  let url: URL;
  try { url = new URL(config.chatbotUrl); } catch {
    throw new ForbiddenError('Endpoint Marbot tidak valid.');
  }
  if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.hostname === 'localhost')) {
    throw new ForbiddenError('Endpoint Marbot tidak aman.');
  }
  return config;
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

function matchesHmac(payload: string, signature: string, secret: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(payload).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

function signedRole(role: RoleCode, config: TenantConfig): string {
  return config.roleMap?.[role] || roleDefaults[role] || role;
}

async function checkedUser(userId: string, companyId: string, tenantId: string) {
  const user = await prisma.iam_user.findFirst({
    where: { id: userId, tenant_id: tenantId, is_active: true },
    select: { id: true, tenant_id: true, active_role_id: true },
  });
  if (!user) throw new ForbiddenError();
  const access = await loadUserAccessContext(userId, user);
  if (access.isSuperAdmin || access.companyId !== companyId || !access.activeRoleCode) throw new ForbiddenError();
  const company = await prisma.core_company.findFirst({
    where: { id: companyId, tenant_id: tenantId, status: 'ACTIVE' }, select: { id: true },
  });
  if (!company || !access.enabledModules.includes('MARBOT')) throw new ForbiddenError();
  await requirePermission(access.activeRoleId!, tenantId, companyId, 'USE_MARBOT');
  return access;
}

async function requirePermission(roleId: string, tenantId: string, companyId: string, code: string) {
  if (!await hasPermission(roleId, tenantId, companyId, code)) throw new ForbiddenError();
}

async function hasPermission(roleId: string, tenantId: string, companyId: string, code: string): Promise<boolean> {
  const permission = await prisma.iam_permission.findUnique({ where: { permission_code: code }, select: { id: true } });
  if (!permission) return false;
  const grant = await prisma.iam_role_permission.findFirst({ where: {
    role_id: roleId, permission_id: permission.id, tenant_id: tenantId, company_id: companyId, allowed: true,
  }, select: { id: true } });
  return Boolean(grant);
}

async function checkedModule(userId: string, companyId: string, tenantId: string, module: string) {
  const access = await checkedUser(userId, companyId, tenantId);
  if (!access.enabledModules.includes(module)) throw new ForbiddenError();
  return access;
}

export function toolSignaturePayload(req: Request, toolName: string, config: TenantConfig): string {
  const timestamp = String(req.header('X-Timestamp') || '');
  const nonce = String(req.header('X-Nonce') || '');
  const requestId = String(req.header('X-Request-Id') || '');
  const userId = String(req.header('X-User-Id') || '');
  const roles = String(req.header('X-User-Roles') || '').split(',').map((r) => r.trim()).filter(Boolean).sort().join(',');
  const query = Object.keys(req.query).sort().map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(req.query[key]))}`).join('&');
  const pathAndQuery = req.baseUrl + req.path + (query ? `?${query}` : '');
  const bodyHash = createHash('sha256').update('').digest('hex');
  return ['GET', pathAndQuery, timestamp, nonce, bodyHash, config.externalTenantId, userId, roles, toolName, requestId].join('\n');
}

async function verifyToolRequest(req: Request, toolName: string) {
  if (Object.entries(req.query).some(([key, value]) => !toolQueryKeys[toolName]?.includes(key) || typeof value !== 'string')) {
    throw new UnauthorizedError();
  }
  const tenantClaim = String(req.header('X-Tenant-Id') || '');
  const userId = String(req.header('X-User-Id') || '');
  const nonce = String(req.header('X-Nonce') || '');
  const timestamp = Number(req.header('X-Timestamp'));
  const requestId = String(req.header('X-Request-Id') || '');
  const roles = String(req.header('X-User-Roles') || '').split(',').filter(Boolean);
  const signature = String(req.header('X-Chatbot-Signature') || '');
  const tenant = await prisma.core_tenant.findFirst({ where: { code: tenantClaim, status: 'ACTIVE' }, select: { id: true } });
  if (!tenant || !userId || !nonce || !requestId || roles.length !== 1 || !Number.isInteger(timestamp)
      || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300 || req.header('X-Tool-Name') !== toolName) {
    throw new UnauthorizedError();
  }
  const config = await resolveTenantConfig(tenant.id);
  if (config.externalTenantId !== tenantClaim || !matchesHmac(toolSignaturePayload(req, toolName, config), signature, config.outboundToolSecret)) {
    throw new UnauthorizedError();
  }
  const membership = await prisma.iam_user_company_membership.findUnique({ where: { user_id: userId } });
  if (!membership || membership.status !== 'ACTIVE' || membership.tenant_id !== tenant.id) throw new ForbiddenError();
  const companyId = membership.company_id;
  // Atomic unique insert blocks a replay across instances. Denials after signature verification are also recorded.
  await prisma.marbot_request.create({ data: {
    nonce, tenant_id: tenant.id, company_id: companyId, user_id: userId,
    tool_name: toolName, request_id: requestId, outcome: 'VERIFIED',
  } }).catch(() => { throw new UnauthorizedError(); });
  try {
    const access = await checkedModule(userId, companyId, tenant.id, toolModules[toolName]);
    if (signedRole(access.activeRoleCode!, config) !== roles[0]) throw new ForbiddenError();
    await requirePermission(access.activeRoleId!, tenant.id, companyId, toolPermissions[toolName]);
    await prisma.marbot_request.update({ where: { nonce }, data: { outcome: 'ALLOWED' } });
    return { tenantId: tenant.id, companyId, userId, role: access.activeRoleCode! };
  } catch (error) {
    await prisma.marbot_request.update({ where: { nonce }, data: { outcome: 'DENIED' } }).catch(() => undefined);
    throw error;
  }
}

async function visibleProjectIds(tenantId: string, companyId: string, userId: string, role: RoleCode): Promise<string[] | null> {
  if (new Set<RoleCode>([RoleCode.DIRECTOR, RoleCode.OPERATIONAL_MANAGER]).has(role)) return null;
  if (role === RoleCode.FINANCE) {
    const costs = await prisma.fin_project_cost_entry.findMany({
      where: { tenant_id: tenantId, company_id: companyId }, select: { project_id: true }, distinct: ['project_id'],
    });
    return costs.map((row) => row.project_id);
  }
  const now = new Date();
  const [managed, explicit, member] = await Promise.all([
    prisma.project_project.findMany({ where: { tenant_id: tenantId, company_id: companyId, project_manager_id: userId }, select: { id: true } }),
    prisma.iam_user_project_access.findMany({ where: {
      tenant_id: tenantId, company_id: companyId, user_id: userId,
      access_level: { notIn: ['DENY', 'NONE', 'REVOKED'] },
      AND: [{ OR: [{ valid_from: null }, { valid_from: { lte: now } }] }, { OR: [{ valid_to: null }, { valid_to: { gte: now } }] }],
    }, select: { project_id: true } }),
    prisma.project_member.findMany({ where: { tenant_id: tenantId, company_id: companyId, user_id: userId, status: 'ACTIVE' }, select: { project_id: true } }),
  ]);
  const all = [...managed.map((row) => row.id), ...explicit.map((row) => row.project_id), ...member.map((row) => row.project_id)];
  return [...new Set(all.filter((id): id is string => Boolean(id)))];
}

export const marbotInternalRouter = Router();

marbotInternalRouter.get('/projects/summary', async (req, res, next) => {
  try {
    const scope = await verifyToolRequest(req, 'project.summary');
    const ids = await visibleProjectIds(scope.tenantId, scope.companyId, scope.userId, scope.role);
    const projectId = String(req.query.projectId || '');
    if (!projectId) throw new ValidationError('projectId wajib diisi.');
    if (ids && !ids.includes(projectId)) throw new ForbiddenError();
    const row = await prisma.project_project.findFirst({ where: {
      id: projectId, tenant_id: scope.tenantId, company_id: scope.companyId,
    }, select: { id: true, project_name: true, status: true, progress_percent: true,
      planned_end_date: true, customer_name: true,
      ...(new Set<RoleCode>([RoleCode.DIRECTOR, RoleCode.FINANCE]).has(scope.role) ? { budget_amount: true } : {}),
    } });
    if (!row) throw new ForbiddenError();
    res.json({ data: { id: row.id, projectId: row.id, name: row.project_name, status: row.status,
      progressPercent: row.progress_percent, deadline: row.planned_end_date, clientName: row.customer_name,
      ...('budget_amount' in row ? { budget: row.budget_amount } : {}),
    } });
  } catch (error) { next(error); }
});

marbotInternalRouter.get('/projects/tasks', async (req, res, next) => {
  try {
    const scope = await verifyToolRequest(req, 'project.task_overview');
    const ids = await visibleProjectIds(scope.tenantId, scope.companyId, scope.userId, scope.role);
    const employee = await prisma.master_employee.findFirst({ where: { tenant_id: scope.tenantId, company_id: scope.companyId, user_id: scope.userId }, select: { id: true } });
    const selfRole = new Set<RoleCode>([RoleCode.STAFF, RoleCode.SUPERVISOR]).has(scope.role);
    const projectId = req.query.projectId ? String(req.query.projectId) : null;
    if (projectId && ids && !ids.includes(projectId)) throw new ForbiddenError();
    const status = String(req.query.status || 'ALL');
    if (!['ALL', 'OPEN', 'IN_PROGRESS', 'DONE'].includes(status)) throw new ValidationError('Status tidak valid.');
    const where: Prisma.project_taskWhereInput = {
      tenant_id: scope.tenantId, company_id: scope.companyId,
      ...(ids ? { project_id: { in: projectId ? [projectId] : ids } } : projectId ? { project_id: projectId } : {}),
      ...(selfRole ? { assigned_to_id: { in: [scope.userId, employee?.id].filter((id): id is string => Boolean(id)) } } : {}),
      ...(status !== 'ALL' ? { status } : {}),
    };
    const [totalTasks, openTasks, inProgressTasks, overdueTasks] = await Promise.all([
      prisma.project_task.count({ where }),
      prisma.project_task.count({ where: { ...where, status: 'OPEN' } }),
      prisma.project_task.count({ where: { ...where, status: 'IN_PROGRESS' } }),
      prisma.project_task.count({ where: { ...where, status: { not: 'DONE' }, planned_end_at: { lt: new Date() } } }),
    ]);
    res.json({ data: { totalTasks, openTasks, inProgressTasks, overdueTasks,
    } });
  } catch (error) { next(error); }
});

marbotInternalRouter.get('/finance/expenses', async (req, res, next) => {
  try {
    const scope = await verifyToolRequest(req, 'finance.expense_summary');
    if (!new Set<RoleCode>([RoleCode.DIRECTOR, RoleCode.FINANCE]).has(scope.role)) throw new ForbiddenError();
    const period = String(req.query.period || new Date().toISOString().slice(0, 7));
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new ValidationError('Periode tidak valid.');
    const start = new Date(`${period}-01T00:00:00.000Z`);
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const [result, company] = await Promise.all([prisma.fin_project_cost_entry.aggregate({ where: {
      tenant_id: scope.tenantId, company_id: scope.companyId,
      transaction_date: { gte: start, lt: end }, status: 'POSTED',
    }, _sum: { total_cost: true } }), prisma.core_company.findUnique({ where: { id: scope.companyId }, select: { base_currency_id: true } })]);
    const currency = company?.base_currency_id ? await prisma.master_currency.findUnique({ where: { id: company.base_currency_id }, select: { currency_code: true } }) : null;
    res.json({ data: { period, totalExpense: result._sum.total_cost || 0, currency: currency?.currency_code || null, status: 'PROJECT_COST_ONLY' } });
  } catch (error) { next(error); }
});

marbotInternalRouter.get('/crm/tickets', async (req, res, next) => {
  try {
    const scope = await verifyToolRequest(req, 'crm.open_tickets');
    if (!new Set<RoleCode>([RoleCode.DIRECTOR, RoleCode.CRM_LEAD, RoleCode.SALES]).has(scope.role)) throw new ForbiddenError();
    const where: Prisma.service_caseWhereInput = {
      tenant_id: scope.tenantId, company_id: scope.companyId,
      ...(scope.role === RoleCode.SALES ? { assigned_user_id: scope.userId } : {}),
      ...(req.query.customerId ? { customer_party_id: String(req.query.customerId) } : {}),
      status: { notIn: ['CLOSED', 'RESOLVED'] },
      ...(req.query.priority && req.query.priority !== 'ALL' ? { priority: String(req.query.priority) } : {}),
    };
    if (req.query.priority && !['ALL', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(String(req.query.priority))) throw new ValidationError('Prioritas tidak valid.');
    const [tickets, ticketCount, urgentCount] = await Promise.all([
      prisma.service_case.findMany({ where, select: { id: true, subject: true, priority: true }, take: 5, orderBy: { created_at: 'desc' } }),
      prisma.service_case.count({ where }),
      prisma.service_case.count({ where: { ...where, priority: 'URGENT' } }),
    ]);
    res.json({ data: { ticketCount, urgentCount, recentTickets: tickets.map((t) => ({ id: t.id, title: t.subject, priority: t.priority })) } });
  } catch (error) { next(error); }
});

export const marbotUserRouter = Router();
marbotUserRouter.use(authenticate, resolveTenant);
marbotUserRouter.post('/chat/completions', async (req: Request, res: Response, next: NextFunction) => {
  let auditNonce: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    if (!req.user?.tenant_id || !req.companyId) throw new ForbiddenError();
    const access = await checkedUser(req.user.id, req.companyId, req.user.tenant_id);
    const config = await resolveTenantConfig(req.user.tenant_id);
    const message = req.body?.message;
    const conversationId = req.body?.conversationId;
    if (typeof message !== 'string' || !message.trim() || message.length > 4000 ||
        (conversationId !== undefined && (typeof conversationId !== 'string' || conversationId.length > 128))) {
      throw new ValidationError('Pesan atau conversationId tidak valid.');
    }
    const issuedAt = Math.floor(Date.now() / 1000);
    const roleId = access.activeRoleId!;
    const [canReadProject, canReadTask, canReadFinance, canReadCrm] = await Promise.all([
      hasPermission(roleId, req.user.tenant_id, req.companyId, 'READ_PROJECT'),
      hasPermission(roleId, req.user.tenant_id, req.companyId, 'READ_TASK'),
      hasPermission(roleId, req.user.tenant_id, req.companyId, 'READ_FINANCE_SUMMARY'),
      hasPermission(roleId, req.user.tenant_id, req.companyId, 'READ_TICKET'),
    ]);
    const contextModules = access.enabledModules.filter((module) =>
      module === 'MARBOT' || module === 'GENERAL' ||
      (module === 'PROJECTS' && (canReadProject || canReadTask)) ||
      (module === 'FINANCE' && canReadFinance && new Set<RoleCode>([RoleCode.DIRECTOR, RoleCode.FINANCE]).has(access.activeRoleCode!)) ||
      (module === 'CRM' && canReadCrm && new Set<RoleCode>([RoleCode.DIRECTOR, RoleCode.CRM_LEAD, RoleCode.SALES]).has(access.activeRoleCode!)));
    const context = {
      externalTenantId: config.externalTenantId, externalUserId: req.user.id, companyId: req.companyId,
      roleCodes: [signedRole(access.activeRoleCode!, config)],
      enabledModules: contextModules,
      issuedAt, expiresAt: issuedAt + 120, jti: randomUUID(),
    };
    const signature = createHmac('sha256', config.inboundContextSecret).update(canonicalJson(context)).digest('hex');
    await prisma.marbot_request.create({ data: {
      nonce: context.jti, tenant_id: req.user.tenant_id, company_id: req.companyId,
      user_id: req.user.id, tool_name: 'chat.completions', request_id: req.requestId || randomUUID(),
      outcome: 'FORWARDED',
    } });
    auditNonce = context.jti;
    const url = new URL('/api/v1/chat/completions', config.chatbotUrl);
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), 60000);
    res.on('close', () => controller.abort());
    let upstream: globalThis.Response;
    try {
      upstream = await fetch(url, { method: 'POST', redirect: 'manual', signal: controller.signal, headers: {
        'Authorization': `Bearer ${config.chatbotApiKey}`, 'Content-Type': 'application/json', 'X-Context-Signature': signature,
      }, body: JSON.stringify({ message, conversationId, context }) });
    } catch {
      throw new AppError('Layanan MarBot tidak dapat dihubungi.', 502, 'MARBOT_NETWORK_ERROR');
    }
    if (upstream.status === 401) throw new AppError('Autentikasi integrasi MarBot gagal. Periksa tenant API key dan signed context.', 502, 'MARBOT_UPSTREAM_AUTH');
    if (upstream.status === 403) throw new ForbiddenError('Akses MarBot ditolak untuk sesi ini.');
    if (upstream.status === 429) throw new AppError('Kapasitas MarBot sedang penuh. Coba lagi nanti.', 503, 'MARBOT_RATE_LIMIT');
    if (!upstream.ok || !upstream.body) throw new AppError('Layanan MarBot tidak tersedia.', 502, 'MARBOT_UPSTREAM_UNAVAILABLE');
    res.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
    for await (const chunk of upstream.body) res.write(chunk);
    clearTimeout(timer);
    timer = null;
    await prisma.marbot_request.update({ where: { nonce: context.jti }, data: { outcome: 'STREAMED' } });
    res.end();
  } catch (error) {
    if (timer) clearTimeout(timer);
    if (auditNonce) await prisma.marbot_request.update({ where: { nonce: auditNonce }, data: { outcome: 'FAILED' } }).catch(() => undefined);
    if (!res.headersSent) next(error); else res.end();
  }
});
