import type { CoordinatePlacementInput, CoordinatePlacementResult } from '../assets/CoordinateAssetPlacer';
import { FloatingPanel } from './FloatingPanel';

export interface CoordinatePanelActions {
  pickFromMap(): void;
  preview(input: CoordinatePlacementInput): void;
  deploy(input: CoordinatePlacementInput): void;
  clearPreview(): void;
  toggleCoordinateMarker(visible: boolean): void;
  toggleLocalOrigin(visible: boolean): void;
  toggleTerrainBounds(visible: boolean): void;
  toggleWorldAxes(visible: boolean): void;
  toggleMeterGrid(visible: boolean): void;
}

export class CoordinatePanel {
  private readonly root = document.createElement('aside');
  private readonly mode: HTMLSelectElement;
  private readonly yMode: HTMLSelectElement;
  private readonly first: HTMLInputElement;
  private readonly second: HTMLInputElement;
  private readonly y: HTMLInputElement;
  private readonly firstLabel: HTMLElement;
  private readonly secondLabel: HTMLElement;
  private readonly yLabel: HTMLElement;
  private readonly inspectorStatus: HTMLElement;
  private readonly localValue: HTMLElement;
  private readonly projectedValue: HTMLElement;
  private readonly geographicValue: HTMLElement;
  private readonly result: HTMLElement;
  private readonly crs: HTMLElement;
  private latest?: CoordinatePlacementResult;
  private selected?: CoordinatePlacementResult;

  constructor(host: HTMLElement, actions: CoordinatePanelActions) {
    this.root.className = 'coordinate-panel';
    this.root.innerHTML = `
      <div class="coordinate-heading"><div><span class="eyebrow">COORDINATES / V0.6-A</span><h2>Coordinate Inspector</h2></div><span data-coordinate-crs>LOCAL ONLY</span></div>
      <div class="coordinate-readout" data-coordinate-status>Move over terrain</div>
      <div class="coordinate-values">
        <div><span>LOCAL · m</span><code data-coordinate-local>--</code></div>
        <div><span>PROJECTED · m</span><code data-coordinate-projected>--</code></div>
        <div><span>GEOGRAPHIC</span><code data-coordinate-geographic>--</code></div>
      </div>
      <div class="coordinate-copy row"><button data-copy="local">Copy Local</button><button data-copy="projected">Copy Projected</button><button data-copy="geographic">Copy LonLat</button></div>
      <details class="coordinate-placement" open>
        <summary>Coordinate Asset Placement</summary>
        <label class="field"><span>Asset Type</span><select data-coordinate="asset"><option value="signal-tower">Signal Tower</option></select></label>
        <label class="field"><span>Coordinate Mode</span><select data-coordinate="mode"><option value="local">Local XYZ</option><option value="projected">Projected / UTM</option><option value="geographic">Longitude / Latitude</option></select></label>
        <div class="coordinate-input-grid">
          <label class="field"><span data-coordinate-label="first">X · east (m)</span><input data-coordinate="first" type="number" step="any" inputmode="decimal"></label>
          <label class="field"><span data-coordinate-label="second">Z · south (m)</span><input data-coordinate="second" type="number" step="any" inputmode="decimal"></label>
        </div>
        <label class="field"><span>Y Mode</span><select data-coordinate="yMode"><option value="auto">Auto Terrain</option><option value="manual">Manual</option></select></label>
        <label class="field"><span data-coordinate-label="y">Local Y (m)</span><input data-coordinate="y" type="number" step="any" inputmode="decimal" disabled></label>
        <div class="coordinate-actions"><button data-coordinate-action="pick">Pick From Map</button><button data-coordinate-action="preview">Preview</button><button data-coordinate-action="deploy" class="primary">Deploy</button></div>
        <div class="coordinate-result" data-coordinate-result>Enter a coordinate or pick from the map.</div>
      </details>
      <details class="coordinate-debug"><summary>Coordinate Debug</summary><div class="toggle-list">
        ${toggle('coordinateMarker', 'Show Coordinate Marker', true)}
        ${toggle('localOrigin', 'Show Local Origin')}
        ${toggle('terrainBounds', 'Show Terrain Bounds')}
        ${toggle('worldAxes', 'Show World Axes')}
        ${toggle('meterGrid', 'Show Meter Grid · 100m')}
      </div><p>+X East · +Y Up · +Z South<br>Local Origin = (0, 0, 0)</p></details>`;
    host.append(this.root);
    new FloatingPanel(this.root, { id: 'coordinates', title: 'Coordinate Inspector', icon: '⊕', headingSelector: '.coordinate-heading' });
    this.mode = this.select('mode'); this.yMode = this.select('yMode');
    this.first = this.input('first'); this.second = this.input('second'); this.y = this.input('y');
    this.firstLabel = this.label('first'); this.secondLabel = this.label('second'); this.yLabel = this.label('y');
    this.inspectorStatus = this.root.querySelector('[data-coordinate-status]') as HTMLElement;
    this.localValue = this.root.querySelector('[data-coordinate-local]') as HTMLElement;
    this.projectedValue = this.root.querySelector('[data-coordinate-projected]') as HTMLElement;
    this.geographicValue = this.root.querySelector('[data-coordinate-geographic]') as HTMLElement;
    this.result = this.root.querySelector('[data-coordinate-result]') as HTMLElement;
    this.crs = this.root.querySelector('[data-coordinate-crs]') as HTMLElement;
    this.mode.onchange = () => { this.updateLabels(); this.fillSelected(); actions.clearPreview(); };
    this.yMode.onchange = () => { this.updateLabels(); this.fillSelected(); };
    this.root.querySelector<HTMLButtonElement>('[data-coordinate-action="pick"]')!.onclick = actions.pickFromMap;
    this.root.querySelector<HTMLButtonElement>('[data-coordinate-action="preview"]')!.onclick = () => actions.preview(this.readInput());
    this.root.querySelector<HTMLButtonElement>('[data-coordinate-action="deploy"]')!.onclick = () => actions.deploy(this.readInput());
    this.root.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((button) => button.onclick = () => void this.copy(button.dataset.copy as 'local'|'projected'|'geographic'));
    this.bindToggle('coordinateMarker', actions.toggleCoordinateMarker);
    this.bindToggle('localOrigin', actions.toggleLocalOrigin);
    this.bindToggle('terrainBounds', actions.toggleTerrainBounds);
    this.bindToggle('worldAxes', actions.toggleWorldAxes);
    this.bindToggle('meterGrid', actions.toggleMeterGrid);
    this.updateLabels();
  }

