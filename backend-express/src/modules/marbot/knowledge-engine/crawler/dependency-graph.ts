import type { Evidence } from '../contracts/evidence.schema';

export type SemanticEdgeType =
  | 'UI_CALLS_API'
  | 'ROUTE_USES_SERVICE'
  | 'SERVICE_ACCESSES_MODEL'
  | 'FEATURE_REQUIRES_PERMISSION';

export type DetectionMethod = 'AST_EXACT' | 'HEURISTIC';

export interface SemanticEdge {
  fromId: string;
  toId: string;
  edgeType: SemanticEdgeType;
  provenanceBasis: string;
  detectionMethod: DetectionMethod;
  confidence: number;
  verified: boolean;
}

export interface DependencyNode {
  id: string;
  evidence: Evidence;
  dependencies: string[]; // IDs of nodes this node calls / references
  dependents: string[];   // IDs of nodes calling this node
  outgoingEdges: SemanticEdge[];
  incomingEdges: SemanticEdge[];
}

export interface FullSemanticTrace {
  featureId: string;
  sourceType: string;
  apiRoutes: Evidence[];
  prismaModels: Evidence[];
  requiredPermissions: string[];
  edges: SemanticEdge[];
  astExactEdges: SemanticEdge[];
  heuristicEdges: SemanticEdge[];
  overallConfidence: number;
}

export class DependencyGraph {
  private nodes: Map<string, DependencyNode> = new Map();
  private edges: SemanticEdge[] = [];

  /**
   * Builds the dependency graph with typed semantic edges from collected evidence records.
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
        outgoingEdges: [],
        incomingEdges: [],
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

    const addEdge = (
      fromId: string,
      toId: string,
      edgeType: SemanticEdgeType,
      provenanceBasis: string,
      detectionMethod: DetectionMethod = 'AST_EXACT',
      confidence = 1.0
    ) => {
      const fromNode = graph.nodes.get(fromId);
      const toNode = graph.nodes.get(toId);
      if (!fromNode || !toNode) return;

      if (!fromNode.dependencies.includes(toId)) fromNode.dependencies.push(toId);
      if (!toNode.dependents.includes(fromId)) toNode.dependents.push(fromId);

      const edge: SemanticEdge = {
        fromId,
        toId,
        edgeType,
        provenanceBasis,
        detectionMethod,
        confidence,
        verified: true,
      };

      graph.edges.push(edge);
      fromNode.outgoingEdges.push(edge);
      toNode.incomingEdges.push(edge);
    };

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
              addEdge(id, route.id, 'UI_CALLS_API', `AST API Call: ${apiCall}`, 'AST_EXACT', 1.0);
            }
          }
        }
      }

      // Connect frontend tab nodes to corresponding module routes
      if (node.evidence.feature_id.startsWith('frontend.tab.')) {
        const parts = node.evidence.feature_id.split('.');
        const mod = (parts[2] || '').toLowerCase();
        const tabKey = (parts[3] || '').toLowerCase().replace(/_/g, '-');

        for (const route of routeNodesByMethodAndPath) {
          const isModMatch =
            route.id.toLowerCase().startsWith(mod) || route.normPath.startsWith(`/${mod}`);
          if (isModMatch) {
            // Explicit endpoint match
            if (
              route.normPath === `/${tabKey}` ||
              route.normPath.endsWith(`/${tabKey}`) ||
              (tabKey === 'inbox' && (route.normPath === '/inbox' || route.normPath.startsWith('/inbox/')))
            ) {
              addEdge(
                id,
                route.id,
                'UI_CALLS_API',
                `Exact tab endpoint: ${tabKey} -> ${route.normPath}`,
                'AST_EXACT',
                0.95
              );
            } else if (
              (tabKey === 'inbox' && (route.normPath.includes('conversations') || route.normPath.includes('customer-inquiries'))) ||
              (tabKey === 'fundings' && route.normPath.includes('funding')) ||
              (tabKey === 'deals' && (route.normPath.includes('deal') || route.normPath.includes('lead'))) ||
              (tabKey === 'billing' && (route.normPath.includes('billing') || route.normPath.includes('invoice'))) ||
              (tabKey === 'tickets' && route.normPath.includes('ticket'))
            ) {
              // Heuristic related domain match
              addEdge(
                id,
                route.id,
                'UI_CALLS_API',
                `Heuristic related domain: ${tabKey} -> ${route.normPath}`,
                'HEURISTIC',
                0.70
              );
            }
          }
        }
      }

      // Connect backend routes to referenced Prisma models and permissions
      if (node.evidence.source_type === 'BACKEND_ROUTE') {
        // Permission edge
        if (node.evidence.backend_authorization_guard) {
          addEdge(
            id,
            id,
            'FEATURE_REQUIRES_PERMISSION',
            `Middleware Guard AST: ${node.evidence.backend_authorization_guard}`,
            'AST_EXACT',
            1.0
          );
        }

        const related = node.evidence.related_symbols || [];
        for (const sym of related) {
          const symLower = sym.toLowerCase();
          for (const [modelName, modelId] of prismaModelMap.entries()) {
            if (symLower.includes(modelName) || symLower.includes(`model:${modelName}`)) {
              addEdge(
                id,
                modelId,
                'SERVICE_ACCESSES_MODEL',
                `Prisma Schema AST: ${modelName}`,
                'AST_EXACT',
                1.0
              );
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
   * Returns all semantic typed edges in the graph.
   */
  getAllSemanticEdges(): SemanticEdge[] {
    return this.edges;
  }

