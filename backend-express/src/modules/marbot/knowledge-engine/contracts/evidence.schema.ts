import { z } from 'zod';

export const ExtractionMethodEnum = z.enum(['AST', 'DMMF', 'TSX', 'RUNTIME']);
export type ExtractionMethod = z.infer<typeof ExtractionMethodEnum>;

export const SourceTypeEnum = z.enum([
  'BACKEND_ROUTE',
  'SERVICE_METHOD',
  'PRISMA_MODEL',
  'FRONTEND_PAGE',
  'TEST_RECORD',
]);
export type SourceType = z.infer<typeof SourceTypeEnum>;

export const EvidenceSchema = z.object({
  id: z.string().optional(),
  entry_id: z.string().nullable().optional(),
  feature_id: z.string().min(1),
  source_file: z.string().min(1),
  symbol_name: z.string().nullable().optional(),
  ast_node_range: z.string().nullable().optional(),
  ast_node_hash: z.string().min(1),
  route_method: z.string().nullable().optional(),
  route_path: z.string().nullable().optional(),
  middleware_chain: z.array(z.string()).nullable().optional(),
  ui_visibility_condition: z.string().nullable().optional(),
  backend_authorization_guard: z.string().nullable().optional(),
  related_symbols: z.array(z.string()).nullable().optional(),
  extraction_method: ExtractionMethodEnum.default('AST'),
  source_type: SourceTypeEnum.default('BACKEND_ROUTE'),
  commit_sha: z.string().min(1),
});

export type Evidence = z.infer<typeof EvidenceSchema>;
