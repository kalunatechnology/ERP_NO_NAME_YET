import {
  ChatMessage,
  Conversation,
  ConversationDetail,
  KnowledgeDocument,
  SearchKnowledgeResultItem,
} from '@/types/chatbot';

export const DEFAULT_CALLER_CONFIG = {
  callerName: 'PT Sinergi Muda Arsa',
  callerId: 'cmtiauhom0003118377iv7pk9',
  callerToken: 'cb_live_0080c942f880b04ad7f3fba231432c1de43aefb24b201bd7',
};

const getBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_CHATBOT_API_URL || 'http://localhost:5000';
  }
  return process.env.NEXT_PUBLIC_CHATBOT_API_URL || 'http://localhost:5000';
};

export interface StreamChatOptions {
  message: string;
  conversationId?: string | null;
  externalUserId?: string;
  callerToken?: string;
  signal?: AbortSignal;
  onChunk: (delta: string) => void;
  onDone?: (meta: { model?: string; latencyMs?: number; totalTokens?: number }) => void;
  onError?: (error: Error) => void;
}

/**
 * Stream AI Chat Completions using Server-Sent Events (SSE)
 */
export async function streamChatCompletion({
  message,
  conversationId,
  externalUserId,
  callerToken = DEFAULT_CALLER_CONFIG.callerToken,
  signal,
  onChunk,
  onDone,
  onError,
}: StreamChatOptions): Promise<void> {
  const url = `${getBaseUrl()}/api/v1/chat/completions`;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${callerToken}`,
    };

    if (externalUserId) {
      headers['X-External-User-Id'] = externalUserId;
    }

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

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue; // skip keep-alive comments

        if (trimmed.startsWith('data:')) {
          const rawData = trimmed.replace(/^data:\s*/, '').trim();

          if (rawData === '[DONE]') {
            continue;
          }

          try {
            const parsed = JSON.parse(rawData);
            if (parsed.event === 'chunk' && parsed.data?.delta) {
              onChunk(parsed.data.delta);
            } else if (parsed.event === 'done') {
              onDone?.(parsed.data || {});
            } else if (parsed.event === 'error') {
              throw new Error(parsed.data?.message || 'Chatbot streaming error');
            }
          } catch (e) {
            // If raw text is not JSON, check if it's direct delta
            if (rawData && rawData !== '[DONE]') {
              onChunk(rawData);
            }
          }
        }
      }
    }
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
