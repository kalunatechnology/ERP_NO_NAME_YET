import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Evidence } from '../contracts/evidence.schema';

export interface FrontendPageFact {
  pagePath: string;
  sourceFile: string;
  apiCalls: string[];
  actionButtons: string[];
  visibilityConditions: string[];
  astHash: string;
}

export class FrontendAnalyzer {
  /**
   * Scans a TSX file to extract API endpoints invoked, buttons rendered, and conditional guards.
   */
  static analyzeTsxFile(filePath: string, frontendRootDir: string): FrontendPageFact | null {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf8');
    const relative = path.relative(frontendRootDir, filePath).replace(/\\/g, '/');

    const sourceFile = ts.createSourceFile(
      relative,
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );

    const apiCalls: string[] = [];
    const actionButtons: string[] = [];
    const visibilityConditions: string[] = [];

    const visit = (node: ts.Node) => {
      // 1. Detect api.get/post/patch/delete calls
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression)
      ) {
        const callerName = node.expression.expression.getText(sourceFile);
        const methodName = node.expression.name.text;

        if (
          callerName === 'api' &&
          ['get', 'post', 'patch', 'put', 'delete'].includes(methodName) &&
          node.arguments.length >= 1
        ) {
          const endpointArg = node.arguments[0];
          apiCalls.push(`${methodName.toUpperCase()} ${endpointArg.getText(sourceFile)}`);
        }
      }

      // 2. Detect JSX buttons: <button ...> or <Button ...>
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tagName = node.tagName.getText(sourceFile);
        if (/button/i.test(tagName)) {
          actionButtons.push(node.getText(sourceFile).slice(0, 120).replace(/\s+/g, ' '));
        }
      }

      // 3. Detect binary expressions checking roles/permissions (e.g. userRole === 'PROJECT_MANAGER')
      if (ts.isBinaryExpression(node)) {
        const exprText = node.getText(sourceFile);
        if (/role|permission|entitlement|can|has/i.test(exprText) && exprText.length < 80) {
          visibilityConditions.push(exprText.replace(/\s+/g, ' '));
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    // Derive approximate route path from Next.js App router file structure
    let pagePath = relative;
    if (relative.startsWith('app/')) {
      pagePath = '/' + relative.replace(/^app\//, '').replace(/\/page\.tsx$/, '');
      if (pagePath === '/page.tsx') pagePath = '/';
    }

    const astHash = crypto.createHash('sha256').update(content.replace(/\r\n/g, '\n')).digest('hex');

    return {
      pagePath,
      sourceFile: `frontend-next/${relative}`,
      apiCalls: Array.from(new Set(apiCalls)),
      actionButtons: actionButtons.slice(0, 20),
      visibilityConditions: Array.from(new Set(visibilityConditions)).slice(0, 10),
      astHash,
    };
  }

  /**
   * Scans frontend-next directory and creates Evidence records for pages.
   */
  static extractFrontendEvidences(frontendDir: string, commitSha: string): Evidence[] {
    if (!fs.existsSync(frontendDir)) return [];
    const evidences: Evidence[] = [];

    const walk = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!['node_modules', '.next', 'dist'].includes(entry.name)) {
            walk(full);
          }
        } else if (entry.name.endsWith('.tsx') && (entry.name === 'page.tsx' || entry.name.endsWith('Modal.tsx') || entry.name.endsWith('Workspace.tsx'))) {
          const fact = this.analyzeTsxFile(full, frontendDir);
          if (fact) {
            evidences.push({
              feature_id: `frontend.page.${fact.pagePath.replace(/[^a-zA-Z0-9]/g, '_')}`,
              source_file: fact.sourceFile,
              symbol_name: fact.pagePath,
              ast_node_hash: fact.astHash,
              route_path: fact.pagePath,
              ui_visibility_condition: fact.visibilityConditions.join('; ') || undefined,
              related_symbols: fact.apiCalls,
              extraction_method: 'TSX',
              source_type: 'FRONTEND_PAGE',
              commit_sha: commitSha,
            });
          }
        }
      }
    };

    walk(frontendDir);
    return evidences;
  }
}
