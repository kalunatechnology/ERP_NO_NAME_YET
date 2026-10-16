import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Evidence } from '../contracts/evidence.schema';

export interface RouteExtractionResult {
  routeMethod: string;
  routePath: string;
  sourceFile: string;
  astNodeRange: string;
  astNodeHash: string;
  middlewareChain: string[];
  backendAuthorizationGuard?: string;
  relatedSymbols: string[];
}

export class TypeScriptAnalyzer {
  /**
   * Computes a normalized SHA-256 hash of an AST node.
   */
  static hashNode(nodeText: string): string {
    const normalized = nodeText.replace(/\r\n/g, '\n').trim();
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Extracts routes and middleware guards from a single Express router file.
   */
  static analyzeRouterFile(filePath: string, rootDir: string): RouteExtractionResult[] {
    if (!fs.existsSync(filePath)) return [];
    const sourceText = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');
    const sourceFile = ts.createSourceFile(
      relativePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );

    const results: RouteExtractionResult[] = [];

    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression)
      ) {
        const propName = node.expression.name.text.toLowerCase();
        const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

        if (HTTP_METHODS.includes(propName) && node.arguments.length >= 2) {
          const firstArg = node.arguments[0];
          if (ts.isStringLiteral(firstArg)) {
            const routePath = firstArg.text;
            const middlewares: string[] = [];
            const relatedSymbols: string[] = [];

            // Inspect middleware arguments between first argument (path) and last argument (handler)
            for (let i = 1; i < node.arguments.length; i++) {
              const arg = node.arguments[i];
              const argText = arg.getText(sourceFile);

              if (i < node.arguments.length - 1) {
                // Middleware identifier or call (e.g., authenticate, requireActiveRole(...))
                middlewares.push(argText.replace(/\s+/g, ' '));
              } else {
                // Route handler / controller method
                relatedSymbols.push(argText.slice(0, 100).replace(/\s+/g, ' '));
              }
            }

            const startPos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
            const endPos = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
            const range = `L${startPos.line + 1}:C${startPos.character + 1}-L${endPos.line + 1}:C${endPos.character + 1}`;
            const nodeHash = this.hashNode(node.getText(sourceFile));

            const backendGuard = middlewares
              .filter((m) =>
                /role|auth|guard|require|permission|entitlement|restrict/i.test(m)
              )
              .join(', ') || undefined;

            results.push({
              routeMethod: propName.toUpperCase(),
              routePath,
              sourceFile: relativePath,
              astNodeRange: range,
              astNodeHash: nodeHash,
              middlewareChain: middlewares,
              backendAuthorizationGuard: backendGuard,
              relatedSymbols,
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return results;
  }

  /**
   * Scans all router files in src/modules recursively and converts them to Evidence records.
   */
  static extractModuleRouteEvidences(
    srcDir: string,
    commitSha: string,
    targetModule?: string
  ): Evidence[] {
    const modulesDir = path.join(srcDir, 'modules');
    if (!fs.existsSync(modulesDir)) return [];

    const rootDir = path.resolve(srcDir, '..');
    const evidences: Evidence[] = [];
    const moduleEntries = fs.readdirSync(modulesDir, { withFileTypes: true });

    const MODULE_MOUNT_PREFIXES: Record<string, string> = {
      crm: '/api/v1/crm',
      finance: '/api/v1/finance',
      projects: '/api/v1/projects',
      sales: '/api/v1/sales',
      management_reports: '/api/v1/management-reports',
      master_data: '/api/v1/master-data',
      requests: '/api/v1/requests',
      request: '/api/v1/requests',
      procurement: '/api/v1/procurement',
      inventory: '/api/v1/inventory',
      manufacturing: '/api/v1/manufacturing',
      quality: '/api/v1/quality',
      assets: '/api/v1/assets',
      service: '/api/v1/service',
      logistics: '/api/v1/logistics',
      analytics: '/api/v1/analytics',
      implementation: '/api/v1/implementation',
      reporting: '/api/v1/reporting',
      commands: '/api/v1/commands',
      dashboard: '/api/v1/dashboard',
      accounts: '/api/v1/accounts',
      core: '/api/v1/core',
      marbot: '/api/v1/marbot',
    };

    const MODULE_ROLE_GUARDS: Record<string, string[]> = {
      crm: ['CRM_LEAD', 'SALES', 'PROJECT_MANAGER', 'DIRECTOR'],
      sales: ['CRM_LEAD', 'SALES', 'PROJECT_MANAGER', 'DIRECTOR'],
      finance: ['FINANCE', 'DIRECTOR'],
      management_reports: ['OPERATIONAL_MANAGER', 'DIRECTOR'],
      projects: ['COMPANY_ADMIN', 'PROJECT_MANAGER', 'OPERATIONAL_MANAGER', 'DIRECTOR', 'SUPERVISOR', 'STAFF', 'FINANCE', 'CRM_LEAD', 'SALES'],
    };

    const findRouteFiles = (dir: string): string[] => {
      const results: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...findRouteFiles(full));
        } else if (entry.name.endsWith('.routes.ts')) {
          results.push(full);
        }
      }
      return results;
    };

    for (const mod of moduleEntries) {
      if (!mod.isDirectory()) continue;
      if (targetModule && mod.name !== targetModule) continue;

      const modPath = path.join(modulesDir, mod.name);
      const files = findRouteFiles(modPath);
      const mountPrefix = MODULE_MOUNT_PREFIXES[mod.name] || `/api/v1/${mod.name.replace(/_/g, '-')}`;
      const defaultRoleGuards = MODULE_ROLE_GUARDS[mod.name] || [];

      for (const fullPath of files) {
        const fileRel = path.relative(modPath, fullPath).replace(/\\/g, '/');
        const fileSlug = fileRel.replace(/\.routes\.ts$/, '').replace(/[^a-zA-Z0-9]/g, '_');
        const extracted = this.analyzeRouterFile(fullPath, rootDir);

        // Also check for createCrudRouter usage in file (e.g. implementation.routes.ts)
        const fileContent = fs.readFileSync(fullPath, 'utf8');
        const crudRegex = /\.use\(\s*['"]([^'"]+)['"]\s*,\s*createCrudRouter\(\s*\{[^}]*modelName:\s*['"]([^'"]+)['"]/g;
        let crudMatch: RegExpExecArray | null;
        while ((crudMatch = crudRegex.exec(fileContent)) !== null) {
          const subPath = crudMatch[1];
          const modelName = crudMatch[2];
          const crudMethods = ['GET', 'POST', 'PUT', 'DELETE'];
          for (const method of crudMethods) {
            extracted.push({
              routeMethod: method,
              routePath: subPath,
              sourceFile: path.relative(rootDir, fullPath).replace(/\\/g, '/'),
              astNodeRange: 'L1:C1-L1:C1',
              astNodeHash: this.hashNode(`createCrudRouter:${modelName}:${method}:${subPath}`),
              middlewareChain: ['createCrudRouter', `model:${modelName}`],
              backendAuthorizationGuard: defaultRoleGuards.join(', ') || undefined,
              relatedSymbols: [modelName, `${mountPrefix}${subPath}`],
            });
          }
        }

        const seenInFile = new Map<string, number>();
        for (const r of extracted) {
          const sanitizedPath = r.routePath.replace(/[^a-zA-Z0-9]/g, '_');
          const baseKey = `${mod.name}.${fileSlug}.${r.routeMethod.toLowerCase()}${sanitizedPath}`;
          const count = (seenInFile.get(baseKey) || 0) + 1;
          seenInFile.set(baseKey, count);
          const featureId = count === 1 ? baseKey : `${baseKey}_${count}`;

          const canonicalPath = r.routePath === '/'
            ? mountPrefix
            : `${mountPrefix}${r.routePath.startsWith('/') ? '' : '/'}${r.routePath}`;

          const combinedGuards = [
            ...(defaultRoleGuards.length ? defaultRoleGuards : []),
            ...(r.backendAuthorizationGuard ? [r.backendAuthorizationGuard] : []),
          ].join(', ') || undefined;

          evidences.push({
            feature_id: featureId,
            source_file: r.sourceFile,
            symbol_name: `${r.routeMethod} ${canonicalPath}`,
            ast_node_range: r.astNodeRange,
            ast_node_hash: r.astNodeHash,
            route_method: r.routeMethod,
            route_path: canonicalPath,
            middleware_chain: r.middlewareChain,
            backend_authorization_guard: combinedGuards,
            related_symbols: [
              ...(r.relatedSymbols || []),
              r.routePath,
              canonicalPath,
              `${r.routeMethod} ${canonicalPath}`,
            ],
            extraction_method: 'AST',
            source_type: 'BACKEND_ROUTE',
            commit_sha: commitSha,
          });
        }
      }
    }

    return evidences;
  }
}

