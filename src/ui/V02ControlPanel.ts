import type { RuntimeObservation } from '../algorithm/Observation';
import type { DetectedTerrainMesh, TerrainDescriptor, TerrainEditTool, TerrainRuntimeState } from '../terrain/TerrainTypes';

export interface V02PanelActions {
  switchTerrain(id: string): void;
  reloadTerrain(): void;
  focusTerrain(): void;
  reset(): void;
  deployAgent(): void;
  focusAgent(): void;
  setFrameFov(degrees: number): void;
  setCapsuleHeight(metres: number): void;
  setEditTool(tool: TerrainEditTool | null): void;
  setBrush(radius: number, strength: number): void;
  placeTower(): void;
  addRestricted(): void;
  undoRestrictedPoint(): void;
  cancelRestricted(): void;
  clearRestricted(): void;
  exportTerrain(): void;
  exportSemantic(): void;
  exportAssets(): void;
  toggleNav(visible: boolean): void;
  togglePhysics(visible: boolean): void;
  toggleSemantic(visible: boolean): void;
  toggleBuildings(visible: boolean): void;
  toggleRoads(visible: boolean): void;
  toggleBuildingCollision(visible: boolean): void;
  toggleRoadWidth(visible: boolean): void;
  toggleTerrainSamples(visible: boolean): void;
  setMeshRole(name: string, role: DetectedTerrainMesh['role']): void;
}

export class V02ControlPanel {
  private readonly root = document.createElement('aside');
  private readonly values = new Map<string, HTMLElement>();
  private readonly terrainSelect: HTMLSelectElement;
  private readonly loading: HTMLElement;
  private readonly notice: HTMLElement;
  private noticeTimer?: number;
  private readonly meshMapping: HTMLElement;
  private readonly setMeshRoleAction: V02PanelActions['setMeshRole'];

