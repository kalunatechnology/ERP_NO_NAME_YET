/**
 * File: frontend-next/services/chatbot.service.ts
 *
 * Purpose: Implements external service integration responsibilities in the frontend application.
 * Responsibility: Owns the contracts declared here and connects them to framework discovery or explicit imports without changing unrelated domain state.
 * Integration: Consumers reach this file through static imports, framework conventions, or an explicit script entry point.
 * Dependencies and side effects: Function-level documentation identifies HTTP, database, browser-state, and security effects where they occur.
 */
import {
  ChatMessage,
  Conversation,
  ConversationDetail,
  KnowledgeDocument,
  SearchKnowledgeResultItem,
} from '@/types/chatbot';

export const DEFAULT_CALLER_CONFIG = {
  callerName: 'PT Sinergi Muda Arsa',
  callerId: '',
  callerToken: '',
};

/**
 * getBaseUrl adapts a frontend operation to its HTTP API contract.
 *
 * @param input - Uses the typed arguments in the signature to construct path, query, headers, or body.
 * @returns The typed payload or Promise produced after response normalization.
 * External dependency: uses the configured API client/base URL referenced below. Authentication, company scope, timeout, and idempotency are inherited only when the shared Axios client is used.
 * Failure behavior: rejects with the underlying HTTP/parsing error; the caller owns user-facing recovery unless handled here.
 */
const getBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_CHATBOT_API_URL || 'http://localhost:5000';
  }
  return process.env.NEXT_PUBLIC_CHATBOT_API_URL || 'http://localhost:5000';
};

export interface StreamChatOptions {
  message: string;
  conversationId?: string | null;
  signal?: AbortSignal;
  onChunk: (delta: string) => void;
  onDone?: (meta: { model?: string; latencyMs?: number; totalTokens?: number; conversationId?: string }) => void;
  onError?: (error: Error) => void;
}

export interface MarbotStatus {
  online: boolean;
  contractMode: 'legacy' | 'v2';
  preferredVersion: number | null;
  v2Supported: boolean;
}

function getErpAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${localStorage.getItem('erp.access') || localStorage.getItem('access_token') || ''}`,
  };
  const companyId = localStorage.getItem('erp.company') || localStorage.getItem('active_company_id');
  if (companyId) headers['X-Company-ID'] = companyId;
  return headers;
}

export async function getMarbotStatus(signal?: AbortSignal): Promise<MarbotStatus> {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8001';
  const response = await fetch(`${baseUrl}/api/v1/marbot/status`, {
    method: 'GET',
    headers: getErpAuthHeaders(),
    signal,
  });
  if (!response.ok) throw new Error(`MarBot status check failed (${response.status})`);
  const payload = await response.json();
  return payload.data as MarbotStatus;
}

/**
 * Stream AI Chat Completions using Server-Sent Events (SSE)
 */
export async function streamChatCompletion({
  message,
  conversationId,
  signal,
  onChunk,
  onDone,
  onError,
}: StreamChatOptions): Promise<void> {
  const url = `${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8001'}/api/v1/marbot/chat/completions`;

  try {
    const headers: Record<string, string> = {
      ...getErpAuthHeaders(),
      'Content-Type': 'application/json',
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message,
        conversationId: conversationId || undefined,
      }),
      signal,
    });

    if (!response.ok) {
      let errorMessage = `HTTP Error ${response.status}: ${response.statusText}`;
      try {
        const errorJson = await response.json();
        if (errorJson?.error?.message) {
          errorMessage = errorJson.error.message;
        }
      } catch {
        // ignore json parse error
      }
      throw new Error(errorMessage);
    }

    if (!response.body) {
      throw new Error('Response body is null, SSE stream unavailable');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let receivedChunk = false;
    let receivedDone = false;

    const processLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':') || !trimmed.startsWith('data:')) return;

      const rawData = trimmed.replace(/^data:\s*/, '').trim();
      if (!rawData || rawData === '[DONE]') return;

      let parsed: any;
      try { parsed = JSON.parse(rawData); } catch { return; }
      if (parsed?.event === 'chunk' && parsed.data?.delta) {
        receivedChunk = true;
        onChunk(parsed.data.delta);
      } else if (parsed?.event === 'done') {
        receivedDone = true;
        onDone?.(parsed.data || {});
      } else if (parsed?.event === 'error') {
        throw new Error(parsed.data?.message || 'Chatbot streaming error');
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) processLine(line);
    }

    if (buffer.trim()) processLine(buffer);
    if (!receivedDone && receivedChunk) onDone?.({});
    if (!receivedDone && !receivedChunk) throw new Error('MarBot menutup stream tanpa respons.');
  } catch (err: any) {
    if (err.name === 'AbortError') {
      // User aborted stream
      return;
    }
    onError?.(err instanceof Error ? err : new Error(String(err)));
    throw err;
  }
}

