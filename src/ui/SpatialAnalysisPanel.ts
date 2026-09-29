import { graphToCsv } from '../analysis/ReachabilityGraphBuilder';
import type { GraphBuildProgress, SpatialGraph } from '../analysis/GraphTypes';
import { visibilityMatrixToCsv } from '../analysis/VisibilityMatrix';
import type { VisibilityConfig, VisibilityMatrixResult } from '../analysis/VisibilityTypes';
import type { SpatialPointType, SpatialSelectionMode } from '../spatial/SpatialPoint';
import type { RoadTraversalProfileName } from '../roads/RoadTraversalProfile';
import type { RoadDebugKind } from '../roads/RoadNetworkDebugLayer';
import { FloatingPanel } from './FloatingPanel';

export interface VisibilityAnalysisInput extends VisibilityConfig {
  observerCount: number;
  targetCount: number;
}

export interface GraphAnalysisInput {
  nodeCount: number;
  maxRoadSnapDistance: number;
  traversalProfile: RoadTraversalProfileName;
}

export interface SpatialAnalysisPanelActions {
  startSelection(type: SpatialPointType, requiredCount: number, heightOffset: number, maxRoadSnapDistance?: number, traversalProfile?: RoadTraversalProfileName): void;
  stopSelection(): void;
  removeLast(type: SpatialPointType): void;
  clearPoints(type: SpatialPointType): void;
  computeVisibility(input: VisibilityAnalysisInput): void;
  clearVisibilityResult(): void;
  buildGraph(input: GraphAnalysisInput): void;
  cancelGraphBuild(): void;
  clearGraphResult(): void;
  toggleRoadDebug(kind: RoadDebugKind, visible: boolean): void;
}

export class SpatialAnalysisPanel {
  private readonly root = document.createElement('aside');
  private readonly values = new Map<string, HTMLElement>();
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private pointCounts = { observers: 0, targets: 0, nodes: 0 };
  private visibilityResult?: VisibilityMatrixResult;
  private graphResult?: SpatialGraph;

