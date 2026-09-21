import * as THREE from 'three';
import { Agent } from '../agent/Agent';
import { AgentController } from '../agent/AgentController';
import type { RuntimeObservation } from '../algorithm/Observation';
import { AssetPlacementManager } from '../assets/AssetPlacementManager';
import { GeneratedAssetFactory } from '../assets/GeneratedAssetFactory';
import { BuildingLayer } from '../gis/BuildingLayer';
import { RoadLayer } from '../gis/RoadLayer';
import { assertBuildingCollection, assertRoadCollection, buildingSemanticRegions, roadSemanticRegions, type BuildingCollection, type RoadCollection } from '../gis/VectorFeatureTypes';
import type { PlacementValidation } from '../assets/PlacementValidator';
import { SIMULATION, COLORS } from '../config/constants';
import { NavigationDebug } from '../navigation/NavigationDebug';
import { Pathfinder } from '../navigation/Pathfinder';
import { TerrainNavMeshManager } from '../navigation/TerrainNavMeshManager';
import { CharacterController } from '../physics/CharacterController';
import { TerrainPhysicsWorld } from '../physics/TerrainPhysicsWorld';
import { DebugRenderer } from '../render/DebugRenderer';
import { ThreeRenderer } from '../render/ThreeRenderer';
import { SemanticMap } from '../semantic/SemanticMap';
import { RegionEditor } from '../ui/RegionEditor';
import { V02ControlPanel } from '../ui/V02ControlPanel';
import { TerrainCatalog } from '../terrain/TerrainCatalog';
import { chooseAgentSpawn } from '../terrain/AgentSpawn';
import { sampleTerrainHeight, getTerrainSlope, hasTerrainSupport, isExplicitWater, isInferredWater } from '../terrain/TerrainDataUtils';
import { TerrainEditor } from '../terrain/TerrainEditor';
import { TerrainManager, type TerrainLifecycle } from '../terrain/TerrainManager';
import { TerrainStateStore } from '../terrain/TerrainStateStore';
import type { InteractionMode, PlacedAsset, TerrainData, TerrainDescriptor, TerrainEditTool, TerrainRuntimeState } from '../terrain/TerrainTypes';
import { TerrainVisualBuilder, type TerrainVisual } from '../terrain/TerrainVisualBuilder';
import type { Vector3Data } from '../types';
import { FixedTimeStep } from './FixedTimeStep';

interface RuntimeBundle {
  descriptor: TerrainDescriptor;
  state: TerrainRuntimeState;
  visual: TerrainVisual;
  semantics: SemanticMap;
  physics: TerrainPhysicsWorld;
  nav: TerrainNavMeshManager;
  spawn: Vector3Data;
  buildings?: BuildingCollection;
  roads?: RoadCollection;
  buildingLayer?: BuildingLayer;
  roadLayer?: RoadLayer;
  mounted?: {
    agent: Agent;
    character: CharacterController;
    controller: AgentController;
    pathfinder: Pathfinder;
    debug: DebugRenderer;
    navDebug: NavigationDebug;
    editor: TerrainEditor;
    regionEditor: RegionEditor;
    assets: AssetPlacementManager;
  };
}

export class MultiTerrainSimulation {
  readonly fixedStepSeconds = SIMULATION.fixedTimeStep;
  readonly renderer: ThreeRenderer;
  readonly terrainManager: TerrainManager<RuntimeBundle>;
  simulationTime = 0;
  private readonly clock = new THREE.Clock();
  private readonly fixedStep = new FixedTimeStep(SIMULATION.fixedTimeStep);
  private readonly visualBuilder = new TerrainVisualBuilder();
  private readonly stateStore = new TerrainStateStore();
  private readonly panel: V02ControlPanel;
  private readonly targetMarker = this.createTargetMarker();
  private readonly deploymentMarker = new THREE.Mesh(
    new THREE.TorusGeometry(0.8, 0.1, 10, 32),
    new THREE.MeshBasicMaterial({ color: 0x58b98a, depthTest: false }),
  );
  private runtime?: RuntimeBundle;
  private mode: InteractionMode = 'TERRAIN_SWITCHING';
  private target: Vector3Data | null = null;
  private fps = 60;
  private pointerDown?: { x: number; y: number };
  private brushDown = false;
  private assetPreview?: THREE.Group;
  private navVisible = false;
  private physicsVisible = false;
  private semanticVisible = true;
  private buildingsVisible = true;
  private roadsVisible = true;
  private buildingCollisionVisible = true;
  private roadWidthVisible = false;
  private terrainSamplesVisible = false;
  private renderingEnabled = true;
  private capsuleScale = 1;

