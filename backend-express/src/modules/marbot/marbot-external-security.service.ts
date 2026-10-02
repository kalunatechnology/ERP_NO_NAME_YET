import { createHmac } from 'node:crypto';
import { ForbiddenError, AppError } from '../../utils/errors';
import { canonicalJson } from './marbot-signature.service';
import type { MarbotTenantConfig } from './marbot.types';

export function requireSignedExternalContract(config: MarbotTenantConfig) {
  if (config.contractVersion !== 2 || config.runtimeContextVersion !== 2) {
    throw new ForbiddenError('Chatbot external memerlukan integrasi V2 dengan signed runtime context. Gunakan mode native atau sinkronkan tenant ke V2.');
  }
  if (config.dataAccessMode !== 'GATEWAY_ONLY') {
    throw new ForbiddenError('Sinkronkan integrasi external ke GATEWAY_ONLY; akses database langsung tidak diizinkan.');
  }
}

/** The client never controls an upstream history ID. Bind its namespace to the
 * current owner and complete authority snapshot; role/scope changes start a new history. */
export function externalConversationKey(localId: string, authority: string, config: MarbotTenantConfig) {
  return createHmac('sha256', config.inboundContextSecret)
    .update(canonicalJson({ purpose: 'marbot-external-history-v1', tenant: config.externalTenantId, localId, authority }))
    .digest('hex');
}

/** Buffer a bounded response so revoked authority is checked before any data is released.
 * Only text events are accepted. External services cannot issue local mutation tickets. */
export async function readExternalAnswer(upstream: globalThis.Response) {
  if (!upstream.body || !upstream.headers.get('content-type')?.includes('text/event-stream')) {
    throw new AppError('Kontrak respons chatbot external tidak valid.', 502, 'MARBOT_INVALID_STREAM');
  }
  const decoder = new TextDecoder();
  let buffer = ''; let bytes = 0;
  for await (const chunk of upstream.body) {
    bytes += chunk.byteLength;
    if (bytes > 1024 * 1024) throw new AppError('Respons chatbot terlalu besar.', 502, 'MARBOT_INVALID_STREAM');
    buffer += decoder.decode(chunk, { stream: true });
  }
  buffer += decoder.decode();
  let content = ''; let completed = false; let model: string | undefined;
  for (const line of buffer.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const raw = line.slice(5).trim();
    if (!raw || raw === '[DONE]') continue;
    let event: any;
    try { event = JSON.parse(raw); } catch { throw new AppError('Stream chatbot tidak valid.', 502, 'MARBOT_INVALID_STREAM'); }
    if (event.event === 'error') throw new AppError('Layanan chatbot gagal menyelesaikan respons.', 502, 'MARBOT_UPSTREAM_ERROR');
    if (completed) throw new AppError('Stream chatbot memiliki event setelah selesai.', 502, 'MARBOT_INVALID_STREAM');
    if (event.event === 'chunk' && typeof event.data?.delta === 'string') content += event.data.delta;
    else if (event.event === 'done') {
      completed = true;
      model = typeof event.data?.model === 'string' ? event.data.model.slice(0, 120) : undefined;
    } else throw new AppError('Event chatbot tidak didukung.', 502, 'MARBOT_INVALID_STREAM');
  }
  if (!completed) throw new AppError('Respons chatbot belum lengkap.', 502, 'MARBOT_INVALID_STREAM');
  return { content, model };
}
