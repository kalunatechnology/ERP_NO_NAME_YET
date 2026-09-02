export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  model?: string | null;
  totalTokens?: number | null;
  latencyMs?: number | null;
  createdAt: string;
  isStreaming?: boolean;
}

export interface Conversation {
  id: string;
  callerId: string;
  externalUserId?: string | null;
  title?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: {
    messages: number;
  };
}

export interface ConversationDetail {
  id: string;
  callerId: string;
  externalUserId?: string | null;
  title?: string | null;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  filename?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  status: 'processing' | 'ready' | 'error';
  chunkCount: number;
  createdAt: string;
}

export interface SearchKnowledgeResultItem {
  content: string;
  tokenCount: number;
  score: number;
  document: {
    title: string;
  };
}

export interface ChatStreamChunkEvent {
  event: 'chunk';
  data: {
    delta: string;
  };
}

export interface ChatStreamDoneEvent {
  event: 'done';
  data: {
    model?: string;
    latencyMs?: number;
    totalTokens?: number;
    conversationId?: string;
  };
}

export interface ChatStreamErrorEvent {
  event: 'error';
  data: {
    message: string;
    code?: string;
  };
}
