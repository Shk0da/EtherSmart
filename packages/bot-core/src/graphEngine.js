/**
 * Build directed graph edges from config and find simple cycles.
 */

function buildGraphEdges(config) {
  return config.graphEdges || [];
}

/**
 * DFS cycle finder returning edge-id paths that start and end at loanToken.
 */
function findCycles(edges, loanToken, minSteps = 3, maxSteps = 4) {
  const cycles = [];
  const byFrom = new Map();
  for (const e of edges) {
    const list = byFrom.get(e.tokenIn.toLowerCase()) || [];
    list.push(e);
    byFrom.set(e.tokenIn.toLowerCase(), list);
  }

  function dfs(current, path, visitedEdgeIds) {
    if (
      path.length >= minSteps &&
      current.toLowerCase() === loanToken.toLowerCase()
    ) {
      cycles.push(path.map((e) => ({ ...e })));
      return;
    }
    if (path.length >= maxSteps) return;

    const nextEdges = byFrom.get(current.toLowerCase()) || [];
    for (const edge of nextEdges) {
      if (visitedEdgeIds.has(edge.id)) continue;
      visitedEdgeIds.add(edge.id);
      path.push(edge);
      dfs(edge.tokenOut, path, visitedEdgeIds);
      path.pop();
      visitedEdgeIds.delete(edge.id);
    }
  }

  dfs(loanToken, [], new Set());
  return cycles;
}

module.exports = { buildGraphEdges, findCycles };