  constructor(host: HTMLElement, private readonly actions: SpatialAnalysisPanelActions) {
    this.root.className = 'analysis-panel';
    this.root.innerHTML = `
      <div class="analysis-heading"><div><span class="eyebrow">SPATIAL ANALYSIS / V0.6-B2</span><h2>Visibility & Reachability</h2></div><span>NO MST</span></div>
      <details class="analysis-section" open><summary>Visibility Analysis</summary>
        <div class="analysis-grid">
          ${numberField('observer-count', 'Observer Count', 2, 1, 20, 1)}
          ${numberField('target-count', 'Target Count', 2, 1, 20, 1)}
          ${numberField('observer-height', 'Observer Height · m', 1.5, 0, 100, 0.1)}
          ${numberField('target-height', 'Target Height · m', 1.5, 0, 100, 0.1)}
        </div>
        ${numberField('visibility-epsilon', 'Ray Epsilon · m', 0.01, 0, 1, 0.01)}
        <div class="analysis-select-row"><button data-analysis-action="select-observers">Select Observers</button><strong data-analysis-value="observers">0 / 2</strong><button data-analysis-action="undo-observer">Undo</button><button data-analysis-action="clear-observers">Clear</button></div>
        <div class="analysis-select-row"><button data-analysis-action="select-targets">Select Targets</button><strong data-analysis-value="targets">0 / 2</strong><button data-analysis-action="undo-target">Undo</button><button data-analysis-action="clear-targets">Clear</button></div>
        <div class="analysis-actions"><button data-analysis-action="compute-visibility" class="primary">Compute Visibility</button><button data-analysis-action="clear-visibility">Clear Result</button></div>
        <div class="analysis-status" data-analysis-value="visibility-status">Select observer and target points.</div>
        <div class="matrix-viewer" data-analysis-matrix="visibility"></div>
        <div class="analysis-actions"><button data-analysis-action="export-visibility-json" disabled>Export JSON</button><button data-analysis-action="export-visibility-csv" disabled>Export CSV</button></div>
      </details>
      <details class="analysis-section"><summary>Reachability Graph</summary>
        <div class="analysis-grid">
          ${numberField('node-count', 'Node Count', 4, 2, 30, 1)}
          ${numberField('snap-distance', 'Max Road Snap · m', 10, 0, 100, 0.5)}
        </div>
        <label class="field"><span>Traversal Profile</span><select data-analysis-select="traversal-profile"><option value="pedestrian">pedestrian</option><option value="vehicle">vehicle</option><option value="all">all</option></select></label>
        <div class="analysis-select-row"><button data-analysis-action="select-nodes">Select Graph Nodes</button><strong data-analysis-value="nodes">0 / 4</strong><button data-analysis-action="undo-node">Undo</button><button data-analysis-action="clear-nodes">Clear</button></div>
        <div class="analysis-actions"><button data-analysis-action="build-graph" class="primary">Build Full Graph</button><button data-analysis-action="cancel-graph" disabled>Cancel</button></div>
        <div class="analysis-status" data-analysis-value="graph-status">All reachable pairs are retained. No MST.</div>
        <div class="matrix-viewer" data-analysis-matrix="adjacency"></div>
        <div class="matrix-viewer" data-analysis-matrix="cost"></div>
        <div class="analysis-debug-grid">
          ${debugToggle('nodes', 'Show Road Graph Nodes')}${debugToggle('edges', 'Show Road Graph Edges')}${debugToggle('intersections', 'Show Intersections')}${debugToggle('snap', 'Show Road Snap')}${debugToggle('lengths', 'Show Road Edge Length')}
        </div>
        <div class="analysis-actions"><button data-analysis-action="clear-graph">Clear Result</button><button data-analysis-action="export-graph-json" disabled>Export JSON</button><button data-analysis-action="export-graph-csv" disabled>Export CSV</button></div>
      </details>
      <button class="wide" data-analysis-action="stop-selection">Stop Point Selection</button>`;
    host.append(this.root);
    new FloatingPanel(this.root, { id: 'analysis', title: '空间分析', icon: '⌬', headingSelector: '.analysis-heading' });
    this.root.querySelectorAll<HTMLElement>('[data-analysis-value]').forEach((element) => this.values.set(element.dataset.analysisValue ?? '', element));
    this.root.querySelectorAll<HTMLButtonElement>('[data-analysis-action]').forEach((button) => this.buttons.set(button.dataset.analysisAction ?? '', button));
    this.bindActions(); this.bindCountUpdates();
  }

  getVisibilityInput(): VisibilityAnalysisInput {
    return {
      observerCount: this.integer('observer-count', 1, 20), targetCount: this.integer('target-count', 1, 20),
      observerHeightOffset: this.number('observer-height', 0, 100), targetHeightOffset: this.number('target-height', 0, 100),
      visibilityEpsilon: this.number('visibility-epsilon', 0, 1),
    };
  }

  getGraphInput(): GraphAnalysisInput { return { nodeCount: this.integer('node-count', 2, 30), maxRoadSnapDistance: this.number('snap-distance', 0, 100), traversalProfile: (this.root.querySelector('[data-analysis-select="traversal-profile"]') as HTMLSelectElement).value as RoadTraversalProfileName }; }

  showPointFeedback(mode: SpatialSelectionMode, reason: string, valid: boolean): void {
    const scope = mode === 'graph-node' ? 'graph-status' : 'visibility-status';
    this.set(scope, valid ? 'Valid physical ground point.' : `Invalid Point · ${reason}`);
  }

  setPointCounts(counts: { observers: number; targets: number; nodes: number }, mode: SpatialSelectionMode = 'none'): void {
    this.pointCounts = { ...counts }; this.refreshCountLabels();
    this.root.querySelectorAll('[data-analysis-action^="select-"]').forEach((button) => button.classList.remove('active'));
    const action = mode === 'observer' ? 'select-observers' : mode === 'target' ? 'select-targets' : mode === 'graph-node' ? 'select-nodes' : '';
    if (action) this.button(action).classList.add('active');
  }