  setCoordinateReference(projectedCRS?: string): void {
    this.latest = undefined; this.selected = undefined; this.first.value = ''; this.second.value = ''; this.y.value = '';
    this.showCursor(null, 'outside'); this.result.dataset.tone = ''; this.result.textContent = 'Enter a coordinate or pick from the map.';
    this.crs.textContent = projectedCRS ?? 'LOCAL ONLY';
    for (const value of ['projected', 'geographic']) {
      const option = this.mode.querySelector<HTMLOptionElement>(`option[value="${value}"]`)!; option.disabled = !projectedCRS;
    }
    if (!projectedCRS && this.mode.value !== 'local') { this.mode.value = 'local'; this.updateLabels(); }
  }

  showCursor(result: CoordinatePlacementResult | null, state: 'coordinate' | 'no-terrain' | 'outside' | 'error' = 'coordinate'): void {
    if (!result || state !== 'coordinate') {
      this.latest = undefined;
      this.inspectorStatus.textContent = state === 'no-terrain' ? 'No terrain' : state === 'error' ? 'Coordinate error' : '--';
      this.localValue.textContent = '--'; this.projectedValue.textContent = '--'; this.geographicValue.textContent = '--'; return;
    }
    this.latest = result; this.inspectorStatus.textContent = 'Cursor Coordinate'; this.writeCoordinates(result);
  }

  selectCoordinate(result: CoordinatePlacementResult): void {
    this.selected = result; this.latest = result; this.writeCoordinates(result); this.fillSelected();
    this.result.dataset.tone = 'success'; this.result.textContent = 'Coordinate selected from terrain.';
  }

  showPlacementResult(result: CoordinatePlacementResult): void {
    this.selected = result.local ? result : this.selected;
    this.result.dataset.tone = result.success ? 'success' : 'error';
    this.result.textContent = `${result.success ? 'OK' : 'Placement rejected'} · ${result.code}\n${result.message}`;
    if (result.local) { this.latest = result; this.writeCoordinates(result); }
  }

  setPickActive(active: boolean): void {
    const button = this.root.querySelector<HTMLButtonElement>('[data-coordinate-action="pick"]')!;
    button.classList.toggle('active', active); button.textContent = active ? 'Cancel Pick' : 'Pick From Map';
  }

  private readInput(): CoordinatePlacementInput {
    return {
      assetType: this.select('asset').value,
      coordinateMode: this.mode.value as CoordinatePlacementInput['coordinateMode'],
      first: this.first.value,
      second: this.second.value,
      yMode: this.yMode.value as CoordinatePlacementInput['yMode'],
      y: this.y.value,
    };
  }