  private constructor(host: HTMLElement, catalog: TerrainCatalog) {
    this.renderer = new ThreeRenderer(host);
    this.deploymentMarker.rotation.x = Math.PI / 2;
    this.deploymentMarker.visible = false;
    this.deploymentMarker.renderOrder = 10;
    this.renderer.scene.add(this.targetMarker, this.deploymentMarker);
    const lifecycle: TerrainLifecycle<RuntimeBundle> = {
      setStage: (stage) => this.panel?.setStage(stage),
      setSwitching: (switching) => { this.leaveAgentDeployment(); this.cancelRegionEdit(); this.mode = switching ? 'TERRAIN_SWITCHING' : 'NORMAL'; this.panel?.setSwitching(switching); },
      buildRuntime: (state, descriptor) => this.buildRuntime(state, descriptor),
      commitRuntime: (runtime, state, descriptor) => this.commitRuntime(runtime, state, descriptor),
      disposeRuntime: (runtime) => this.disposeRuntime(runtime),
    };
    this.terrainManager = new TerrainManager(catalog, this.stateStore, lifecycle);
    this.panel = new V02ControlPanel(host, catalog.getAllTerrains(), {
      switchTerrain: (id) => void this.switchTerrain(id), reloadTerrain: () => void this.reloadCurrentTerrain(), focusTerrain: () => this.focusTerrain(), focusAgent: () => this.focusAgent(), reset: () => this.reset(), deployAgent: () => this.toggleAgentDeployment(),
      setFrameFov: (degrees) => this.renderer.setFieldOfView(degrees), setCapsuleHeight: (metres) => this.setCapsuleHeight(metres),
      setEditTool: (tool) => this.setEditTool(tool), setBrush: (radius, strength) => this.setBrush(radius, strength), placeTower: () => this.beginTowerPlacement(),
      addRestricted: () => this.beginRegionEdit(), undoRestrictedPoint: () => this.undoRegionPoint(), cancelRestricted: () => this.cancelRegionEdit(), clearRestricted: () => void this.clearManualRegions(), exportTerrain: () => this.exportTerrain(), exportSemantic: () => this.exportSemantic(), exportAssets: () => this.exportAssets(),
      toggleNav: (visible) => { this.navVisible = visible; this.runtime?.mounted?.navDebug.setVisible(visible); },
      togglePhysics: (visible) => { this.physicsVisible = visible; this.runtime?.mounted?.debug.setPhysicsVisible(visible); },
      toggleSemantic: (visible) => { this.semanticVisible = visible; this.runtime?.mounted?.debug.setSemanticVisible(visible); },
      toggleBuildings: (visible) => { this.buildingsVisible = visible; this.runtime?.buildingLayer?.setVisible(visible); },
      toggleRoads: (visible) => { this.roadsVisible = visible; this.runtime?.roadLayer?.setVisible(visible); },
      toggleBuildingCollision: (visible) => { this.buildingCollisionVisible = visible; this.runtime?.buildingLayer?.setCollisionDebugVisible(visible); },
      toggleRoadWidth: (visible) => { this.roadWidthVisible = visible; this.runtime?.roadLayer?.setWidthDebugVisible(visible); },
      toggleTerrainSamples: (visible) => { this.terrainSamplesVisible = visible; this.runtime?.buildingLayer?.setHeightSamplesVisible(visible); this.runtime?.roadLayer?.setHeightSamplesVisible(visible); },
      setMeshRole: (name, role) => {
        if (!this.runtime || this.isSwitching()) return;
        this.runtime.state.meshRoles[name] = role;
        this.runtime.state.terrainDirty = true;
        this.panel.showNotice('Mesh role updated. Reload Terrain to resample from source.', 'info');
      },
    });
    this.renderer.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.renderer.domElement.addEventListener('pointermove', this.onPointerMove);
    this.renderer.renderer.domElement.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
    this.terrainManager.on('terrainChangeFailed', ({ terrainId, error }) => this.panel.showNotice(`${terrainId} failed to load: ${error instanceof Error ? error.message : 'unknown error'}`, 'error'));
  }

  static async create(host: HTMLElement): Promise<MultiTerrainSimulation> {
    const catalog = await TerrainCatalog.load();
    const simulation = new MultiTerrainSimulation(host, catalog);
    await simulation.terrainManager.loadInitialTerrain();
    if (!simulation.runtime) throw new Error('Default terrain failed to load.');
    return simulation;
  }

  start(): void { this.clock.start(); this.animate(); }
  isSwitching(): boolean { return this.mode === 'TERRAIN_SWITCHING'; }

  stepOnce(): void {
    const mounted = this.runtime?.mounted;
    if (!mounted || this.isSwitching()) return;
    mounted.controller.beforePhysics(this.fixedStepSeconds); this.runtime!.physics.step(this.fixedStepSeconds); mounted.controller.afterPhysics(); this.simulationTime += this.fixedStepSeconds;
  }