  showVisibilityResult(result: VisibilityMatrixResult): void {
    this.visibilityResult = result; this.set('visibility-status', `${result.observerIds.length} × ${result.targetIds.length} · 1 visible / 0 blocked`);
    this.renderMatrix('visibility', 'Visibility Matrix', result.observerIds, result.targetIds, result.matrix.map((row) => row.map(String)));
    this.button('export-visibility-json').disabled = false; this.button('export-visibility-csv').disabled = false;
  }

  clearVisibilityResult(): void {
    this.visibilityResult = undefined; this.matrix('visibility').replaceChildren();
    this.set('visibility-status', 'Select observer and target points.');
    this.button('export-visibility-json').disabled = true; this.button('export-visibility-csv').disabled = true;
  }

  setGraphProgress(progress: GraphBuildProgress): void {
    this.set('graph-status', `Building Graph · ${progress.completedPairs} / ${progress.totalPairs} pairs`);
    this.button('build-graph').disabled = progress.completedPairs < progress.totalPairs;
    this.button('cancel-graph').disabled = progress.completedPairs >= progress.totalPairs;
  }

  showGraphResult(result: SpatialGraph): void {
    this.graphResult = result; this.button('build-graph').disabled = false; this.button('cancel-graph').disabled = true;
    this.set('graph-status', `${result.nodes.length} nodes · ${result.edges.length} reachable edges · undirected · no MST`);
    const ids = result.nodes.map((node) => node.id);
    this.renderMatrix('adjacency', 'Adjacency Matrix', ids, ids, result.adjacencyMatrix.map((row) => row.map(String)));
    this.renderMatrix('cost', 'Cost Matrix · metres', ids, ids, result.costMatrix.map((row) => row.map((value) => value === null ? '∞' : value.toFixed(2))));
    this.button('export-graph-json').disabled = false; this.button('export-graph-csv').disabled = false;
  }

  showError(scope: 'visibility' | 'graph', error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.set(`${scope}-status`, `ERROR · ${message}`);
    if (scope === 'graph') { this.button('build-graph').disabled = false; this.button('cancel-graph').disabled = true; }
  }

  clearGraphResult(): void {
    this.graphResult = undefined; this.matrix('adjacency').replaceChildren(); this.matrix('cost').replaceChildren();
    this.set('graph-status', 'All reachable pairs are retained. No MST.');
    this.button('build-graph').disabled = false; this.button('cancel-graph').disabled = true;
    this.button('export-graph-json').disabled = true; this.button('export-graph-csv').disabled = true;
  }

  resetForTerrain(): void { this.clearVisibilityResult(); this.clearGraphResult(); this.setPointCounts({ observers: 0, targets: 0, nodes: 0 }); }

  private bindActions(): void {
    this.button('select-observers').onclick = () => this.tryAction('visibility', () => { const input = this.getVisibilityInput(); this.actions.startSelection('observer', input.observerCount, input.observerHeightOffset); });
    this.button('select-targets').onclick = () => this.tryAction('visibility', () => { const input = this.getVisibilityInput(); this.actions.startSelection('target', input.targetCount, input.targetHeightOffset); });
    this.button('select-nodes').onclick = () => this.tryAction('graph', () => { const input = this.getGraphInput(); this.actions.startSelection('graph-node', input.nodeCount, 0, input.maxRoadSnapDistance, input.traversalProfile); });
    this.button('stop-selection').onclick = this.actions.stopSelection;
    this.button('undo-observer').onclick = () => this.actions.removeLast('observer'); this.button('undo-target').onclick = () => this.actions.removeLast('target'); this.button('undo-node').onclick = () => this.actions.removeLast('graph-node');
    this.button('clear-observers').onclick = () => this.actions.clearPoints('observer'); this.button('clear-targets').onclick = () => this.actions.clearPoints('target'); this.button('clear-nodes').onclick = () => this.actions.clearPoints('graph-node');
    this.button('compute-visibility').onclick = () => this.tryAction('visibility', () => this.actions.computeVisibility(this.getVisibilityInput())); this.button('clear-visibility').onclick = this.actions.clearVisibilityResult;
    this.button('build-graph').onclick = () => this.tryAction('graph', () => this.actions.buildGraph(this.getGraphInput())); this.button('cancel-graph').onclick = this.actions.cancelGraphBuild; this.button('clear-graph').onclick = this.actions.clearGraphResult;
    this.button('export-visibility-json').onclick = () => this.visibilityResult && download(`visibility-${this.visibilityResult.terrainId}.json`, JSON.stringify(this.visibilityResult, null, 2), 'application/json');
    this.button('export-visibility-csv').onclick = () => this.visibilityResult && download(`visibility-${this.visibilityResult.terrainId}.csv`, visibilityMatrixToCsv(this.visibilityResult), 'text/csv');
    this.button('export-graph-json').onclick = () => this.graphResult && download(`reachability-${this.graphResult.terrainId}.json`, JSON.stringify(this.graphResult, null, 2), 'application/json');
    this.button('export-graph-csv').onclick = () => this.graphResult && download(`reachability-${this.graphResult.terrainId}.csv`, graphToCsv(this.graphResult), 'text/csv');
    this.root.querySelectorAll<HTMLInputElement>('[data-road-debug]').forEach((input) => { input.onchange = () => this.actions.toggleRoadDebug(input.dataset.roadDebug as RoadDebugKind, input.checked); });
  }

