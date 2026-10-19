import { env } from '../../../../config/env';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  messages: ChatMessage[];
  responseFormatJson?: boolean;
  timeoutMs?: number;
}

export class MiniLlmClient {
  /**
   * Invokes the MiniLLM inference endpoint with strict timeouts and JSON enforcement.
   */
  static async complete(options: CompletionOptions): Promise<string | null> {
    const apiKey = env.MARBOT_MINILLM_API_KEY || env.MARBOT_AI_API_KEY;
    const baseUrl = env.MARBOT_MINILLM_BASE_URL || 'https://openrouter.ai/api/v1';
    const model = env.MARBOT_MINILLM_MODEL || env.MARBOT_AI_MODEL || 'openai/gpt-4o-mini';

    if (!apiKey) {
      // Deterministic offline fallback if AI key not configured
      return null;
    }

    const endpoint = baseUrl.endsWith('/')
      ? `${baseUrl}chat/completions`
      : `${baseUrl}/chat/completions`;

    const body: Record<string, unknown> = {
      model,
      messages: options.messages,
      temperature: 0,
    };

    if (options.responseFormatJson) {
      body.response_format = { type: 'json_object' };
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://arsalynt.com',
          'X-Title': 'Arsalynt ERP Knowledge Engine',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(options.timeoutMs ?? 30000),
      });

      if (!response.ok) {
        console.warn(`MiniLLM returned status ${response.status}: ${response.statusText}`);
        return null;
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      return data.choices?.[0]?.message?.content ?? null;
    } catch (error) {
      console.warn(
        'MiniLLM request failed or timed out:',
        error instanceof Error ? error.message : String(error)
      );
      return null;
    }
  }
}
