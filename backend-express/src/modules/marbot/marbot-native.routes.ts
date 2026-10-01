import { Router, Request } from 'express';
import { createHash, randomUUID } from 'crypto';
import { z } from 'zod';
import prisma from '../../config/database';
import { ForbiddenError, ValidationError } from '../../utils/errors';
import { buildMarbotRuntimeAuthority } from './marbot-access.service';
import { answerNative, canUseDashboard, followUpQuestion } from './marbot-native.service';
import { renderNativeAnswer } from './marbot-provider.service';
import { env } from '../../config/env';
import { discoverMarbotSchema } from './marbot-schema.service';
import { requireModuleAccess } from '../../middlewares/entitlement.middleware';
import { loadNativePolicyRestrictions } from './marbot-policy.service';
import { planNativeQuestion } from './marbot-planner.service';

export const nativeMarbotRouter = Router();
// Authentication and company resolution are mounted by the parent router.
async function scopeFor(req: Request) {
  if (!req.user?.tenant_id || !req.companyId) throw new ForbiddenError();
  const scope = { ...await buildMarbotRuntimeAuthority(req.user.id, req.user.tenant_id, req.companyId), tenantId: req.user.tenant_id, companyId: req.companyId, userId: req.user.id };
  return { ...scope, ...await loadNativePolicyRestrictions(scope) };
}
const owner = (scope: Awaited<ReturnType<typeof scopeFor>>) => ({ tenant_id: scope.tenantId, company_id: scope.companyId, user_id: scope.userId });
const authorityKey = (scope: Awaited<ReturnType<typeof scopeFor>>) => createHash('sha256').update(JSON.stringify({ ...owner(scope), role: scope.roleCode, blockedReads: scope.blockedReadModules, blockedWrites: scope.blockedWriteModules, permissions: [...scope.permissions].sort(), modules: [...scope.enabledModules].sort(), projects: scope.projectScope.mode === 'ALL' ? 'ALL' : [...scope.projectScope.projectIds].sort() })).digest('hex');
const inputSchema = z.object({ message: z.string().trim().min(1).max(4000), conversationId: z.string().uuid().optional(), mode: z.enum(['HELPER', 'DASHBOARD']).default('HELPER') }).strict();

nativeMarbotRouter.get('/schema', async (req, res, next) => {
  try { res.json({ data: await discoverMarbotSchema(await scopeFor(req)) }); }
  catch (error) { next(error); }
});

nativeMarbotRouter.get('/status', async (req, res, next) => {
  try {
    const scope = await scopeFor(req);
    // Verify persistence readiness instead of reporting a configured URL as online.
    await prisma.marbot_conversation.count({ where: owner(scope) });
    res.json({ data: { online: true, contractMode: 'native', preferredVersion: null, v2Supported: false, managed: false, datasourceSourceKey: 'ERP', datasourceStatus: 'ACTIVE', mcpLiteReady: true, dashboardAvailable: canUseDashboard(scope), aiConfigured: Boolean(env.MARBOT_AI_API_KEY && env.MARBOT_AI_MODEL) } });
  } catch (error) { next(error); }
});

nativeMarbotRouter.get('/conversations', async (req, res, next) => {
  try {
    const scope = await scopeFor(req);
    const rows = await prisma.marbot_conversation.findMany({ where: owner(scope), orderBy: { updated_at: 'desc' }, take: 30 });
    res.json({ data: rows });
  } catch (error) { next(error); }
});
nativeMarbotRouter.get('/conversations/:id', async (req, res, next) => {
  try {
    const scope = await scopeFor(req);
    const row = await prisma.marbot_conversation.findFirst({ where: { ...owner(scope), id: req.params.id }, include: { messages: { orderBy: { created_at: 'asc' }, take: 200 } } });
    if (!row) throw new ForbiddenError();
    // A role change or revoked project must not replay earlier privileged results.
    row.messages = row.messages.filter(message => (message.metadata as Record<string, unknown>)?.authority === authorityKey(scope));
    res.json({ data: row });
  } catch (error) { next(error); }
});