  private bindCountUpdates(): void {
    for (const key of ['observer-count', 'target-count', 'node-count']) this.input(key).oninput = () => this.refreshCountLabels();
  }

  private refreshCountLabels(): void {
    this.set('observers', `${this.pointCounts.observers} / ${displayCount(this.input('observer-count').value)}`);
    this.set('targets', `${this.pointCounts.targets} / ${displayCount(this.input('target-count').value)}`);
    this.set('nodes', `${this.pointCounts.nodes} / ${displayCount(this.input('node-count').value)}`);
  }

  private tryAction(scope: 'visibility' | 'graph', action: () => void): void { try { action(); } catch (error) { this.showError(scope, error); } }

  private renderMatrix(key: string, title: string, rows: string[], columns: string[], values: string[][]): void {
    const host = this.matrix(key); const heading = document.createElement('strong'); heading.textContent = title;
    const table = document.createElement('table'); const head = table.createTHead().insertRow(); head.append(document.createElement('th'));
    columns.forEach((column) => { const cell = document.createElement('th'); cell.textContent = column; head.append(cell); });
    const body = table.createTBody(); rows.forEach((row, rowIndex) => { const tr = body.insertRow(); const label = document.createElement('th'); label.textContent = row; tr.append(label); values[rowIndex].forEach((value) => { const cell = tr.insertCell(); cell.textContent = value; }); });
    host.replaceChildren(heading, table);
  }

  private input(key: string): HTMLInputElement { return this.root.querySelector(`[data-analysis-input="${key}"]`) as HTMLInputElement; }
  private button(key: string): HTMLButtonElement { return this.buttons.get(key)!; }
  private matrix(key: string): HTMLElement { return this.root.querySelector(`[data-analysis-matrix="${key}"]`) as HTMLElement; }
  private set(key: string, value: string): void { const element = this.values.get(key); if (element) element.textContent = value; }
  private number(key: string, min: number, max: number): number { const value = Number(this.input(key).value); if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${key} must be ${min}…${max}.`); return value; }
  private integer(key: string, min: number, max: number): number { const value = this.number(key, min, max); if (!Number.isInteger(value)) throw new Error(`${key} must be an integer.`); return value; }
}

function numberField(key: string, label: string, value: number, min: number, max: number, step: number): string {
  return `<label class="field"><span>${label}</span><input data-analysis-input="${key}" type="number" value="${value}" min="${min}" max="${max}" step="${step}"></label>`;
}
function debugToggle(key: RoadDebugKind, label: string): string { return `<label class="check-row"><input type="checkbox" data-road-debug="${key}"><span>${label}</span></label>`; }
function displayCount(value: string): string { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? String(parsed) : '?'; }
function download(filename: string, content: string, type: string): void { const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0); }
