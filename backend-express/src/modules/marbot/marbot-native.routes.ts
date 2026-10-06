import { Router, Request } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import prisma from '../../config/database';
import { AppError, ConflictError, ForbiddenError, ValidationError } from '../../utils/errors';
import { buildMarbotRuntimeAuthority } from './marbot-access.service';
import { answerNative, canUseDashboard, followUpQuestion, isNativeTaskReadQuestion } from './marbot-native.service';
import { renderNativeAnswer } from './marbot-provider.service';
import { env } from '../../config/env';
import { discoverMarbotSchema } from './marbot-schema.service';
import { requireModuleAccess } from '../../middlewares/entitlement.middleware';
import { loadNativePolicyRestrictions } from './marbot-policy.service';
import { planNativeQuestion } from './marbot-planner.service';
import { executeCanonicalAction } from './marbot-execution.service';
import type { MarbotAction } from './marbot-action.service';
import { createMarbotMcpRouter } from './marbot-mcp.routes';
import { executeResourceRead, executeResourceWrite, planResourceQuestion, resourceCatalog, resourceDefinition } from './marbot-resource.service';
import { reserveMarbotRequest } from './marbot-rate-limit.service';
import { marbotOwner as owner, marbotAuthorityKey as authorityKey, visibleConversationTitle,
  marbotAuthorityBaseKey, marbotMessageAuthority, canReadMarbotMessage } from './marbot-authority.service';

export const nativeMarbotRouter = Router();
// Authentication and company resolution are mounted by the parent router.
async function scopeFor(req: Request) {
  if (!req.user?.tenant_id || !req.companyId) throw new ForbiddenError();
  const scope = { ...await buildMarbotRuntimeAuthority(req.user.id, req.user.tenant_id, req.companyId), tenantId: req.user.tenant_id, companyId: req.companyId, userId: req.user.id };
  return { ...scope, ...await loadNativePolicyRestrictions(scope) };
}
const inputSchema = z.object({ message: z.string().trim().min(1).max(4000), conversationId: z.string().uuid().optional(), mode: z.enum(['HELPER', 'DASHBOARD']).default('HELPER') }).strict();
nativeMarbotRouter.use('/mcp', createMarbotMcpRouter(scopeFor));

