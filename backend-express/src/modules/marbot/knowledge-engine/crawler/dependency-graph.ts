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

    // Connect edges between frontend pages and backend routes
    for (const [id, node] of graph.nodes.entries()) {
      if (node.evidence.source_type === 'FRONTEND_PAGE') {
        const related = node.evidence.related_symbols || [];
        for (const apiCall of related) {
          // Find matching backend route node
          for (const [otherId, otherNode] of graph.nodes.entries()) {
            if (otherNode.evidence.source_type === 'BACKEND_ROUTE') {
              const routeMethod = otherNode.evidence.route_method;
              const routePath = otherNode.evidence.route_path;
              if (
                routeMethod &&
                routePath &&
                apiCall.includes(routeMethod) &&
                apiCall.includes(routePath)
              ) {
                node.dependencies.push(otherId);
                otherNode.dependents.push(id);
              }
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
