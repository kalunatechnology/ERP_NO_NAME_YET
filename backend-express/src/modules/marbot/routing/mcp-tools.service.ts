import type { Request } from 'express';
import { z } from 'zod';
import { ValidationError } from '../../../utils/errors';
import type { NativeScope } from '../brain/reasoning/native.service';
import { searchMarbotSchema } from '../knowledge/schema.service';
import { executeResourceRead } from '../knowledge/resource.service';

const schemaSearchInput = z.object({
  query: z.string().trim().min(2).max(200),
  limit: z.number().int().min(1).max(3).default(3),
}).strict();

/** Shared MCP tool implementations. The chat agent and Streamable HTTP MCP
 * adapter call the same scoped tools, so planning, discovery and execution
 * cannot drift into separate code paths. */
export function callMcpSchemaSearchTool(scope: NativeScope, raw: unknown) {
  const args = schemaSearchInput.safeParse(raw);
  if (!args.success) throw new ValidationError('Parameter pencarian skema MCP tidak valid.');
  return searchMarbotSchema(scope, args.data.query, args.data.limit);
}

export async function callMcpErpQueryTool(req: Request, raw: unknown, scope: NativeScope) {
  return executeResourceRead(req, raw, scope);
}