nativeMarbotRouter.post('/actions/:id/execute', async (req, res, next) => {
  try {
    if (!z.string().uuid().safeParse(req.params.id).success ||
        !z.object({ confirmed: z.literal(true) }).strict().safeParse(req.body).success) {
      throw new ValidationError('Konfirmasi eksplisit dan identitas tiket wajib valid.');
    }
    const scope = await scopeFor(req);
    const message = await prisma.marbot_message.findFirst({ where: {
      id: req.params.id, role: 'assistant', conversation: owner(scope),
    } });
    const metadata = message?.metadata as Record<string, any> | undefined;
    if (!message || !metadata?.action || !canReadMarbotMessage(metadata, scope)) throw new ForbiddenError();
    const action = metadata.action as MarbotAction;
    const module = action.kind === 'resource.write' ? resourceDefinition(String(action.payload.resource), scope, true).module : 'PROJECTS';
    if (scope.blockedReadModules.includes(module) || scope.blockedWriteModules.includes(module)) throw new ForbiddenError();
    const prior = await prisma.marbot_request.findUnique({ where: { nonce: message.id } });
    if (prior?.outcome === 'VERIFIED' && typeof metadata.result === 'string') {
      res.json({ data: { content: metadata.result, verified: true } }); return;
    }
    if (Date.now() - message.created_at.getTime() > 15 * 60000) throw new ConflictError('Tiket kedaluwarsa. Buat usulan baru.');
    // Atomic compare-and-set: a timeout/crash never permits a second mutation.
    const claimed = await prisma.marbot_request.updateMany({ where: {
      nonce: message.id, ...owner(scope), outcome: 'PROPOSED',
    }, data: { outcome: 'EXECUTING' } });
    if (claimed.count !== 1) throw new ConflictError('Tiket sudah digunakan atau sedang diproses. Periksa hasil di ERP; jangan mengulang operasi.');
    let content: string;
    let verified = false;
    try {
      content = action.kind === 'resource.write' ? await executeResourceWrite(req, action.payload, scope, message.id)
        : await executeCanonicalAction(req, action, message.id);
      verified = true;
    } catch (error) {
      const detail = error instanceof Error && /^(API ERP |API resource |Assignment belum|Identitas pembacaan|Pembacaan ulang field)/.test(error.message) ? `${error.message}\n` : '';
      content = `${detail}Operasi belum dapat diverifikasi. API mungkin menolak, mengalami gangguan, atau sudah menyimpan sebagian hasil. Periksa data di modul ${module} sebelum membuat usulan baru.`;
    }
    // A successful create/assignment can expand project visibility. The result
    // references the new record, so retain the post-write scope for future revocation checks.
    const resultScope = await scopeFor(req);
    const authorityStillValid = canReadMarbotMessage(marbotMessageAuthority(scope), resultScope);
    const resultAuthority = authorityStillValid ? marbotMessageAuthority(resultScope) : marbotMessageAuthority(scope);
    await prisma.$transaction([
      prisma.marbot_request.update({ where: { nonce: message.id }, data: { outcome: verified ? 'VERIFIED' : 'UNVERIFIED' } }),
      prisma.marbot_message.update({ where: { id: message.id }, data: {
        content: `${message.content}\n\n${content}`, metadata: { ...metadata, ...resultAuthority, result: content, verified },
      } }),
      prisma.marbot_conversation.update({ where: { id: message.conversation_id }, data: { updated_at: new Date() } }),
    ]);
    if (!authorityStillValid) throw new ForbiddenError('Hak akses berubah selama penyimpanan. Periksa hasil melalui modul yang masih dapat Anda akses.');
    res.status(verified ? 200 : 502).json({ data: { content, verified }, ...(!verified ? { error: { message: content } } : {}) });
  } catch (error) { next(error); }
});