  constructor(host: HTMLElement, terrains: readonly TerrainDescriptor[], actions: V02PanelActions) {
    this.root.className = 'control-panel v02-panel';
    this.root.innerHTML = `
      <div class="panel-heading"><div><span class="eyebrow">SPATIAL LAB / V0.3</span><h1>算法空间仿真</h1></div><span class="live-dot">LIVE</span></div>
      <section><h2>Simulation</h2><div class="metrics compact">${this.metric('fps','FPS')}${this.metric('agent','AGENT')}${this.metric('target','TARGET')}${this.metric('path','PATH')}</div><div class="row"><button data-action="reset" class="primary">Reset Simulation</button><button data-action="deploy-agent" aria-pressed="false">重新部署胶囊体</button></div><div class="row"><button data-action="focus-agent">定位胶囊体</button></div></section>
      <section><h2>画面与胶囊体</h2><label class="size-control"><span>画幅大小 <small>相机视角 · °</small></span><span class="size-inputs"><input data-control="frame-range" type="range" min="25" max="90" step="1" value="52" aria-label="画幅大小滑块"><input data-control="frame-number" type="number" min="25" max="90" step="1" value="52" aria-label="画幅大小数值"></span></label><label class="size-control"><span>胶囊大小 <small>高度 · 米</small></span><span class="size-inputs"><input data-control="capsule-range" type="range" min="0.9" max="5.4" step="0.1" value="1.8" aria-label="胶囊大小滑块"><input data-control="capsule-number" type="number" min="0.9" max="5.4" step="0.1" value="1.8" aria-label="胶囊大小数值"></span></label></section>
      <section><h2>Terrain</h2><label class="field"><span>Current Terrain</span><select data-control="terrain">${terrains.map((terrain) => `<option value="${terrain.id}">${terrain.name}</option>`).join('')}</select></label><div class="row"><button data-action="reload">Reload Terrain</button><button data-action="focus">Focus Terrain</button></div><div class="terrain-info"><span data-value="terrainInfo">—</span><span data-value="bounds">—</span><span data-value="height">—</span><span data-value="revision">—</span><span data-value="dirty">—</span><span data-value="meshes">—</span></div><details class="mesh-mapping"><summary>Detected Meshes / Roles</summary><div></div></details></section>
      <section><h2>Edit Terrain</h2><div class="segmented"><button data-tool="raise">Raise</button><button data-tool="lower">Lower</button><button data-tool="flatten">Flatten</button><button data-tool="off">Off</button></div><label class="range">Radius <input data-control="radius" type="range" min="1" max="12" step="0.5" value="3"><output>3</output></label><label class="range">Strength <input data-control="strength" type="range" min="0.05" max="1.5" step="0.05" value="0.45"><output>0.45</output></label><div class="row"><button data-action="exportTerrain">Export Terrain</button><button data-action="exportSemantic">Export Semantic</button></div></section>
      <section><h2>Assets & Regions</h2><div class="row"><button data-action="tower">Place Signal Tower</button><button data-action="region" aria-pressed="false">Add Restricted</button></div><div class="row" data-region-controls hidden><button data-action="undoRegion">撤销上一点</button><button data-action="cancelRegion">取消选区</button></div><div class="row"><button data-action="clearRegion">Clear Regions</button><button data-action="exportAssets">Export Assets</button></div></section>
      <section><h2>Debug</h2><div class="toggle-list">${this.toggle('nav','NavMesh')}${this.toggle('physics','Colliders')}${this.toggle('semantic','Semantic',true)}${this.toggle('buildings','Buildings',true)}${this.toggle('roads','Roads',true)}${this.toggle('buildingCollision','Building Collision',true)}${this.toggle('roadWidth','Road Width Debug')}${this.toggle('terrainSamples','Terrain Height Samples')}</div></section>
      <div class="loading-stage" aria-live="polite"></div><div class="notice" aria-live="polite"></div>`;
    host.append(this.root);
    this.terrainSelect = this.root.querySelector('[data-control="terrain"]') as HTMLSelectElement;
    this.loading = this.root.querySelector('.loading-stage') as HTMLElement;
    this.notice = this.root.querySelector('.notice') as HTMLElement;
    this.meshMapping = this.root.querySelector('.mesh-mapping > div') as HTMLElement;
    this.setMeshRoleAction = actions.setMeshRole;
    this.root.querySelectorAll<HTMLElement>('[data-value]').forEach((element) => this.values.set(element.dataset.value ?? '', element));
    this.terrainSelect.onchange = () => actions.switchTerrain(this.terrainSelect.value);
    this.button('reload').onclick = actions.reloadTerrain; this.button('focus').onclick = actions.focusTerrain; this.button('reset').onclick = actions.reset; this.button('deploy-agent').onclick = actions.deployAgent;
    this.button('focus-agent').onclick = actions.focusAgent;
    this.button('tower').onclick = actions.placeTower; this.button('region').onclick = actions.addRestricted; this.button('undoRegion').onclick = actions.undoRestrictedPoint; this.button('cancelRegion').onclick = actions.cancelRestricted; this.button('clearRegion').onclick = actions.clearRestricted;
    this.button('exportTerrain').onclick = actions.exportTerrain; this.button('exportSemantic').onclick = actions.exportSemantic; this.button('exportAssets').onclick = actions.exportAssets;
    this.root.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => button.onclick = () => { this.root.querySelectorAll('[data-tool]').forEach((item) => item.classList.remove('active')); button.classList.add('active'); actions.setEditTool(button.dataset.tool === 'off' ? null : button.dataset.tool as TerrainEditTool); });
    const radius = this.root.querySelector('[data-control="radius"]') as HTMLInputElement; const strength = this.root.querySelector('[data-control="strength"]') as HTMLInputElement;
    const updateBrush = () => { (radius.nextElementSibling as HTMLOutputElement).value = radius.value; (strength.nextElementSibling as HTMLOutputElement).value = strength.value; actions.setBrush(Number(radius.value), Number(strength.value)); };
    radius.oninput = updateBrush; strength.oninput = updateBrush;
    this.bindSizeControl('frame', 25, 90, 0, actions.setFrameFov);
    this.bindSizeControl('capsule', 0.9, 5.4, 1, actions.setCapsuleHeight);
    (this.root.querySelector('[data-toggle="nav"]') as HTMLInputElement).onchange = (event) => actions.toggleNav((event.currentTarget as HTMLInputElement).checked);
    (this.root.querySelector('[data-toggle="physics"]') as HTMLInputElement).onchange = (event) => actions.togglePhysics((event.currentTarget as HTMLInputElement).checked);
    (this.root.querySelector('[data-toggle="semantic"]') as HTMLInputElement).onchange = (event) => actions.toggleSemantic((event.currentTarget as HTMLInputElement).checked);
    (this.root.querySelector('[data-toggle="buildings"]') as HTMLInputElement).onchange = (event) => actions.toggleBuildings((event.currentTarget as HTMLInputElement).checked);
    (this.root.querySelector('[data-toggle="roads"]') as HTMLInputElement).onchange = (event) => actions.toggleRoads((event.currentTarget as HTMLInputElement).checked);
    (this.root.querySelector('[data-toggle="buildingCollision"]') as HTMLInputElement).onchange = (event) => actions.toggleBuildingCollision((event.currentTarget as HTMLInputElement).checked);
    (this.root.querySelector('[data-toggle="roadWidth"]') as HTMLInputElement).onchange = (event) => actions.toggleRoadWidth((event.currentTarget as HTMLInputElement).checked);
    (this.root.querySelector('[data-toggle="terrainSamples"]') as HTMLInputElement).onchange = (event) => actions.toggleTerrainSamples((event.currentTarget as HTMLInputElement).checked);
  }

  update(fps: number, observation: RuntimeObservation, state?: TerrainRuntimeState, descriptor?: TerrainDescriptor): void {
    this.set('fps', fps.toFixed(0)); this.set('agent', this.vector(observation.agent.position)); this.set('target', observation.target ? this.vector(observation.target.position) : 'NOT SET'); this.set('path', observation.pathStatus.toUpperCase());
    if (state && descriptor) {
      const data = state.terrainData; this.set('terrainInfo', `${descriptor.name} · ${descriptor.source}`); this.set('bounds', `${data.width.toFixed(1)} × ${data.depth.toFixed(1)} m · ${data.rows}²`);
      this.set('height', `height ${data.minHeight.toFixed(2)}…${data.maxHeight.toFixed(2)} m`); this.set('revision', `revision ${data.revision} · towers ${state.placedAssets.length}`);
      this.set('dirty', `dirty ${state.terrainDirty || state.semanticDirty || state.assetsDirty ? 'YES' : 'NO'}`);
      const meshSummary = data.detectedMeshes.slice(0, 8).map((mesh) => `${mesh.name}:${mesh.role}`).join(', ');
      this.set('meshes', `meshes ${meshSummary}${data.detectedMeshes.length > 8 ? ` +${data.detectedMeshes.length - 8} more` : ''}`);
    }
  }
  setActiveTerrain(id: string): void { this.terrainSelect.value = id; }
  setAgentDeploymentActive(active: boolean): void {
    const button = this.button('deploy-agent');
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    button.textContent = active ? '取消重新部署' : '重新部署胶囊体';
  }
  setRegionEditing(active: boolean, count = 0): void {
    const button = this.button('region');
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    button.textContent = active ? `完成选区 (${count} 点)` : 'Add Restricted';
    (this.root.querySelector('[data-region-controls]') as HTMLElement).hidden = !active;
    this.button('undoRegion').disabled = count === 0;
  }
  clearEditToolSelection(): void { this.root.querySelectorAll('[data-tool]').forEach((button) => button.classList.remove('active')); }
  setDetectedMeshes(meshes: DetectedTerrainMesh[], roles: Record<string, DetectedTerrainMesh['role']>): void {
    this.meshMapping.replaceChildren(...meshes.slice(0, 20).map((mesh) => {
      const label = document.createElement('label'); label.className = 'mesh-role';
      const name = document.createElement('span'); name.textContent = mesh.name;
      const select = document.createElement('select');
      for (const role of ['land','water','ignore'] as const) { const option = document.createElement('option'); option.value = role; option.textContent = role; select.append(option); }
      select.value = roles[mesh.name] ?? mesh.role; select.onchange = () => this.setMeshRoleAction(mesh.name, select.value as DetectedTerrainMesh['role']); label.append(name, select); return label;
    }));
  }
  setSwitching(switching: boolean, stage = ''): void { this.root.classList.toggle('switching', switching); this.terrainSelect.disabled = switching; this.loading.textContent = switching ? stage : ''; }
  setStage(stage: string): void { this.loading.textContent = stage; }
  showNotice(message: string, tone: 'info'|'error'|'success' = 'info'): void { window.clearTimeout(this.noticeTimer); this.notice.textContent = message; this.notice.dataset.tone = tone; this.notice.classList.add('visible'); this.noticeTimer = window.setTimeout(() => this.notice.classList.remove('visible'), 5000); }
  private set(key: string, value: string): void { const element = this.values.get(key); if (element) element.textContent = value; }
  private vector(value: {x:number;z:number}): string { return `${value.x.toFixed(1)}, ${value.z.toFixed(1)}`; }
  private metric(key:string,label:string):string { return `<div class="metric"><span>${label}</span><strong data-value="${key}">—</strong></div>`; }
  private toggle(key:string,label:string,checked=false):string { return `<label class="toggle"><span>${label}</span><input type="checkbox" data-toggle="${key}" ${checked?'checked':''}><i></i></label>`; }
  private button(action:string):HTMLButtonElement { return this.root.querySelector(`[data-action="${action}"]`) as HTMLButtonElement; }
  private bindSizeControl(key: string, min: number, max: number, decimals: number, apply: (value: number) => void): void {
    const range = this.root.querySelector(`[data-control="${key}-range"]`) as HTMLInputElement;
    const number = this.root.querySelector(`[data-control="${key}-number"]`) as HTMLInputElement;
    const commit = (value: number) => {
      if (!Number.isFinite(value)) { number.value = range.value; return; }
      const clamped = Math.min(max, Math.max(min, value));
      const normalized = Number(clamped.toFixed(decimals));
      range.value = String(normalized); number.value = String(normalized);
      apply(normalized);
    };
    range.oninput = () => commit(range.valueAsNumber);
    number.onchange = () => commit(number.valueAsNumber);
  }
}
