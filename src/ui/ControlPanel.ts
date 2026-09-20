import type { Observation } from '../algorithm/Observation';

export interface ControlPanelActions {
  onReset: () => void;
  onToggleNav: (visible: boolean) => void;
  onTogglePhysics: (visible: boolean) => void;
  onToggleSemantic: (visible: boolean) => void;
  onAddRestricted: () => void;
  onClearRestricted: () => void;
}

export class ControlPanel {
  private readonly root: HTMLElement;
  private readonly values = new Map<string, HTMLElement>();
  private readonly notice: HTMLElement;
  private readonly editButton: HTMLButtonElement;
  private noticeTimer?: number;

  constructor(host: HTMLElement, actions: ControlPanelActions) {
    this.root = document.createElement('aside');
    this.root.className = 'control-panel';
    this.root.innerHTML = `
      <div class="panel-heading">
        <div><span class="eyebrow">SPATIAL LAB / 01</span><h1>智能空间仿真</h1></div>
        <span class="live-dot">LIVE</span>
      </div>
      <div class="metrics">
        ${this.metric('fps', 'FPS', '—')}
        ${this.metric('agent', 'AGENT', '—')}
        ${this.metric('target', 'TARGET', '—')}
        ${this.metric('region', 'SEMANTIC', '—')}
        ${this.metric('path', 'PATH', '—')}
        ${this.metric('physics', 'PHYSICS', 'RAPIER · 60 HZ')}
      </div>
      <div class="divider"></div>
      <div class="toggle-list">
        ${this.toggle('nav', 'Navigation cells', false)}
        ${this.toggle('physics', 'Physics colliders', false)}
        ${this.toggle('semantic', 'Semantic layer', true)}
      </div>
      <div class="button-grid">
        <button data-action="reset" class="primary">Reset simulation</button>
        <button data-action="restrict">Add restricted area</button>
        <button data-action="clear">Clear manual areas</button>
      </div>
      <p class="hint">单击地面设置目标 · 拖动旋转 · 滚轮缩放</p>
      <div class="notice" aria-live="polite"></div>
    `;
    host.append(this.root);
    this.notice = this.root.querySelector('.notice') as HTMLElement;
    this.editButton = this.root.querySelector('[data-action="restrict"]') as HTMLButtonElement;

    for (const element of this.root.querySelectorAll<HTMLElement>('[data-value]')) {
      this.values.set(element.dataset.value ?? '', element);
    }
    (this.root.querySelector('[data-action="reset"]') as HTMLButtonElement).onclick = actions.onReset;
    this.editButton.onclick = actions.onAddRestricted;
    (this.root.querySelector('[data-action="clear"]') as HTMLButtonElement).onclick = actions.onClearRestricted;
    (this.root.querySelector('[data-toggle="nav"]') as HTMLInputElement).onchange = (event) =>
      actions.onToggleNav((event.currentTarget as HTMLInputElement).checked);
    (this.root.querySelector('[data-toggle="physics"]') as HTMLInputElement).onchange = (event) =>
      actions.onTogglePhysics((event.currentTarget as HTMLInputElement).checked);
    (this.root.querySelector('[data-toggle="semantic"]') as HTMLInputElement).onchange = (event) =>
      actions.onToggleSemantic((event.currentTarget as HTMLInputElement).checked);
  }

  update(fps: number, observation: Observation): void {
    this.set('fps', fps.toFixed(0));
    this.set('agent', this.vector(observation.agent.position));
    this.set('target', observation.target ? this.vector(observation.target.position) : 'NOT SET');
    this.set('region', observation.currentRegion?.toUpperCase() ?? 'UNCLASSIFIED');
    this.set('path', observation.pathStatus.toUpperCase());
  }

  setPhysicsStatus(status: string): void {
    this.set('physics', status);
  }

  setEditing(active: boolean, hasPoints = false): void {
    this.editButton.classList.toggle('active', active);
    this.editButton.textContent = active
      ? hasPoints ? 'Finish region (3+ points)' : 'Click terrain points…'
      : 'Add restricted area';
  }

  showNotice(message: string, tone: 'info' | 'error' | 'success' = 'info'): void {
    window.clearTimeout(this.noticeTimer);
    this.notice.textContent = message;
    this.notice.dataset.tone = tone;
    this.notice.classList.add('visible');
    this.noticeTimer = window.setTimeout(() => this.notice.classList.remove('visible'), 4200);
  }

  private set(key: string, value: string): void {
    const element = this.values.get(key);
    if (element) element.textContent = value;
  }

  private vector(position: { x: number; z: number }): string {
    return `${position.x.toFixed(1)}, ${position.z.toFixed(1)}`;
  }

  private metric(key: string, label: string, value: string): string {
    return `<div class="metric"><span>${label}</span><strong data-value="${key}">${value}</strong></div>`;
  }

  private toggle(key: string, label: string, checked: boolean): string {
    return `<label class="toggle"><span>${label}</span><input type="checkbox" data-toggle="${key}" ${checked ? 'checked' : ''}><i></i></label>`;
  }
}
