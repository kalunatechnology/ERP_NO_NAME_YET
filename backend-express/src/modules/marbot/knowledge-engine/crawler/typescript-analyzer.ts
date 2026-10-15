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
   * Scans all router files in src/modules and converts them to Evidence records.
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

    for (const mod of moduleEntries) {
      if (!mod.isDirectory()) continue;
      if (targetModule && mod.name !== targetModule) continue;

      const modPath = path.join(modulesDir, mod.name);
      const files = fs.readdirSync(modPath).filter((f) => f.endsWith('.routes.ts'));

      for (const file of files) {
        const fullPath = path.join(modPath, file);
        const extracted = this.analyzeRouterFile(fullPath, rootDir);

        for (const r of extracted) {
          const featureId = `${mod.name}.${r.routeMethod.toLowerCase()}${r.routePath.replace(/[^a-zA-Z0-9]/g, '_')}`;
          evidences.push({
            feature_id: featureId,
            source_file: r.sourceFile,
            symbol_name: `${r.routeMethod} ${r.routePath}`,
            ast_node_range: r.astNodeRange,
            ast_node_hash: r.astNodeHash,
            route_method: r.routeMethod,
            route_path: r.routePath,
            middleware_chain: r.middlewareChain,
            backend_authorization_guard: r.backendAuthorizationGuard,
            related_symbols: r.relatedSymbols,
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
