import * as THREE from 'three';
import { Agent } from '../agent/Agent';
import { AgentController } from '../agent/AgentController';
import type { Observation } from '../algorithm/Observation';
import { CharacterController } from '../physics/CharacterController';
import { SIMULATION } from '../config/constants';
import { DebugRenderer } from '../render/DebugRenderer';
import { ModelLoader } from '../render/ModelLoader';
import { ThreeRenderer } from '../render/ThreeRenderer';
import { TerrainBuilder } from '../map/TerrainBuilder';
import { DemoMapAdapter } from '../map/DemoMapAdapter';
import { MapLoader } from '../map/MapLoader';
import type { WorldMap } from '../map/MapTypes';
import { NavigationDebug } from '../navigation/NavigationDebug';
import { NavMeshManager } from '../navigation/NavMeshManager';
import { Pathfinder } from '../navigation/Pathfinder';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { SemanticMap } from '../semantic/SemanticMap';
import { ControlPanel } from '../ui/ControlPanel';
import { RegionEditor } from '../ui/RegionEditor';
import { COLORS } from '../config/constants';
import type { Vector3Data } from '../types';
import { FixedTimeStep } from './FixedTimeStep';
import { World } from './World';

export class Simulation {
  readonly fixedStepSeconds = SIMULATION.fixedTimeStep;
  readonly world: World;
  readonly environmentRoot: THREE.Group;
  readonly renderer: ThreeRenderer;
  readonly semantics: SemanticMap;
  readonly physics: PhysicsWorld;
  readonly agent: Agent;
  simulationTime = 0;
  private readonly clock = new THREE.Clock();
  private readonly fixedStep = new FixedTimeStep(SIMULATION.fixedTimeStep);
  private readonly character: CharacterController;
  private readonly agentController: AgentController;
  private readonly nav: NavMeshManager;
  private readonly pathfinder: Pathfinder;
  private readonly debug: DebugRenderer;
  private readonly navDebug: NavigationDebug;
  private readonly panel: ControlPanel;
  private readonly regionEditor: RegionEditor;
  private readonly terrain: THREE.Object3D;
  private readonly targetMarker: THREE.Group;
  private target: Vector3Data | null = null;
  private fps = 60;
  private pointerDown?: { x: number; y: number };

  private constructor(
    host: HTMLElement,
    map: WorldMap,
    renderer: ThreeRenderer,
    terrain: THREE.Object3D,
    physics: PhysicsWorld,
    nav: NavMeshManager,
    semantics: SemanticMap,
  ) {
    this.renderer = renderer;
    this.terrain = terrain;
    this.physics = physics;
    this.nav = nav;
    this.world = new World(map);
    this.semantics = semantics;
    this.environmentRoot = new THREE.Group();
    this.environmentRoot.name = 'world-visuals';
    this.renderer.scene.add(this.environmentRoot);
    this.debug = new DebugRenderer(this.renderer.scene, this.semantics);
    this.navDebug = new NavigationDebug(this.nav, this.debug);
    this.navDebug.refresh();
    this.navDebug.setVisible(false);
    this.regionEditor = new RegionEditor(this.semantics);

    this.agent = new Agent(map.spawnPoints.agent);
    this.renderer.scene.add(this.agent.object3D);
    this.character = new CharacterController(this.physics, map.spawnPoints.agent);
    this.agentController = new AgentController(this.agent, this.character, this.debug);
    this.pathfinder = new Pathfinder(this.nav, this.semantics);
    this.targetMarker = this.createTargetMarker();
    this.renderer.scene.add(this.targetMarker);

    this.panel = new ControlPanel(host, {
      onReset: () => this.reset(),
      onToggleNav: (visible) => this.navDebug.setVisible(visible),
      onTogglePhysics: (visible) => this.debug.setPhysicsVisible(visible),
      onToggleSemantic: (visible) => this.debug.setSemanticVisible(visible),
      onAddRestricted: () => this.beginRegionEdit(),
      onClearRestricted: () => void this.clearManualRegions(),
    });
    this.renderer.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.renderer.domElement.addEventListener('pointerup', this.onPointerUp);
  }

  static async create(host: HTMLElement): Promise<Simulation> {
    const adapter = new DemoMapAdapter();
    let map: WorldMap;
    let mapWarning: string | undefined;
    try {
      map = await new MapLoader(adapter).load();
    } catch (error) {
      console.error('Map JSON load failed; using embedded demo fallback.', error);
      map = adapter.createFallbackWorldMap();
      mapWarning = '地图 JSON 加载失败，已启用内置地图。';
    }

    const renderer = new ThreeRenderer(host);
    const terrain = await new TerrainBuilder().build(map.terrain);
    renderer.scene.add(terrain);
    const semantics = new SemanticMap(map.regions);
    const nav = new NavMeshManager(semantics);
    await nav.initialize();
    const physics = await PhysicsWorld.create(map);
    const simulation = new Simulation(host, map, renderer, terrain, physics, nav, semantics);
    await simulation.addMapVisuals(map);
    if (mapWarning) simulation.panel.showNotice(mapWarning, 'error');
    if (nav.lastError) simulation.panel.showNotice('Recast 初始化失败，已启用 A* 导航降级。', 'error');
    simulation.panel.setPhysicsStatus('RAPIER · 60 HZ');
    simulation.setTarget(map.spawnPoints.target.x, map.spawnPoints.target.z);
    return simulation;
  }