nativeMarbotRouter.post('/chat/completions', async (req, res, next) => {
  const controller = new AbortController();
  const onClose = () => controller.abort();
  res.on('close', onClose);
  let nonce: string | undefined;
  try {
    const parsed = inputSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Pesan, mode, atau conversationId tidak valid.');
    const input = parsed.data;
    const scope = await scopeFor(req);
    if (input.mode === 'DASHBOARD' && !canUseDashboard(scope)) throw new ForbiddenError();
    // Persistent company/user limit works across ERP instances.
    const recent = await prisma.marbot_request.count({ where: { ...owner(scope), tool_name: 'native.chat', created_at: { gte: new Date(Date.now() - 60000) } } });
    if (recent >= 20) { res.status(429).json({ error: { message: 'Terlalu banyak pesan. Coba lagi dalam satu menit.' } }); return; }
    let conversation = input.conversationId ? await prisma.marbot_conversation.findFirst({ where: { ...owner(scope), id: input.conversationId } }) : null;
    if (input.conversationId && !conversation) throw new ForbiddenError();
    nonce = randomUUID();
    await prisma.marbot_request.create({ data: { ...owner(scope), nonce, request_id: req.requestId || nonce, tool_name: 'native.chat', outcome: 'STARTED' } });
    if (!conversation) conversation = await prisma.marbot_conversation.create({ data: { ...owner(scope), title: input.message.slice(0, 80) } });
    const previous = await prisma.marbot_message.findFirst({ where: { conversation_id: conversation.id, role: 'user', metadata: { path: ['authority'], equals: authorityKey(scope) } }, orderBy: { created_at: 'desc' } });
    const contextualQuestion = followUpQuestion(input.message, previous?.content);
    const plannedQuestion = env.MARBOT_AI_API_KEY && env.MARBOT_AI_MODEL
      ? await planNativeQuestion(contextualQuestion, await discoverMarbotSchema(scope), controller.signal)
      : contextualQuestion;
    const answer = /\b(schema|skema|foreign key|primary key|relasi tabel|kolom database)\b/i.test(input.message)
      ? { content: `Metadata database aktual sesuai permission tool Anda:\n\n\`\`\`json\n${JSON.stringify(await discoverMarbotSchema(scope), null, 2)}\n\`\`\`\n\nMetadata tidak memberikan akses query atau mutasi tambahan.`, tools: ['schema.discovery'], sources: ['ERP:database-metadata'] }
      : await answerNative(plannedQuestion, input.mode, scope);
    if ('action' in answer && answer.action) {
      // Reject disabled company/user writes before a proposal reaches the UI.
      // Execution still traverses the complete canonical API authorization chain.
      await new Promise<void>((resolve, reject) => {
        void requireModuleAccess('PROJECTS', 'write')(req, res, error => error ? reject(error) : resolve());
      });
    }
    // Operational values must reach the user byte-for-byte from the ERP query.
    // The optional language model may phrase static procedures, never numeric business data.
    const hasOperationalData = !answer.tools.includes('help.procedure');
    const rendered = hasOperationalData
      ? { content: answer.content, model: 'erp-native' }
      : await renderNativeAnswer(input.message, answer.content, controller.signal);
    if (controller.signal.aborted) {
      await prisma.marbot_request.update({ where: { nonce }, data: { outcome: 'CANCELLED' } });
      return;
    }
    await prisma.$transaction([
      prisma.marbot_message.create({ data: { conversation_id: conversation.id, role: 'user', content: input.message, metadata: { mode: input.mode, authority: authorityKey(scope) } } }),
      prisma.marbot_message.create({ data: { conversation_id: conversation.id, role: 'assistant', content: rendered.content, metadata: { mode: input.mode, authority: authorityKey(scope), tools: answer.tools, sources: answer.sources, model: rendered.model } } }),
      prisma.marbot_conversation.update({ where: { id: conversation.id }, data: { updated_at: new Date() } }),
      prisma.marbot_request.update({ where: { nonce }, data: { outcome: 'COMPLETED' } }),
    ]);
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
    res.write(`data: ${JSON.stringify({ event: 'chunk', data: { delta: rendered.content } })}\n\n`);
    res.write(`data: ${JSON.stringify({ event: 'done', data: { conversationId: conversation.id, model: rendered.model, sources: answer.sources, ...('action' in answer ? { action: answer.action } : {}) } })}\n\n`);
    res.end();
  } catch (error) {
    if (nonce) await prisma.marbot_request.update({ where: { nonce }, data: { outcome: 'FAILED' } }).catch(() => undefined);
    if (!res.headersSent) next(error);
    else res.end();
  } finally { res.off('close', onClose); }
});
