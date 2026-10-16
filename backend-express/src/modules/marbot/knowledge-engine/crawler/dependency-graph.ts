import type { Evidence } from '../contracts/evidence.schema';

export interface DependencyNode {
  id: string;
  evidence: Evidence;
  dependencies: string[]; // IDs of nodes this node calls / references
  dependents: string[];   // IDs of nodes calling this node
}

export class DependencyGraph {
  private nodes: Map<string, DependencyNode> = new Map();

  /**
   * Builds the dependency graph from a list of collected evidence records.
   */
  static fromEvidences(evidences: Evidence[]): DependencyGraph {
    const graph = new DependencyGraph();

    for (const ev of evidences) {
      const id = ev.feature_id;
      graph.nodes.set(id, {
        id,
        evidence: ev,
        dependencies: [],
        dependents: [],
      });
    }

    const normalizePath = (p: string) =>
      p
        .replace(/['"`]/g, '')
        .replace(/^\/api\/v1/, '')
        .replace(/\$\{[^}]+\}/g, '')
        .replace(/\/$/, '')
        .toLowerCase();

    // Pre-index backend routes and prisma models for high-speed edge linking
    const routeNodesByMethodAndPath: Array<{ id: string; method: string; normPath: string }> = [];
    const prismaModelMap = new Map<string, string>(); // modelName -> node id

    for (const [id, node] of graph.nodes.entries()) {
      if (node.evidence.source_type === 'BACKEND_ROUTE') {
        const method = (node.evidence.route_method || '').toUpperCase();
        const normPath = normalizePath(node.evidence.route_path || '');
        if (normPath) {
          routeNodesByMethodAndPath.push({ id, method, normPath });
        }
      } else if (node.evidence.source_type === 'PRISMA_MODEL') {
        const modelName = (node.evidence.symbol_name || '').toLowerCase();
        if (modelName) {
          prismaModelMap.set(modelName, id);
        }
      }
    }

    // Connect edges between frontend pages and backend routes
    for (const [id, node] of graph.nodes.entries()) {
      if (node.evidence.source_type === 'FRONTEND_PAGE') {
        const related = node.evidence.related_symbols || [];
        for (const apiCall of related) {
          const apiCallUpper = apiCall.toUpperCase();
          const cleanApiCallPath = normalizePath(apiCall.replace(/^[A-Z]+\s+/, ''));
          if (cleanApiCallPath.length <= 2) continue;

          for (const route of routeNodesByMethodAndPath) {
            if (
              apiCallUpper.includes(route.method) &&
              (cleanApiCallPath === route.normPath ||
                cleanApiCallPath.startsWith(route.normPath) ||
                route.normPath.startsWith(cleanApiCallPath))
            ) {
              if (!node.dependencies.includes(route.id)) node.dependencies.push(route.id);
              const routeNode = graph.nodes.get(route.id);
              if (routeNode && !routeNode.dependents.includes(id)) routeNode.dependents.push(id);
            }
          }
        }
      }

      // Connect backend routes to referenced Prisma models
      if (node.evidence.source_type === 'BACKEND_ROUTE') {
        const related = node.evidence.related_symbols || [];
        for (const sym of related) {
          const symLower = sym.toLowerCase();
          for (const [modelName, modelId] of prismaModelMap.entries()) {
            if (symLower.includes(modelName) || symLower.includes(`model:${modelName}`)) {
              if (!node.dependencies.includes(modelId)) node.dependencies.push(modelId);
              const modelNode = graph.nodes.get(modelId);
              if (modelNode && !modelNode.dependents.includes(id)) modelNode.dependents.push(id);
            }
          }
        }
      }
    }

    return graph;
  }

  /**
   * Retrieves a node by feature_id.
   */
  getNode(featureId: string): DependencyNode | undefined {
    return this.nodes.get(featureId);
  }

  /**
   * Returns all nodes in the graph.
   */
  getAllNodes(): DependencyNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Finds all backend routes linked to a given frontend page.
   */
  findRoutesForPage(pageFeatureId: string): Evidence[] {
    const node = this.nodes.get(pageFeatureId);
    if (!node) return [];
    return node.dependencies
      .map((depId) => this.nodes.get(depId)?.evidence)
      .filter((ev): ev is Evidence => ev !== undefined);
  }
}