  setTarget(x: number, z: number): boolean {
    const runtime = this.runtime; const mounted = runtime?.mounted;
    if (!runtime || !mounted || this.mode !== 'NORMAL') return false;
    const validation = runtime.semantics.validateTarget(x, z);
    if (!validation.valid) { this.panel.showNotice(validation.reason ?? '目标无效', 'error'); return false; }
    if (!hasTerrainSupport(runtime.state.terrainData, x, z)) { this.panel.showNotice('目标不在有效 DEM 区域内', 'error'); return false; }
    const height = sampleTerrainHeight(runtime.state.terrainData, x, z);
    if (!Number.isFinite(height)) { this.panel.showNotice('目标不在当前地形上', 'error'); return false; }
    const candidate = { x, y: height + this.agentGroundOffset(), z };
    mounted.agent.pathStatus = 'planning'; const result = mounted.pathfinder.findPath(mounted.agent.position, candidate);
    if (!result.success) { mounted.controller.stop('blocked'); this.panel.showNotice(result.reason ?? '无法到达目标', 'error'); return false; }
    this.target = candidate; this.targetMarker.visible = true; this.targetMarker.position.set(x, height + 0.12, z); mounted.controller.follow(result.path);
    this.panel.showNotice(`路径已生成 · ${result.source === 'recast' ? 'RECAST' : 'A* FALLBACK'}`, 'success'); return true;
  }

  reset(): void {
    const mounted = this.runtime?.mounted; if (!mounted || this.isSwitching()) return;
    this.leaveAgentDeployment(); this.cancelRegionEdit(); mounted.controller.reset(); this.target = null; this.targetMarker.visible = false; this.simulationTime = 0; this.fixedStep.reset(); this.mode = 'NORMAL'; mounted.editor.cursor.visible = false; this.clearAssetPreview(); this.panel.showNotice('Simulation reset; terrain edits preserved.', 'info');
  }

