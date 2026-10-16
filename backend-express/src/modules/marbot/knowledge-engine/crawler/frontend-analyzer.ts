import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Evidence } from '../contracts/evidence.schema';

export interface FrontendTabFact {
  id: string;
  label: string;
  module?: string;
}

export interface FrontendPageFact {
  pagePath: string;
  sourceFile: string;
  moduleCode: string;
  pageTitle?: string;
  tabs: FrontendTabFact[];
  apiCalls: string[];
  actionButtons: string[];
  visibilityConditions: string[];
  astHash: string;
}

export class FrontendAnalyzer {
  /**
   * Scans a TSX file to extract API endpoints invoked, buttons rendered, tabs, and conditional guards.
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
    const tabs: FrontendTabFact[] = [];
    let pageTitle: string | undefined;

    // Detect Tab objects: e.g. { id: "inbox", label: "Customer Inbox" }
    const tabMatchRegex = /\{\s*id:\s*["']([^"']+)["'],\s*label:\s*["']([^"']+)["'](?:,\s*icon:[^,}]+)?(?:,\s*module:\s*["']([^"']+)["'])?/g;
    let match: RegExpExecArray | null;
    while ((match = tabMatchRegex.exec(content)) !== null) {
      if (match[1] && match[2] && match[1].length < 40 && match[2].length < 60) {
        tabs.push({ id: match[1], label: match[2], module: match[3] });
      }
    }

    const h1Match = content.match(/<h1[^>]*>([^<{]+)<\/h1>/i);
    if (h1Match) pageTitle = h1Match[1].trim();

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

    // Derive approximate route path and module code from Next.js App router file structure
    let pagePath = '/' + relative;
    let moduleCode = 'GENERAL';

    if (relative.startsWith('app/')) {
      const cleanRel = relative.replace(/^app\/(?:\(app\)\/)?/, '');
      const parts = cleanRel.split('/');
      const firstSegment = parts[0]?.toLowerCase() || '';

      const KNOWN_MODULES = [
        'crm',
        'finance',
        'projects',
        'tasks',
        'reporting',
        'management-reports',
        'administration',
        'requests',
        'resources',
        'dashboard',
      ];

      if (KNOWN_MODULES.includes(firstSegment)) {
        moduleCode = firstSegment.replace(/-/g, '_').toUpperCase();
        pagePath = '/' + firstSegment;
      } else {
        moduleCode = 'GENERAL';
        pagePath = '/' + cleanRel.replace(/(?:\/page)?\.tsx$/, '').replace(/\/[^/]+(?:Client|Tabs|Settings|Center|Guide)\.tsx$/, '');
      }
    } else if (relative.startsWith('components/')) {
      const parts = relative.replace(/^components\//, '').split('/');
      const firstSegment = parts[0]?.toLowerCase() || '';
      const KNOWN_MODULES = [
        'crm',
        'finance',
        'projects',
        'tasks',
        'reporting',
        'management-reports',
        'administration',
        'requests',
        'resources',
        'executive',
      ];
      if (KNOWN_MODULES.includes(firstSegment)) {
        moduleCode = firstSegment === 'executive' ? 'REPORTING' : firstSegment.replace(/-/g, '_').toUpperCase();
        pagePath = '/' + (firstSegment === 'executive' ? 'reporting' : firstSegment);
      } else {
        moduleCode = 'GENERAL';
        pagePath = '/';
      }
    }

    if (!pagePath.startsWith('/')) pagePath = '/' + pagePath;
    if (pagePath === '/page' || pagePath === '/(app)' || pagePath === '') pagePath = '/';

    const astHash = crypto.createHash('sha256').update(content.replace(/\r\n/g, '\n')).digest('hex');

    return {
      pagePath,
      sourceFile: `frontend-next/${relative}`,
      moduleCode,
      pageTitle,
      tabs,
      apiCalls: Array.from(new Set(apiCalls)),
      actionButtons: actionButtons.slice(0, 20),
      visibilityConditions: Array.from(new Set(visibilityConditions)).slice(0, 10),
      astHash,
    };
  }

  /**
   * Scans frontend-next directory and creates Evidence records for pages and tabs.
   */
  static extractFrontendEvidences(frontendDir: string, commitSha: string): Evidence[] {
    if (!fs.existsSync(frontendDir)) return [];
    const evidences: Evidence[] = [];

    const isTargetFile = (name: string) => {
      if (!name.endsWith('.tsx')) return false;
      if (name.endsWith('.test.tsx') || name.endsWith('.spec.tsx')) return false;
      return (
        name === 'page.tsx' ||
        name.endsWith('Client.tsx') ||
        name.endsWith('Center.tsx') ||
        name.endsWith('Settings.tsx') ||
        name.endsWith('Guide.tsx') ||
        name.endsWith('Modal.tsx') ||
        name.endsWith('Workspace.tsx')
      );
    };

    const walk = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!['node_modules', '.next', 'dist'].includes(entry.name)) {
            walk(full);
          }
        } else if (isTargetFile(entry.name)) {
          const fact = this.analyzeTsxFile(full, frontendDir);
          if (fact) {
            const componentName = path.basename(fact.sourceFile, '.tsx').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            const viewFeatureId = `frontend.view.${fact.moduleCode.toLowerCase()}.${componentName}`;
            const cleanTitle = fact.pageTitle || `${componentName.replace(/_/g, ' ')} (${fact.moduleCode})`;

            // 1. Evidence for the page / client view
            evidences.push({
              feature_id: viewFeatureId,
              source_file: fact.sourceFile,
              symbol_name: cleanTitle,
              ast_node_hash: fact.astHash,
              route_path: fact.pagePath,
              ui_visibility_condition: fact.visibilityConditions.join('; ') || undefined,
              related_symbols: [
                ...fact.apiCalls,
                fact.pagePath,
                fact.moduleCode,
                ...fact.tabs.map((t) => t.label),
              ],
              extraction_method: 'TSX',
              source_type: 'FRONTEND_PAGE',
              commit_sha: commitSha,
            });

            // 2. Evidence for each discovered UI tab
            for (const tab of fact.tabs) {
              const tabHash = crypto
                .createHash('sha256')
                .update(`${fact.astHash}-${tab.id}-${tab.label}`)
                .digest('hex');
              evidences.push({
                feature_id: `frontend.tab.${fact.moduleCode.toLowerCase()}.${tab.id.replace(/[^a-zA-Z0-9]/g, '_')}`,
                source_file: fact.sourceFile,
                symbol_name: `Tab: ${tab.label} (${fact.moduleCode})`,
                ast_node_hash: tabHash,
                route_path: fact.pagePath,
                ui_visibility_condition: fact.visibilityConditions.join('; ') || undefined,
                related_symbols: [tab.label, fact.pagePath, `tab:${tab.id}`, fact.moduleCode],
                extraction_method: 'TSX',
                source_type: 'FRONTEND_PAGE',
                commit_sha: commitSha,
              });
            }
          }
        }
      }
    };

    walk(frontendDir);
    return evidences;
  }
}