/**
 * Fetch all conversations for current caller/user
 */
export async function getConversations(
  callerToken: string = DEFAULT_CALLER_CONFIG.callerToken
): Promise<Conversation[]> {
  const url = `${getBaseUrl()}/api/v1/conversations`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${callerToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to load conversations: ${res.statusText}`);
  }

  const json = await res.json();
  return json.data || [];
}

/**
 * Create a new conversation record
 */
export async function createConversation(
  title?: string,
  externalUserId?: string,
  callerToken: string = DEFAULT_CALLER_CONFIG.callerToken
): Promise<Conversation> {
  const url = `${getBaseUrl()}/api/v1/conversations`;
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${callerToken}`,
    'Content-Type': 'application/json',
  };
  if (externalUserId) {
    headers['X-External-User-Id'] = externalUserId;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(title ? { title } : {}),
  });

  if (!res.ok) {
    throw new Error(`Failed to create conversation: ${res.statusText}`);
  }

  const json = await res.json();
  return json.data;
}

/**
 * Get detailed conversation history with messages
 */
export async function getConversationDetail(
  conversationId: string,
  callerToken: string = DEFAULT_CALLER_CONFIG.callerToken
): Promise<ConversationDetail> {
  const url = `${getBaseUrl()}/api/v1/conversations/${conversationId}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${callerToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to load conversation details: ${res.statusText}`);
  }

  const json = await res.json();
  return json.data;
}

/**
 * Delete a conversation
 */
export async function deleteConversation(
  conversationId: string,
  callerToken: string = DEFAULT_CALLER_CONFIG.callerToken
): Promise<boolean> {
  const url = `${getBaseUrl()}/api/v1/conversations/${conversationId}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${callerToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to delete conversation: ${res.statusText}`);
  }

  const json = await res.json();
  return Boolean(json.data?.deleted ?? true);
}

/**
 * List all knowledge base documents
 */
export async function getKnowledgeDocuments(
  callerToken: string = DEFAULT_CALLER_CONFIG.callerToken
): Promise<KnowledgeDocument[]> {
  const url = `${getBaseUrl()}/api/v1/knowledge`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${callerToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to load knowledge documents: ${res.statusText}`);
  }

  const json = await res.json();
  return json.data || [];
}

/**
 * Ingest direct text into knowledge base
 */
export async function addTextKnowledge(
  title: string,
  content: string,
  callerToken: string = DEFAULT_CALLER_CONFIG.callerToken
): Promise<KnowledgeDocument> {
  const url = `${getBaseUrl()}/api/v1/knowledge/text`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${callerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, content }),
  });

  if (!res.ok) {
    throw new Error(`Failed to ingest text knowledge: ${res.statusText}`);
  }

  const json = await res.json();
  return json.data;
}

/**
 * Upload document file to knowledge base
 */
export async function uploadKnowledgeDocument(
  file: File,
  title?: string,
  callerToken: string = DEFAULT_CALLER_CONFIG.callerToken
): Promise<KnowledgeDocument> {
  const url = `${getBaseUrl()}/api/v1/knowledge`;
  const formData = new FormData();
  formData.append('file', file);
  if (title) formData.append('title', title);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${callerToken}`,
    },
    body: formData,
  });

  if (!res.ok) {
    throw new Error(`Failed to upload document: ${res.statusText}`);
  }

  const json = await res.json();
  return json.data;
}

/**
 * Search / RAG simulator
 */
export async function searchKnowledge(
  query: string,
  topK: number = 5,
  callerToken: string = DEFAULT_CALLER_CONFIG.callerToken
): Promise<SearchKnowledgeResultItem[]> {
  const url = `${getBaseUrl()}/api/v1/knowledge/search`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${callerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, topK }),
  });

  if (!res.ok) {
    throw new Error(`Failed to search knowledge: ${res.statusText}`);
  }

  const json = await res.json();
  return json.data?.results || [];
}