  observe(): RuntimeObservation {
    const mounted = this.runtime?.mounted;
    if (!mounted) return { agent: { position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 } }, target: null, nearbyObjects: [], pathStatus: 'idle' };
    const position = mounted.agent.position;
    const nearbyObjects = mounted.assets.getPlacedAssets().map((asset) => ({ id: asset.id, type: asset.definitionId, position: asset.position, distance: Math.hypot(asset.position.x - position.x, asset.position.z - position.z) })).filter((asset) => asset.distance <= 12);
    return { agent: { position: { ...position }, velocity: { ...mounted.agent.velocity } }, target: this.target ? { position: { ...this.target } } : null, nearbyObjects, currentRegion: this.runtime?.semantics.regionAt(position.x, position.z)?.type, pathStatus: mounted.agent.pathStatus };
  }

  getAvailableTerrains(): readonly TerrainDescriptor[] { return this.terrainManager.catalog.getAllTerrains(); }
  getActiveTerrainId(): string | undefined { return this.terrainManager.getActiveTerrainId(); }
  async switchTerrain(id: string): Promise<boolean> { return this.terrainManager.switchTerrain(id); }
  async reloadCurrentTerrain(): Promise<boolean> {
    const state = this.runtime?.state;
    if (state && (state.terrainDirty || state.semanticDirty || state.assetsDirty) && !window.confirm('Reload discards current session edits for this terrain. Export first if needed. Continue?')) return false;
    return this.terrainManager.reloadCurrentTerrain();
  }
  getTerrainData(): TerrainData | undefined { return this.runtime?.state.terrainData; }
  sampleTerrainHeight(x:number,z:number):number { return this.runtime ? sampleTerrainHeight(this.runtime.state.terrainData,x,z) : Number.NaN; }
  getTerrainSlope(x:number,z:number):number { return this.runtime ? getTerrainSlope(this.runtime.state.terrainData,x,z) : Number.NaN; }
  getSemanticAt(x:number,z:number):string|undefined { return this.runtime?.semantics.regionAt(x,z)?.type; }
  getSemanticInfo(x:number,z:number):{type:string;walkable:boolean}|undefined { const region=this.runtime?.semantics.regionAt(x,z);return region?{type:region.type,walkable:region.walkable}:undefined; }
  validatePlacement(definitionId:string,x:number,z:number):PlacementValidation { return this.runtime?.mounted?.assets.validate(definitionId,x,z) ?? {valid:false,reason:'NO_ACTIVE_TERRAIN'}; }
  placeAsset(definitionId:string,x:number,z:number,rotationY=0):PlacedAsset|null { if (this.isSwitching()) return null; const asset=this.runtime?.mounted?.assets.place(definitionId,x,z,rotationY)??null; if(asset) void this.runtime?.nav.rebuild(); return asset; }
  removeAsset(id:string):boolean { return !this.isSwitching() && (this.runtime?.mounted?.assets.remove(id) ?? false); }
  moveAsset(id:string,x:number,z:number,rotationY=0):PlacedAsset|null { if(this.isSwitching())return null;const asset=this.runtime?.mounted?.assets.move(id,x,z,rotationY)??null;if(asset)void this.runtime?.nav.rebuild();return asset; }
  async clearPlacedAssets():Promise<void> { const r=this.runtime;const assets=r?.mounted?.assets;if(!r||!assets||this.isSwitching())return;assets.clear();await r.nav.rebuild();r.mounted?.navDebug.refresh(); }
  getPlacedAssets():PlacedAsset[] { return this.runtime?.mounted?.assets.getPlacedAssets() ?? []; }
  setRenderingEnabled(enabled:boolean):void { this.renderingEnabled=enabled; }
  showCoverageDebug(assets:readonly PlacedAsset[]):void { const r=this.runtime;if(r?.mounted)r.mounted.debug.drawCoverage(r.state.terrainData,assets,(x,z)=>this.getSemanticInfo(x,z)); }
  clearCoverageDebug():void { this.runtime?.mounted?.debug.clearCoverage(); }

  private async buildRuntime(state: TerrainRuntimeState, descriptor: TerrainDescriptor): Promise<RuntimeBundle> {
    const data = state.terrainData;
    const bounds = { minX: data.origin.x, maxX: data.origin.x + data.width, minZ: data.origin.z, maxZ: data.origin.z + data.depth };
    this.panel.setStage('Loading vector layers...');
    const [buildings, roads] = await Promise.all([
      descriptor.buildings ? this.loadVectorJson(descriptor.buildings, (value) => assertBuildingCollection(value, data.terrainId)) : undefined,
      descriptor.roads ? this.loadVectorJson(descriptor.roads, (value) => assertRoadCollection(value, data.terrainId)) : undefined,
    ]);
    const towerRegions = state.placedAssets.map((asset) => ({ id: `asset-obstacle-${asset.id}`, type: 'obstacle' as const, walkable: false, movementCost: 1000, shape: { kind: 'rectangle' as const, center: { x: asset.position.x, z: asset.position.z }, width: 2.5, depth: 2.5 } }));
    const semantics = new SemanticMap([...data.semanticRegions, ...roadSemanticRegions(roads), ...buildingSemanticRegions(buildings), ...towerRegions], bounds, data); semantics.manual.replace(state.semanticOverrides);
    const visual = this.visualBuilder.build(data);
    const buildingLayer = buildings ? new BuildingLayer(buildings) : undefined;
    const roadLayer = roads ? new RoadLayer(roads) : undefined;
    const physics = await TerrainPhysicsWorld.create(data);
    if (buildingLayer) physics.setBuildingColliders(buildingLayer.getCollisionBoxes());
    this.panel.setStage('Building navigation...');
    const nav = new TerrainNavMeshManager(semantics, data); await nav.initialize();
    const preferred = descriptor.spawn ?? this.terrainManager.catalog.manifest.spawn;
    const candidates = nav.getCells();
    if (preferred && nav.isWalkable(preferred.x, preferred.z) && semantics.validateTarget(preferred.x, preferred.z).valid
      && !isExplicitWater(data, preferred.x, preferred.z) && !isInferredWater(data, preferred.x, preferred.z)
      && getTerrainSlope(data, preferred.x, preferred.z) <= 42) {
      candidates.unshift({ ...preferred, size: nav.cellSize });
    }
    const spawn = chooseAgentSpawn(data, candidates, preferred);
    if (!spawn) {
      nav.dispose(); physics.dispose(); buildingLayer?.dispose(); roadLayer?.dispose(); this.visualBuilder.dispose(visual);
      throw new Error('地形中没有有效的胶囊体出生位置，请检查 DEM 有效范围、坡度和禁区。');
    }
    return { descriptor, state, visual, semantics, physics, nav, spawn, buildings, roads, buildingLayer, roadLayer };
  }

  private commitRuntime(runtime: RuntimeBundle, state: TerrainRuntimeState, descriptor: TerrainDescriptor): void {
    this.leaveAgentDeployment(); this.target = null; this.targetMarker.visible = false; this.clearAssetPreview();
    const debug = new DebugRenderer(this.renderer.scene, runtime.semantics, state.terrainData); debug.setSemanticVisible(this.semanticVisible); debug.setPhysicsVisible(this.physicsVisible);
    const navDebug = new NavigationDebug(runtime.nav, debug); navDebug.refresh(); navDebug.setVisible(this.navVisible);
    runtime.spawn.y = sampleTerrainHeight(state.terrainData, runtime.spawn.x, runtime.spawn.z) + this.agentGroundOffset() + 0.05;
    const agent = new Agent(runtime.spawn, this.capsuleScale); const character = new CharacterController(runtime.physics, runtime.spawn, this.capsuleScale); const controller = new AgentController(agent, character, debug);
    const editor = new TerrainEditor(state.terrainData); const regionEditor = new RegionEditor(runtime.semantics); const assets = new AssetPlacementManager(state, runtime.semantics, runtime.physics);
    const pathfinder = new Pathfinder(runtime.nav, runtime.semantics); pathfinder.setAgentHeightOffset(this.agentGroundOffset());
    runtime.mounted = { agent, character, controller, pathfinder, debug, navDebug, editor, regionEditor, assets };
    this.renderer.scene.add(runtime.visual.root, agent.object3D, assets.group, editor.cursor);
    if (runtime.buildingLayer) {
      runtime.buildingLayer.setVisible(this.buildingsVisible); runtime.buildingLayer.setCollisionDebugVisible(this.buildingCollisionVisible);
      runtime.buildingLayer.setHeightSamplesVisible(this.terrainSamplesVisible); this.renderer.scene.add(runtime.buildingLayer.root);
    }
    if (runtime.roadLayer) {
      runtime.roadLayer.setVisible(this.roadsVisible); runtime.roadLayer.setWidthDebugVisible(this.roadWidthVisible);
      runtime.roadLayer.setHeightSamplesVisible(this.terrainSamplesVisible); this.renderer.scene.add(runtime.roadLayer.root);
    }
    this.runtime = runtime; this.panel.setActiveTerrain(descriptor.id); this.panel.setSwitching(false); this.focusTerrain(); this.panel.showNotice(`${descriptor.name} loaded`, 'success');
    if (Math.max(state.terrainData.width, state.terrainData.depth) > 500) this.focusAgent();
    this.panel.setDetectedMeshes(state.terrainData.detectedMeshes, state.meshRoles);
  }

  private disposeRuntime(runtime: RuntimeBundle): void {
    const mounted = runtime.mounted;
    if (mounted) { mounted.controller.stop(); mounted.debug.dispose(); mounted.editor.dispose(); mounted.assets.dispose(); mounted.agent.object3D.removeFromParent(); this.disposeObject(mounted.agent.object3D); }
    runtime.buildingLayer?.dispose(); runtime.roadLayer?.dispose();
    this.visualBuilder.dispose(runtime.visual); runtime.nav.dispose(); runtime.physics.dispose();
  }

  private async loadVectorJson<T>(path: string, validate: (value: unknown) => T): Promise<T> {
    const response = await fetch(this.terrainManager.catalog.resolve(path));
    if (!response.ok) throw new Error(`Vector layer load failed: ${path} (HTTP ${response.status})`);
    return validate(await response.json());
  }

  private setEditTool(tool: TerrainEditTool | null): void {
    const mounted = this.runtime?.mounted; if (!mounted || this.isSwitching()) return;
    this.leaveAgentDeployment(); this.cancelRegionEdit(); this.mode = tool ? 'TERRAIN_EDIT' : 'NORMAL'; mounted.editor.cursor.visible = Boolean(tool); if (tool) mounted.editor.tool = tool; this.clearAssetPreview();
  }
  private toggleAgentDeployment(): void {
    const runtime = this.runtime; const mounted = runtime?.mounted;
    if (!runtime || !mounted || this.isSwitching()) return;
    if (this.mode === 'AGENT_DEPLOYMENT') {
      this.leaveAgentDeployment();
      this.panel.showNotice('已取消重新部署。', 'info');
      return;
    }
    this.cancelRegionEdit();
    this.mode = 'AGENT_DEPLOYMENT';
    mounted.controller.stop();
    mounted.editor.cursor.visible = false;
    this.clearAssetPreview();
    this.target = null; this.targetMarker.visible = false;
    this.panel.clearEditToolSelection();
    this.panel.setAgentDeploymentActive(true);
    this.renderer.renderer.domElement.style.cursor = 'crosshair';
    this.panel.showNotice('点击地形上的可通行位置部署胶囊体；再次按按钮或 Esc 取消。', 'info');
  }
  private leaveAgentDeployment(): void {
    if (this.mode === 'AGENT_DEPLOYMENT') this.mode = 'NORMAL';
    this.deploymentMarker.visible = false;
    this.renderer.renderer.domElement.style.cursor = '';
    this.panel?.setAgentDeploymentActive(false);
  }
  private validateAgentDeployment(x: number, z: number): { valid: boolean; height?: number; reason?: string } {
    const runtime = this.runtime; const mounted = runtime?.mounted;
    if (!runtime || !mounted) return { valid: false, reason: '当前没有可用地形。' };
    const semantic = runtime.semantics.validateTarget(x, z);
    if (!semantic.valid) return { valid: false, reason: semantic.reason };
    const data = runtime.state.terrainData;
    if (!hasTerrainSupport(data, x, z)) return { valid: false, reason: '该位置没有有效地形支撑。' };
    const height = sampleTerrainHeight(data, x, z);
    if (!Number.isFinite(height)) return { valid: false, reason: '无法取得该位置的地面高度。' };
    if (runtime.semantics.regionAt(x, z)?.type === 'water' || isExplicitWater(data, x, z) || isInferredWater(data, x, z)) return { valid: false, reason: '不能部署在水域。' };
    // Validate the clicked ground itself. A coarse nav-cell centre can remain
    // blocked even after a small patch has been sculpted into usable land.
    if (getTerrainSlope(data, x, z) > 42) return { valid: false, reason: '该位置坡度过陡。' };
    if (runtime.state.placedAssets.some((asset) => !asset.invalidPlacement && Math.hypot(asset.position.x - x, asset.position.z - z) < 1.2 + SIMULATION.agentRadius * this.capsuleScale)) {
      return { valid: false, reason: '该位置与已放置物体重叠。' };
    }
    return { valid: true, height };
  }
  private deployAgent(x: number, z: number): void {
    const runtime = this.runtime; const mounted = runtime?.mounted;
    if (!runtime || !mounted) return;
    const validation = this.validateAgentDeployment(x, z);
    if (!validation.valid || validation.height === undefined) {
      this.panel.showNotice(validation.reason ?? '此处不可部署。', 'error');
      return;
    }
    const position = { x, y: validation.height + this.agentGroundOffset() + 0.05, z };
    mounted.controller.deploy(position);
    runtime.spawn = { ...position };
    this.target = null; this.targetMarker.visible = false;
    this.leaveAgentDeployment();
    this.panel.showNotice('胶囊体已重新部署；重置模拟也会回到该位置。', 'success');
  }
  private setBrush(radius:number,strength:number):void { const editor=this.runtime?.mounted?.editor; if(editor){editor.setRadius(radius);editor.strength=strength;} }
  private agentGroundOffset(): number { return (SIMULATION.agentHalfHeight + SIMULATION.agentRadius) * this.capsuleScale; }
  private setCapsuleHeight(metres: number): void {
    this.capsuleScale = metres / (2 * (SIMULATION.agentHalfHeight + SIMULATION.agentRadius));
    this.deploymentMarker.scale.setScalar(this.capsuleScale);
    const runtime = this.runtime; const mounted = runtime?.mounted;
    if (!runtime || !mounted || this.isSwitching()) return;
    mounted.controller.stop(); this.target = null; this.targetMarker.visible = false;
    mounted.agent.setSizeScale(this.capsuleScale);
    mounted.character.setSizeScale(this.capsuleScale);
    mounted.pathfinder.setAgentHeightOffset(this.agentGroundOffset());
    const current = mounted.agent.position;
    const ground = sampleTerrainHeight(runtime.state.terrainData, current.x, current.z);
    if (Number.isFinite(ground)) {
      const position = { x: current.x, y: ground + this.agentGroundOffset() + 0.05, z: current.z };
      mounted.character.reset(position);
      mounted.agent.sync(position, { x: 0, y: 0, z: 0 });
    }
    const spawn = mounted.agent.spawn;
    const spawnHeight = sampleTerrainHeight(runtime.state.terrainData, spawn.x, spawn.z);
    if (Number.isFinite(spawnHeight)) spawn.y = spawnHeight + this.agentGroundOffset() + 0.05;
    runtime.spawn.y = spawn.y;
  }
  private beginTowerPlacement():void { if(!this.runtime?.mounted||this.isSwitching())return; this.leaveAgentDeployment(); this.cancelRegionEdit(); this.mode='ASSET_PLACEMENT'; this.runtime.mounted.editor.cursor.visible=false; this.clearAssetPreview(); const dummy:PlacedAsset={id:'tower-preview',terrainId:this.runtime.state.terrainId,definitionId:'signal-tower',position:{x:0,y:0,z:0},rotationY:0,createdAt:0}; this.assetPreview=new GeneratedAssetFactory().create(dummy,true); this.renderer.scene.add(this.assetPreview); this.panel.showNotice('Click a valid location to place Signal Tower.','info'); }
  private beginRegionEdit():void {
    const mounted=this.runtime?.mounted;if(!mounted||this.isSwitching())return;
    if(this.mode==='REGION_EDIT'){this.finishRegionEdit();return;}
    this.leaveAgentDeployment();this.mode='REGION_EDIT';mounted.editor.cursor.visible=false;this.panel.clearEditToolSelection();
    mounted.regionEditor.begin();mounted.debug.setRegionDraft([]);this.panel.setRegionEditing(true);this.clearAssetPreview();
    this.renderer.renderer.domElement.style.cursor='crosshair';
    this.panel.showNotice('在地形表面逐点点击，至少三点；按“完成选区”闭合。Esc 取消，Backspace 撤销上一点。','info');
  }
  private finishRegionEdit():void {
    const r=this.runtime;const mounted=r?.mounted;if(!r||!mounted||this.mode!=='REGION_EDIT')return;
    const result=mounted.regionEditor.finish();
    if(result.state==='invalid'){this.panel.showNotice(result.reason,'error');return;}
    r.state.semanticOverrides=r.semantics.manual.all().map((region)=>({id:region.id,type:region.type,walkable:region.walkable,movementCost:region.movementCost,shape:structuredClone(region.shape)}));
    r.state.semanticDirty=true;mounted.debug.rebuildSemantic();mounted.controller.stop();this.target=null;this.targetMarker.visible=false;
    this.cancelRegionEdit();
    void r.nav.rebuild().then(()=>{if(this.runtime===r)mounted.navDebug.refresh();});
    this.panel.showNotice('禁区已贴合地形创建。','success');
  }
  private cancelRegionEdit():void {
    if(this.mode!=='REGION_EDIT')return;
    this.runtime?.mounted?.regionEditor.cancel();this.runtime?.mounted?.debug.clearRegionDraft();
    this.mode='NORMAL';this.renderer.renderer.domElement.style.cursor='';this.panel?.setRegionEditing(false);
  }
  private undoRegionPoint():void {
    const mounted=this.runtime?.mounted;if(this.mode!=='REGION_EDIT'||!mounted)return;
    if(mounted.regionEditor.undoPoint()){
      const points=mounted.regionEditor.getPoints();mounted.debug.setRegionDraft(points);this.panel.setRegionEditing(true,points.length);
    }
  }
  private async clearManualRegions():Promise<void>{const r=this.runtime;if(!r?.mounted||this.isSwitching())return;this.cancelRegionEdit();r.semantics.manual.clear();r.state.semanticOverrides=[];r.state.semanticDirty=true;r.mounted.debug.rebuildSemantic();await r.nav.rebuild();if(this.runtime===r)r.mounted.navDebug.refresh();}
  private focusTerrain():void { const data=this.runtime?.state.terrainData;if(data)this.renderer.focusTerrain(data.width,data.depth,data.maxHeight,data.origin.x+data.width/2,data.origin.z+data.depth/2,data.minHeight); }
  private focusAgent():void { const agent=this.runtime?.mounted?.agent;if(agent)this.renderer.focusAgent(agent.position); }

  private readonly animate=():void=>{requestAnimationFrame(this.animate);const dt=this.clock.getDelta();this.fixedStep.advance(dt,()=>this.stepOnce());this.fps=THREE.MathUtils.lerp(this.fps,dt>0?1/dt:60,.08);const r=this.runtime;if(r?.mounted){r.visual.water.update(this.clock.elapsedTime);if(this.renderingEnabled){r.mounted.agent.updateLocator(this.renderer.camera,this.renderer.renderer.domElement.clientHeight);r.mounted.debug.updatePhysics(r.physics);this.panel.update(this.fps,this.observe(),r.state,r.descriptor);}}if(this.renderingEnabled)this.renderer.render();};
  private readonly onPointerDown=(event:PointerEvent):void=>{if(event.button!==0){this.pointerDown=undefined;return;}this.pointerDown={x:event.clientX,y:event.clientY};const r=this.runtime;if(!r?.mounted||this.isSwitching())return;if(this.mode==='TERRAIN_EDIT'){const p=this.point(event);if(p){this.brushDown=true;r.mounted.editor.beginStroke(p.x,p.z);this.applyBrush(p.x,p.z);}}};
  private readonly onPointerMove=(event:PointerEvent):void=>{const r=this.runtime;if(!r?.mounted||this.isSwitching())return;const p=this.point(event);if(!p){if(this.mode==='AGENT_DEPLOYMENT')this.deploymentMarker.visible=false;if(this.mode==='REGION_EDIT')r.mounted.debug.setRegionDraft(r.mounted.regionEditor.getPoints());return;}if(this.mode==='AGENT_DEPLOYMENT'){const validation=this.validateAgentDeployment(p.x,p.z);this.deploymentMarker.visible=true;this.deploymentMarker.position.set(p.x,(validation.height??p.y)+0.12,p.z);this.deploymentMarker.material.color.setHex(validation.valid?0x58b98a:0xd96b72);return;}if(this.mode==='REGION_EDIT'){const cursor=hasTerrainSupport(r.state.terrainData,p.x,p.z)?{x:p.x,z:p.z}:undefined;r.mounted.debug.setRegionDraft(r.mounted.regionEditor.getPoints(),cursor);return;}if(this.mode==='TERRAIN_EDIT'){r.mounted.editor.moveCursor(p.x,p.z);if(this.brushDown)this.applyBrush(p.x,p.z);}else if(this.mode==='ASSET_PLACEMENT'&&this.assetPreview){const v=r.mounted.assets.validate('signal-tower',p.x,p.z);this.assetPreview.visible=true;this.assetPreview.position.set(p.x,v.height??p.y,p.z);}};
  private readonly onPointerUp=(event:PointerEvent):void=>{const down=this.pointerDown;this.pointerDown=undefined;const r=this.runtime;if(!r?.mounted||this.isSwitching())return;if(this.mode==='TERRAIN_EDIT'){this.brushDown=false;void this.rebuildAfterEdit();return;}if(event.button!==0||!down||Math.hypot(event.clientX-down.x,event.clientY-down.y)>5)return;const p=this.point(event);if(!p){if(this.mode==='AGENT_DEPLOYMENT'||this.mode==='REGION_EDIT')this.panel.showNotice('请选择地形表面。','error');return;}if(this.mode==='AGENT_DEPLOYMENT'){this.deployAgent(p.x,p.z);return;}if(this.mode==='ASSET_PLACEMENT'){const asset=r.mounted.assets.place('signal-tower',p.x,p.z);this.panel.showNotice(asset?'Signal Tower placed.':'Invalid placement. slope/water/collision check failed.',asset?'success':'error');if(asset)void r.nav.rebuild().then(()=>r.mounted?.navDebug.refresh());this.mode='NORMAL';this.clearAssetPreview();return;}if(this.mode==='REGION_EDIT'){if(!hasTerrainSupport(r.state.terrainData,p.x,p.z)){this.panel.showNotice('该位置没有有效地形支撑。','error');return;}const result=r.mounted.regionEditor.addPoint({x:p.x,z:p.z});if(!result.added){this.panel.showNotice(result.reason??'无效点位。','error');return;}const points=r.mounted.regionEditor.getPoints();r.mounted.debug.setRegionDraft(points);this.panel.setRegionEditing(true,points.length);return;}this.setTarget(p.x,p.z);};
  private readonly onKeyDown=(event:KeyboardEvent):void=>{if(event.key==='Escape'&&this.mode==='REGION_EDIT'){this.cancelRegionEdit();this.panel.showNotice('已取消禁区选取。','info');return;}if(event.key==='Backspace'&&this.mode==='REGION_EDIT'&&!(event.target instanceof HTMLInputElement)&&!(event.target instanceof HTMLTextAreaElement)){event.preventDefault();this.undoRegionPoint();return;}if(event.key==='Escape'&&this.mode==='AGENT_DEPLOYMENT'){this.leaveAgentDeployment();this.panel.showNotice('已取消重新部署。','info');}};
  private point(event:PointerEvent):THREE.Vector3|null{return this.runtime?this.renderer.groundPointFromEvent(event,this.runtime.visual.mesh):null;}
  private applyBrush(x:number,z:number):void{const r=this.runtime;if(!r?.mounted)return;if(r.mounted.editor.apply(x,z)){r.state.terrainDirty=true;this.visualBuilder.updateGeometry(r.visual.mesh,r.state.terrainData);}}
  private async rebuildAfterEdit():Promise<void>{
    const runtime=this.runtime;const mounted=runtime?.mounted;
    if(!runtime||!mounted||!runtime.state.terrainDirty)return;
    runtime.physics.rebuildTerrain(runtime.state.terrainData);
    runtime.visual.water.refresh(runtime.state.terrainData);
    mounted.debug.rebuildSemantic();
    await runtime.nav.rebuild();
    if(this.runtime!==runtime||!runtime.mounted)return;
    mounted.navDebug.refresh();
    mounted.controller.stop();this.target=null;this.targetMarker.visible=false;
    const current=mounted.agent.position;
    const height=sampleTerrainHeight(runtime.state.terrainData,current.x,current.z);
    if(Number.isFinite(height)){
      const position={x:current.x,y:height+this.agentGroundOffset()+0.05,z:current.z};
      mounted.character.reset(position);mounted.agent.sync(position,{x:0,y:0,z:0});
    }
    const spawn=mounted.agent.spawn;
    const spawnHeight=sampleTerrainHeight(runtime.state.terrainData,spawn.x,spawn.z);
    if(Number.isFinite(spawnHeight))spawn.y=spawnHeight+this.agentGroundOffset()+0.05;
    if(this.mode==='TERRAIN_EDIT')mounted.editor.cursor.visible=true;
  }
  private exportTerrain():void{const state=this.runtime?.state;if(!state)return;const data=state.terrainData;this.download(`${state.terrainId}.json`,{...data,heights:Array.from(data.heights),sampleCoverage:data.sampleCoverage?Array.from(data.sampleCoverage):undefined,waterGrid:data.waterGrid?{rows:data.waterGrid.rows,cols:data.waterGrid.cols,mask:Array.from(data.waterGrid.mask),heights:Array.from(data.waterGrid.heights)}:undefined});state.terrainDirty=false;}
  private exportSemantic():void{const state=this.runtime?.state;if(!state)return;this.download(`semantic-${state.terrainId.replace('terrain-','')}.json`,state.semanticOverrides);state.semanticDirty=false;}
  private exportAssets():void{const state=this.runtime?.state;if(!state)return;this.download(`assets-${state.terrainId.replace('terrain-','')}.json`,state.placedAssets);state.assetsDirty=false;}
  private download(filename:string,value:unknown):void{const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),0);this.panel.showNotice(`${filename} exported`,'success');}
  private clearAssetPreview():void{if(this.assetPreview){this.disposeObject(this.assetPreview);this.assetPreview.removeFromParent();this.assetPreview=undefined;}}
  private disposeObject(root:THREE.Object3D):void{root.traverse((o)=>{if(o instanceof THREE.Mesh){o.geometry.dispose();if(Array.isArray(o.material))o.material.forEach((m)=>m.dispose());else o.material.dispose();}});}
  private createTargetMarker():THREE.Group{const g=new THREE.Group();const ring=new THREE.Mesh(new THREE.TorusGeometry(.72,.09,10,32),new THREE.MeshBasicMaterial({color:COLORS.target}));ring.rotation.x=Math.PI/2;const beam=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,2.5,8),new THREE.MeshBasicMaterial({color:COLORS.target,transparent:true,opacity:.45}));beam.position.y=1.25;g.add(ring,beam);g.visible=false;return g;}
}
