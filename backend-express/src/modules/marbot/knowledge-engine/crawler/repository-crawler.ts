import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import prisma from '../../../../config/database';
import type { Evidence } from '../contracts/evidence.schema';
import { TypeScriptAnalyzer } from './typescript-analyzer';
import { PrismaAnalyzer } from './prisma-analyzer';
import { FrontendAnalyzer } from './frontend-analyzer';
import { RuntimeInspector, type RuntimeContextFacts } from './runtime-inspector';
import { DependencyGraph } from './dependency-graph';

export interface CrawlOptions {
  commitSha?: string;
  targetModule?: string;
  isFullReconcile?: boolean;
  persistToDb?: boolean;
  projectRootDir?: string;
}

export interface CrawlResult {
  commitSha: string;
  totalEvidences: number;
  evidences: Evidence[];
  graph: DependencyGraph;
  runtimeFacts: RuntimeContextFacts;
  persistedCount: number;
}

export class RepositoryCrawler {
  /**
   * Resolves the current Git commit SHA or computes a deterministic content fingerprint
   * for non-Git / non-GitHub deployments (e.g. FTP, Zip upload, Hostinger, VPS).
   */
  static resolveCommitSha(explicitSha?: string): string {
    if (explicitSha && explicitSha.trim().length > 0) {
      return explicitSha.trim();
    }
    if (process.env.GIT_COMMIT_SHA) {
      return process.env.GIT_COMMIT_SHA.trim();
    }
    // 1. Try Git if available
    try {
      const sha = execSync('git rev-parse HEAD', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (sha) return sha;
    } catch {
      // Git command unavailable or not a git checkout
    }

    // 2. Non-Git Fallback: Check for build-metadata.json (created by npm run build)
    try {
      const buildMetaPath = path.resolve(process.cwd(), 'dist', 'build-metadata.json');
      if (fs.existsSync(buildMetaPath)) {
        const meta = JSON.parse(fs.readFileSync(buildMetaPath, 'utf8'));
        if (meta.buildId) return `build-${meta.buildId}`;
      }
    } catch {
      // Ignore if build-metadata.json does not exist
    }

    // 3. Non-Git Fallback: Content Fingerprint of schema.prisma and package.json
    try {
      const schemaPath = path.resolve(process.cwd(), 'prisma', 'schema.prisma');
      const pkgPath = path.resolve(process.cwd(), 'package.json');
      const hasher = crypto.createHash('sha256');
      if (fs.existsSync(schemaPath)) hasher.update(fs.readFileSync(schemaPath));
      if (fs.existsSync(pkgPath)) hasher.update(fs.readFileSync(pkgPath));
      const hash = hasher.digest('hex').slice(0, 16);
      return `release-${hash}`;
    } catch {
      // Fallback
    }

    return `local-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
  }

  /**
   * Executes a full or delta crawl over backend, frontend, schema, and tests.
   */
  static async crawl(options: CrawlOptions = {}): Promise<CrawlResult> {
    const commitSha = this.resolveCommitSha(options.commitSha);
    const cwd = process.cwd();

    // Determine root directory paths
    const projectRootDir =
      options.projectRootDir ||
      (cwd.endsWith('backend-express') ? path.resolve(cwd, '..') : cwd);

    const backendSrcDir = path.join(projectRootDir, 'backend-express', 'src');
    const frontendDir = path.join(projectRootDir, 'frontend-next');

    const evidences: Evidence[] = [];

    // 1. Backend Route & Guard AST Extraction
    const backendEvidences = TypeScriptAnalyzer.extractModuleRouteEvidences(
      backendSrcDir,
      commitSha,
      options.targetModule
    );
    evidences.push(...backendEvidences);

    // 2. Prisma DMMF Data Model Facts (Full Reconcile or unconstrained module)
    if (options.isFullReconcile || !options.targetModule) {
      const prismaEvidences = PrismaAnalyzer.extractPrismaEvidences(commitSha);
      evidences.push(...prismaEvidences);
    }

    // 3. Frontend Next.js TSX Extraction
    if (options.isFullReconcile || !options.targetModule) {
      const frontendEvidences = FrontendAnalyzer.extractFrontendEvidences(
        frontendDir,
        commitSha
      );
      evidences.push(...frontendEvidences);
    }

    // 4. Test Record Extraction
    const testEvidences = RuntimeInspector.extractTestEvidences(
      projectRootDir,
      commitSha
    );
    evidences.push(...testEvidences);

    // 5. Assemble Dependency Graph
    const graph = DependencyGraph.fromEvidences(evidences);
    const runtimeFacts = RuntimeInspector.getRuntimeFacts();

    let persistedCount = 0;

    // 6. Optional Database Persistence
    if (options.persistToDb) {
      persistedCount = await this.persistEvidences(evidences, commitSha);
    }

    return {
      commitSha,
      totalEvidences: evidences.length,
      evidences,
      graph,
      runtimeFacts,
      persistedCount,
    };
  }

  /**
   * Persists evidence records to marbot_knowledge_evidence in batches.
   */
  private static async persistEvidences(
    evidences: Evidence[],
    commitSha: string
  ): Promise<number> {
    try {
      let saved = 0;
      const batchSize = 100;

      for (let i = 0; i < evidences.length; i += batchSize) {
        const batch = evidences.slice(i, i + batchSize);
        await (prisma as any).marbot_knowledge_evidence.createMany({
          data: batch.map((ev) => ({
            feature_id: ev.feature_id,
            source_file: ev.source_file,
            symbol_name: ev.symbol_name ?? null,
            ast_node_range: ev.ast_node_range ?? null,
            ast_node_hash: ev.ast_node_hash,
            route_method: ev.route_method ?? null,
            route_path: ev.route_path ?? null,
            middleware_chain_json: ev.middleware_chain
              ? JSON.stringify(ev.middleware_chain)
              : null,
            related_symbols_json: ev.related_symbols
              ? JSON.stringify(ev.related_symbols)
              : null,
            extraction_method: ev.extraction_method,
            source_type: ev.source_type,
            commit_sha: commitSha,
          })),
          skipDuplicates: true,
        });
        saved += batch.length;
      }
      return saved;
    } catch (error) {
      console.warn(
        'Failed to persist crawl evidences to database, continuing with in-memory graph.',
        error instanceof Error ? error.message : String(error)
      );
      return 0;
    }
  }
}