nativeMarbotRouter.get('/capabilities', async (req, res, next) => {
  try { res.json({ data: resourceCatalog(await scopeFor(req)) }); } catch (error) { next(error); }
});
nativeMarbotRouter.post('/query', async (req, res, next) => {
  let auditNonce: string | undefined;
  try {
    const scope = await scopeFor(req);
    const nonce = randomUUID();
    await reserveMarbotRequest({ ...owner(scope), nonce, request_id: req.requestId || nonce, tool_name: 'native.query', outcome: 'STARTED' }, 60);
    auditNonce = nonce;
    const result = await executeResourceRead(req, req.body, scope);
    if (!canReadMarbotMessage(marbotMessageAuthority(scope), await scopeFor(req))) throw new AppError('Hak akses berubah selama pemrosesan. Kirim ulang pertanyaan sesuai sesi aktif.', 403, 'MARBOT_AUTHORITY_CHANGED');
    await prisma.marbot_request.update({ where: { nonce }, data: { outcome: 'COMPLETED' } });
    res.json({ data: result });
  } catch (error) {
    if (auditNonce) await prisma.marbot_request.update({ where: { nonce: auditNonce }, data: { outcome: 'FAILED' } }).catch(() => undefined);
    next(error);
  }
});

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
    const candidate = { OR: [
      { metadata: { path: ['authority'], equals: authorityKey(scope) } },
      { metadata: { path: ['authorityBase'], equals: marbotAuthorityBaseKey(scope) } },
    ] };
    const rows = await prisma.marbot_conversation.findMany({
      where: { ...owner(scope), messages: { some: candidate } }, orderBy: { updated_at: 'desc' }, take: 30,
      include: { messages: { where: candidate, orderBy: { created_at: 'desc' }, take: 200 } },
    });
    const visible = rows.flatMap(({ messages, ...row }) => {
      const permitted = messages.reverse().filter(message => canReadMarbotMessage(message.metadata, scope));
      return permitted.length ? [{ ...row, title: visibleConversationTitle(permitted) }] : [];
    });
    res.json({ data: visible });
  } catch (error) { next(error); }
});
nativeMarbotRouter.get('/conversations/:id', async (req, res, next) => {
  try {
    const scope = await scopeFor(req);
    const row = await prisma.marbot_conversation.findFirst({ where: { ...owner(scope), id: req.params.id }, include: { messages: { orderBy: { created_at: 'desc' }, take: 200 } } });
    if (!row) throw new ForbiddenError();
    // A role change or revoked project must not replay earlier privileged results.
    row.messages = row.messages.reverse().filter(message => canReadMarbotMessage(message.metadata, scope));
    row.title = visibleConversationTitle(row.messages);
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
    let conversation = input.conversationId ? await prisma.marbot_conversation.findFirst({ where: { ...owner(scope), id: input.conversationId } }) : null;
    if (input.conversationId && !conversation) throw new AppError('Percakapan tidak tersedia untuk akun dan company aktif. Pesan berikutnya akan membuka chat baru.', 403, 'MARBOT_CONVERSATION_UNAVAILABLE');
    nonce = randomUUID();
    await reserveMarbotRequest({ ...owner(scope), nonce, request_id: req.requestId || nonce, tool_name: 'native.chat', outcome: 'STARTED' }, 20);
    if (!conversation) conversation = await prisma.marbot_conversation.create({ data: { ...owner(scope), title: input.message.slice(0, 80) } });
    const previous = await prisma.marbot_message.findFirst({ where: { conversation_id: conversation.id, role: 'user', OR: [
      { metadata: { path: ['authority'], equals: authorityKey(scope) } },
      { metadata: { path: ['authorityBase'], equals: marbotAuthorityBaseKey(scope) } },
    ] }, orderBy: { created_at: 'desc' } });
    const contextualQuestion = followUpQuestion(input.message, previous && canReadMarbotMessage(previous.metadata, scope) ? previous.content : undefined);
    const nativeTaskRead = isNativeTaskReadQuestion(contextualQuestion);
    const resourcePlan = nativeTaskRead ? null : await planResourceQuestion(contextualQuestion, scope, controller.signal);
    const plannedQuestion = !nativeTaskRead && !resourcePlan && env.MARBOT_AI_API_KEY && env.MARBOT_AI_MODEL
      ? await planNativeQuestion(contextualQuestion, await discoverMarbotSchema(scope, prisma, ['project_project', 'project_main_task', 'project_weekly_task', 'project_daily_task', 'fin_project_cost_entry', 'service_case']), controller.signal)
      : contextualQuestion;
    let resourceAnswer: { content: string; tools: string[]; sources: string[]; action?: MarbotAction } | undefined;
    if (!resourcePlan && /\b(procurement|pengadaan|inventory|inventori|stok|manufacturing|manufaktur|quality|inspeksi|assets|logistics|logistik|implementation|implementasi|sales|master data)\b/i.test(contextualQuestion) &&
        !/\b(cara|panduan|fitur|workflow|schema|skema|permission|role|peran|modul|sistem)\b/i.test(contextualQuestion)) {
      resourceAnswer = { content: 'Permintaan data modul tersebut belum dapat dipetakan ke resource dan filter yang valid. Tidak ada data yang diambil atau diubah. Sebutkan resource/field dari katalog kemampuan, atau berikan konteks yang lebih spesifik. Jika provider AI belum dikonfigurasi, gunakan format data {"resource":"module.resource","operation":"count","filters":{}} dengan nama resource aktual.', tools: ['resource.clarification'], sources: ['ERP:canonical-catalog'] };
    }
    if (resourcePlan) {
      const plan = resourcePlan;
      if (['create', 'update'].includes(plan.operation)) {
        resourceAnswer = { content: `Usulan perubahan ${plan.resource}:\n\n\`\`\`json\n${JSON.stringify(plan, null, 2)}\n\`\`\`\n\nBelum disimpan. Konfirmasi diperlukan; backend memvalidasi hak akses dan membaca ulang hasil.`, tools: ['resource.proposal'], sources: ['ERP:canonical-api'], action: { kind: 'resource.write', payload: plan } };
      } else {
        const result = await executeResourceRead(req, plan, scope);
        resourceAnswer = { content: `Data aktual ${plan.resource}: ${result.aggregate ? 'agregasi database sesuai filter dan akses Anda' : `${result.count} record sesuai filter dan akses Anda`}.\n\n\`\`\`json\n${JSON.stringify(result.aggregate ?? result.rows, null, 2)}\n\`\`\`${result.truncated ? '\nDaftar dibatasi 30 record; jumlah berasal dari total query ERP.' : ''}`, tools: ['resource.query'], sources: [result.source] };
      }
    }
    const answer = resourceAnswer ?? (/\b(schema|skema|foreign key|primary key|relasi tabel|kolom database)\b/i.test(input.message)
      ? { content: `Metadata database aktual sesuai permission tool Anda:\n\n\`\`\`json\n${JSON.stringify(await discoverMarbotSchema(scope), null, 2)}\n\`\`\`\n\nMetadata tidak memberikan akses query atau mutasi tambahan.`, tools: ['schema.discovery'], sources: ['ERP:database-metadata'] }
      : await answerNative(plannedQuestion, input.mode, scope));
    if ('action' in answer && answer.action) {
      // Reject disabled company/user writes before a proposal reaches the UI.
      // Execution still traverses the complete canonical API authorization chain.
      await new Promise<void>((resolve, reject) => {
        const module = answer.action!.kind === 'resource.write' ? resourceDefinition(String(answer.action!.payload.resource), scope, true).module : 'PROJECTS';
        void requireModuleAccess(module, 'write')(req, res, error => error ? reject(error) : resolve());
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
    // Provider latency or concurrent role/module changes must not return an old privileged result.
    if (!canReadMarbotMessage(marbotMessageAuthority(scope), await scopeFor(req))) throw new AppError('Hak akses berubah selama pemrosesan. Kirim ulang pertanyaan sesuai sesi aktif.', 403, 'MARBOT_AUTHORITY_CHANGED');
    const actionId = randomUUID();
    const action = 'action' in answer ? answer.action : undefined;
    await prisma.$transaction([
      prisma.marbot_message.create({ data: { conversation_id: conversation.id, role: 'user', content: input.message, metadata: { mode: input.mode, ...marbotMessageAuthority(scope) } } }),
      prisma.marbot_message.create({ data: { id: actionId, conversation_id: conversation.id, role: 'assistant', content: rendered.content, metadata: { mode: input.mode, ...marbotMessageAuthority(scope), tools: answer.tools, sources: answer.sources, model: rendered.model, ...(action ? { action: JSON.parse(JSON.stringify(action)) } : {}) } } }),
      ...(action ? [prisma.marbot_request.create({ data: { ...owner(scope), nonce: actionId, request_id: req.requestId || actionId, tool_name: 'native.action', outcome: 'PROPOSED' } })] : []),
      prisma.marbot_conversation.update({ where: { id: conversation.id }, data: { updated_at: new Date() } }),
      prisma.marbot_request.update({ where: { nonce }, data: { outcome: 'COMPLETED' } }),
    ]);
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
    res.write(`data: ${JSON.stringify({ event: 'chunk', data: { delta: rendered.content } })}\n\n`);
    res.write(`data: ${JSON.stringify({ event: 'done', data: { conversationId: conversation.id, model: rendered.model, sources: answer.sources, ...(action ? { action: { ...action, ticketId: actionId } } : {}) } })}\n\n`);
    res.end();
  } catch (error) {
    if (nonce) await prisma.marbot_request.update({ where: { nonce }, data: { outcome: 'FAILED' } }).catch(() => undefined);
    if (!res.headersSent) next(error);
    else res.end();
  } finally { res.off('close', onClose); }
});

