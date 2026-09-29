import { ALGORITHM_DEFAULTS } from '../algorithm/EnvironmentConfig';
import type { Environment } from '../algorithm/Environment';
import type { ExperimentConfig } from '../algorithm/experiment/ExperimentConfig';
import { ExperimentRunner } from '../algorithm/experiment/ExperimentRunner';
import type { TerrainDescriptor } from '../terrain/TerrainTypes';
import { FloatingPanel } from './FloatingPanel';

export class ExperimentPanel {
  readonly runner: ExperimentRunner;
  private readonly root = document.createElement('aside');
  private readonly runButton: HTMLButtonElement;
  private readonly stopButton: HTMLButtonElement;
  private readonly applyButton: HTMLButtonElement;
  private readonly jsonButton: HTMLButtonElement;
  private readonly csvButton: HTMLButtonElement;
  private readonly status: HTMLElement;

  constructor(host: HTMLElement, environment: Environment, terrains: readonly TerrainDescriptor[]) {
    this.runner = new ExperimentRunner(environment);
    this.root.className = 'control-panel experiment-panel';
    this.root.innerHTML = `
      <div class="panel-heading"><div><span class="eyebrow">ALGORITHM ENVIRONMENT</span><h1>空间优化实验</h1></div><span class="live-dot">V0.3</span></div>
      <section><h2>Experiment</h2>
        <label class="field"><span>Task</span><select disabled><option>Signal Tower Optimization</option></select></label>
        <label class="field"><span>Terrain</span><select data-exp="terrain">${terrains.map((terrain) => `<option value="${terrain.id}">${terrain.name}</option>`).join('')}</select></label>
        <label class="field"><span>Algorithm</span><select disabled><option>Random Search</option></select></label>
        <div class="experiment-grid">
          <label class="field"><span>Seed</span><input data-exp="seed" type="number" value="42"></label>
          <label class="field"><span>Tower Count</span><input data-exp="count" type="number" min="1" max="20" value="5"></label>
          <label class="field"><span>Iterations</span><input data-exp="iterations" type="number" min="1" max="10000" value="100"></label>
          <label class="field"><span>Rendering</span><select data-exp="rendering"><option value="visualization">Visualization</option><option value="fast">Fast</option></select></label>
        </div>
        <div class="row"><button data-exp-action="run" class="primary">Run Experiment</button><button data-exp-action="stop" disabled>Stop</button></div>
      </section>
      <section><h2>Results</h2><div class="experiment-results">
        ${this.result('score','Best Score')}${this.result('coverage','Coverage')}${this.result('overlap','Overlap')}${this.result('towers','Tower Count')}${this.result('cost','Cost')}${this.result('violations','Violations')}
      </div><div class="row"><button data-exp-action="apply" disabled>Apply Best Solution</button><button data-exp-action="json" disabled>Export JSON</button></div><button data-exp-action="csv" class="wide" disabled>Export CSV</button></section>
      <div class="experiment-status" data-exp-status>IDLE</div>`;
    host.append(this.root);
    new FloatingPanel(this.root, { id: 'experiment', title: '空间优化实验', icon: 'Σ' });
    const active = environment.getActiveTerrainId(); if (active) this.select('terrain').value = active;
    this.runButton = this.button('run'); this.stopButton = this.button('stop'); this.applyButton = this.button('apply'); this.jsonButton = this.button('json'); this.csvButton = this.button('csv'); this.status = this.root.querySelector('[data-exp-status]') as HTMLElement;
    this.runButton.onclick = () => void this.run(); this.stopButton.onclick = () => this.runner.stop(); this.applyButton.onclick = () => void this.apply();
    this.jsonButton.onclick = () => this.download(`${this.runner.lastResult?.experimentId ?? 'experiment'}.json`, this.runner.exportJson(), 'application/json');
    this.csvButton.onclick = () => this.download(`${this.runner.lastResult?.experimentId ?? 'experiment'}.csv`, this.runner.exportCsv(), 'text/csv');
  }

  private async run(): Promise<void> {
    this.setRunning(true); this.status.textContent = 'RUNNING';
    const count = this.number('count');
    const config: ExperimentConfig = {
      experimentId: `tower-${this.select('terrain').value}-seed-${this.number('seed')}`,
      terrainId: this.select('terrain').value,
      seed: this.number('seed'),
      algorithm: 'Random Search',
      task: { type: 'SIGNAL_TOWER_OPTIMIZATION', targetTowerCount: count },
      maxSteps: Math.max(20, count * 4),
      iterations: this.number('iterations'),
      rendering: this.select('rendering').value as ExperimentConfig['rendering'],
      objectiveWeights: { ...ALGORITHM_DEFAULTS.objectiveWeights },
    };
    try {
      const result = await this.runner.run(config); const metrics = result.metrics;
      this.value('score', result.bestScore.toFixed(4)); this.value('coverage', `${(metrics.coverageRatio * 100).toFixed(1)}%`); this.value('overlap', `${(metrics.overlapRatio * 100).toFixed(1)}%`); this.value('towers', String(metrics.towerCount)); this.value('cost', metrics.totalCost.toFixed(0)); this.value('violations', String(metrics.constraintViolations));
      this.status.textContent = 'COMPLETED'; this.applyButton.disabled = false; this.jsonButton.disabled = false; this.csvButton.disabled = false;
    } catch (error) { this.status.textContent = this.runner.status; this.status.title = error instanceof Error ? error.message : String(error); }
    finally { this.setRunning(false); }
  }

  private async apply(): Promise<void> { this.applyButton.disabled = true; try { await this.runner.applyBestSolution(); this.status.textContent = 'SOLUTION APPLIED'; } catch (error) { this.status.textContent = 'APPLY FAILED'; this.status.title = error instanceof Error ? error.message : String(error); } finally { this.applyButton.disabled = false; } }
  private setRunning(running: boolean): void { this.runButton.disabled = running; this.stopButton.disabled = !running; }
  private result(key: string, label: string): string { return `<div><span>${label}</span><strong data-result="${key}">—</strong></div>`; }
  private value(key: string, value: string): void { const element = this.root.querySelector(`[data-result="${key}"]`); if (element) element.textContent = value; }
  private select(key: string): HTMLSelectElement { return this.root.querySelector(`[data-exp="${key}"]`) as HTMLSelectElement; }
  private number(key: string): number { return Number((this.root.querySelector(`[data-exp="${key}"]`) as HTMLInputElement).value); }
  private button(key: string): HTMLButtonElement { return this.root.querySelector(`[data-exp-action="${key}"]`) as HTMLButtonElement; }
  private download(filename: string, content: string, type: string): void { const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0); }
}
