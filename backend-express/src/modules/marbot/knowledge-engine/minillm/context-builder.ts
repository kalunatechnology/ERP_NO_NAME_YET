import type { Evidence } from '../contracts/evidence.schema';
import { SecretScrubber } from '../crawler/secret-scrubber';

export interface PromptContext {
  systemPrompt: string;
  userPrompt: string;
}

export class ContextBuilder {
  /**
   * Prepares scrubbed, sandboxed prompts for MiniLLM feature analysis.
   */
  static buildFeaturePrompt(
    primaryEvidence: Evidence,
    relatedEvidences: Evidence[] = []
  ): PromptContext {
    const systemPrompt = `You are the Arsalynt ERP Knowledge Extraction Assistant.
Your task is to analyze code evidence and generate accurate user procedure documentation in Indonesian.
Strict Rules:
1. Never invent roles or routes not in the code.
2. Rely strictly on the provided untrusted code snippets.
3. Return valid JSON only.`;

    const scrubbedSource = SecretScrubber.scrubText(primaryEvidence.source_file);
    const route = primaryEvidence.route_path
      ? `${primaryEvidence.route_method ?? 'GET'} ${primaryEvidence.route_path}`
      : 'N/A';
    const guard = primaryEvidence.backend_authorization_guard || 'None';
    const relatedList = relatedEvidences
      .map((r) => `- [${r.source_type}] ${r.symbol_name || r.feature_id}`)
      .join('\n');

    const userPrompt = `Analyze the following ERP feature evidence:

Feature ID: ${primaryEvidence.feature_id}
Route: ${route}
Guard: ${guard}
Source File: ${scrubbedSource}

<untrusted_source_code>
${relatedList || 'No additional symbols attached.'}
</untrusted_source_code>

Return a JSON object conforming to:
{
  "title": "Judul prosedur singkat",
  "summary": "Ringkasan prosedur 1-2 kalimat",
  "steps": ["Langkah 1...", "Langkah 2..."],
  "importantNotes": ["Catatan penting..."]
}`;

    return { systemPrompt, userPrompt };
  }
}