  private updateLabels(): void {
    const mode = this.mode.value;
    if (mode === 'local') { this.firstLabel.textContent = 'X · east (m)'; this.secondLabel.textContent = 'Z · south (m)'; this.yLabel.textContent = 'Local Y (m)'; }
    else if (mode === 'projected') { this.firstLabel.textContent = 'Easting (m)'; this.secondLabel.textContent = 'Northing (m)'; this.yLabel.textContent = 'Absolute elevation (m)'; }
    else { this.firstLabel.textContent = 'Longitude'; this.secondLabel.textContent = 'Latitude'; this.yLabel.textContent = 'Absolute elevation (m)'; }
    this.y.disabled = this.yMode.value === 'auto';
    if (this.y.disabled) this.y.value = '';
  }

  private fillSelected(): void {
    const result = this.selected; if (!result?.local) return;
    if (this.mode.value === 'local') { this.first.value = result.local.x.toFixed(2); this.second.value = result.local.z.toFixed(2); if (this.yMode.value === 'manual') this.y.value = result.local.y.toFixed(2); }
    else if (this.mode.value === 'projected' && result.projected) { this.first.value = result.projected.easting.toFixed(2); this.second.value = result.projected.northing.toFixed(2); if (this.yMode.value === 'manual') this.y.value = result.projected.elevation?.toFixed(2) ?? ''; }
    else if (this.mode.value === 'geographic' && result.geographic) { this.first.value = result.geographic.longitude.toFixed(6); this.second.value = result.geographic.latitude.toFixed(6); if (this.yMode.value === 'manual') this.y.value = result.geographic.elevation?.toFixed(2) ?? ''; }
  }

  private writeCoordinates(result: CoordinatePlacementResult): void {
    this.localValue.textContent = result.local ? `X ${result.local.x.toFixed(2)}\nY ${result.local.y.toFixed(2)}\nZ ${result.local.z.toFixed(2)}` : '--';
    this.projectedValue.textContent = result.projected ? `E ${result.projected.easting.toFixed(2)}\nN ${result.projected.northing.toFixed(2)}\nElev ${result.projected.elevation?.toFixed(2) ?? '--'}` : 'Unavailable';
    this.geographicValue.textContent = result.geographic ? `Lon ${result.geographic.longitude.toFixed(6)}\nLat ${result.geographic.latitude.toFixed(6)}` : 'Unavailable';
  }

  private async copy(kind: 'local'|'projected'|'geographic'): Promise<void> {
    const result = this.latest; let text = '';
    if (kind === 'local' && result?.local) text = `X=${result.local.x.toFixed(2)}, Y=${result.local.y.toFixed(2)}, Z=${result.local.z.toFixed(2)}`;
    if (kind === 'projected' && result?.projected) text = `E=${result.projected.easting.toFixed(2)}, N=${result.projected.northing.toFixed(2)}, Elevation=${result.projected.elevation?.toFixed(2) ?? ''}`;
    if (kind === 'geographic' && result?.geographic) text = `Lon=${result.geographic.longitude.toFixed(6)}, Lat=${result.geographic.latitude.toFixed(6)}`;
    if (!text) { this.result.dataset.tone = 'error'; this.result.textContent = 'No coordinate available to copy.'; return; }
    try { await navigator.clipboard.writeText(text); this.result.dataset.tone = 'success'; this.result.textContent = `${kind} coordinate copied.`; }
    catch { this.result.dataset.tone = 'error'; this.result.textContent = 'Clipboard permission was denied.'; }
  }

  private bindToggle(key: string, callback: (visible: boolean) => void): void {
    this.root.querySelector<HTMLInputElement>(`[data-coordinate-toggle="${key}"]`)!.onchange = (event) => callback((event.currentTarget as HTMLInputElement).checked);
  }
  private select(key: string): HTMLSelectElement { return this.root.querySelector(`[data-coordinate="${key}"]`) as HTMLSelectElement; }
  private input(key: string): HTMLInputElement { return this.root.querySelector(`[data-coordinate="${key}"]`) as HTMLInputElement; }
  private label(key: string): HTMLElement { return this.root.querySelector(`[data-coordinate-label="${key}"]`) as HTMLElement; }
}

function toggle(key: string, label: string, checked = false): string {
  return `<label class="toggle"><span>${label}</span><input type="checkbox" data-coordinate-toggle="${key}" ${checked ? 'checked' : ''}><i></i></label>`;
}