  start(): void {
    this.clock.start();
    this.animate();
  }

  stepOnce(): void {
    this.agentController.beforePhysics(this.fixedStepSeconds);
    this.physics.step(this.fixedStepSeconds);
    this.agentController.afterPhysics();
    this.simulationTime += this.fixedStepSeconds;
  }

  setTarget(x: number, z: number): boolean {
    const validation = this.semantics.validateTarget(x, z);
    if (!validation.valid) {
      this.panel.showNotice(validation.reason ?? '目标无效', 'error');
      return false;
    }
    const candidate = { x, y: this.agent.position.y, z };
    this.agent.pathStatus = 'planning';
    const result = this.pathfinder.findPath(this.agent.position, candidate);
    if (!result.success) {
      this.agentController.stop('blocked');
      this.panel.showNotice(result.reason ?? '无法到达目标', 'error');
      return false;
    }
    this.target = candidate;
    this.targetMarker.visible = true;
    this.targetMarker.position.set(x, 0.12, z);
    this.agentController.follow(result.path);
    this.panel.showNotice(`路径已生成 · ${result.source === 'recast' ? 'RECAST' : 'A* FALLBACK'}`, 'success');
    return true;
  }

  reset(): void {
    this.agentController.reset();
    this.target = null;
    this.targetMarker.visible = false;
    this.simulationTime = 0;
    this.fixedStep.reset();
    this.regionEditor.cancel();
    this.panel.setEditing(false);
    this.panel.showNotice('仿真已重置', 'info');
  }

  observe(): Observation {
    const position = this.agent.position;
    const nearbyObjects = [...this.world.entities.values()]
      .map((entity) => ({
        id: entity.id,
        type: entity.type,
        position: { ...entity.position },
        distance: Math.hypot(entity.position.x - position.x, entity.position.z - position.z),
      }))
      .filter((object) => object.distance <= 12)
      .sort((a, b) => a.distance - b.distance);
    return {
      agent: { position: { ...position }, velocity: { ...this.agent.velocity } },
      target: this.target ? { position: { ...this.target } } : null,
      nearbyObjects,
      currentRegion: this.semantics.regionAt(position.x, position.z)?.type,
      pathStatus: this.agent.pathStatus,
    };
  }

  private async addMapVisuals(map: WorldMap): Promise<void> {
    const loader = new ModelLoader();
    await Promise.all(
      map.objects.map(async (object) => {
        const visual = object.modelUrl
          ? await loader.loadModel(object.modelUrl, object)
          : loader.createFallback(object);
        this.environmentRoot.add(visual);
      }),
    );
  }

  private readonly animate = (): void => {
    requestAnimationFrame(this.animate);
    const frameSeconds = this.clock.getDelta();
    this.fixedStep.advance(frameSeconds, () => this.stepOnce());
    const instantFps = frameSeconds > 0 ? 1 / frameSeconds : 60;
    this.fps = THREE.MathUtils.lerp(this.fps, instantFps, 0.08);
    this.debug.updatePhysics(this.physics);
    this.panel.update(this.fps, this.observe());
    this.renderer.render();
  };

  private beginRegionEdit(): void {
    if (this.regionEditor.enabled) {
      const result = this.regionEditor.finish();
      if (result.state === 'invalid') { this.panel.showNotice(result.reason, 'error'); return; }
      this.panel.setEditing(false);
      this.debug.rebuildSemantic();
      void this.nav.rebuild().then(() => {
        this.navDebug.refresh();
        this.panel.showNotice(`已添加禁区：${result.region.id}`, 'success');
        if (this.target) this.setTarget(this.target.x, this.target.z);
      });
      return;
    }
    this.regionEditor.begin();
    this.panel.setEditing(true);
    this.panel.showNotice('逐点选择地面，至少三点后再按按钮闭合禁区', 'info');
  }

  private async clearManualRegions(): Promise<void> {
    this.semantics.manual.clear();
    this.debug.rebuildSemantic();
    await this.nav.rebuild();
    this.navDebug.refresh();
    this.panel.showNotice('人工禁区已清除', 'info');
    if (this.target) this.setTarget(this.target.x, this.target.z);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.pointerDown = { x: event.clientX, y: event.clientY };
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.pointerDown || Math.hypot(event.clientX - this.pointerDown.x, event.clientY - this.pointerDown.y) > 5) return;
    const point = this.renderer.groundPointFromEvent(event, this.terrain);
    if (!point) return;
    if (this.regionEditor.enabled) {
      const result = this.regionEditor.addPoint({ x: point.x, z: point.z });
      if (!result.added) this.panel.showNotice(result.reason ?? '无效点位', 'error');
      else this.panel.setEditing(true, true);
      return;
    }
    this.setTarget(point.x, point.z);
  };

  private createTargetMarker(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'target-marker';
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.72, 0.09, 10, 32),
      new THREE.MeshBasicMaterial({ color: COLORS.target }),
    );
    ring.rotation.x = Math.PI / 2;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 2.5, 8),
      new THREE.MeshBasicMaterial({ color: COLORS.target, transparent: true, opacity: 0.45 }),
    );
    beam.position.y = 1.25;
    group.add(ring, beam);
    group.visible = false;
    return group;
  }
}