  /**
   * Finds all backend routes linked to a given frontend page.
   */
  findRoutesForPage(pageFeatureId: string): Evidence[] {
    const node = this.nodes.get(pageFeatureId);
    if (!node) return [];
    return node.dependencies
      .map((depId) => this.nodes.get(depId)?.evidence)
      .filter((ev): ev is Evidence => ev !== undefined && ev.source_type === 'BACKEND_ROUTE');
  }

  /**
   * Traces the complete semantic chain from Frontend -> Route -> Service/Model -> Permissions,
   * categorizing edges into AST_EXACT and HEURISTIC with calculated overall confidence.
   */
  traceFullChain(featureId: string): FullSemanticTrace | null {
    const rootNode = this.nodes.get(featureId);
    if (!rootNode) return null;

    const apiRoutes: Evidence[] = [];
    const prismaModels: Evidence[] = [];
    const requiredPermissions: string[] = [];
    const edges: SemanticEdge[] = [];
    const astExactEdges: SemanticEdge[] = [];
    const heuristicEdges: SemanticEdge[] = [];

    const visited = new Set<string>();
    const queue: string[] = [featureId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const node = this.nodes.get(currentId);
      if (!node) continue;

      for (const edge of node.outgoingEdges) {
        edges.push(edge);
        if (edge.detectionMethod === 'AST_EXACT') {
          astExactEdges.push(edge);
        } else {
          heuristicEdges.push(edge);
        }

        if (edge.edgeType === 'FEATURE_REQUIRES_PERMISSION') {
          requiredPermissions.push(edge.provenanceBasis.replace(/^Middleware Guard AST:\s*/, ''));
        }
        if (!visited.has(edge.toId)) {
          queue.push(edge.toId);
        }
      }

      if (node.evidence.source_type === 'BACKEND_ROUTE' && currentId !== featureId) {
        apiRoutes.push(node.evidence);
        if (node.evidence.backend_authorization_guard) {
          requiredPermissions.push(node.evidence.backend_authorization_guard);
        }
      } else if (node.evidence.source_type === 'PRISMA_MODEL') {
        prismaModels.push(node.evidence);
      }
    }

    const totalConfidence = edges.reduce((acc, e) => acc + e.confidence, 0);
    const overallConfidence = edges.length > 0 ? Number((totalConfidence / edges.length).toFixed(2)) : 0;

    return {
      featureId,
      sourceType: rootNode.evidence.source_type,
      apiRoutes,
      prismaModels,
      requiredPermissions: Array.from(new Set(requiredPermissions)),
      edges,
      astExactEdges,
      heuristicEdges,
      overallConfidence,
    };
  }
}


