let highestPanelZ = 20;
const panels = new Set<FloatingPanel>();

export interface FloatingPanelOptions {
  id: string;
  title: string;
  icon: string;
  headingSelector?: string;
}

/**
 * Turns a content panel into a dock-launched floating window. Only one window
 * is open at a time so the scene remains readable on small and large screens.
 */
export class FloatingPanel {
  private readonly heading: HTMLElement;
  private readonly body = document.createElement('div');
  private readonly closeButton = document.createElement('button');
  private readonly launcherButton = document.createElement('button');
  private readonly panelTitle: string;
  private drag?: { pointerId: number; offsetX: number; offsetY: number };

  constructor(private readonly root: HTMLElement, options: FloatingPanelOptions) {
    const heading = root.querySelector<HTMLElement>(options.headingSelector ?? '.panel-heading, .coordinate-heading');
    if (!heading) throw new Error(`Floating panel "${options.title}" has no heading.`);
    this.heading = heading;
    this.panelTitle = options.title;

    root.classList.add('floating-panel');
    root.dataset.floatingPanel = options.id;
    heading.classList.add('panel-drag-handle');
    this.body.className = 'floating-panel-body';
    for (const child of [...root.children]) if (child !== heading) this.body.append(child);
    root.append(this.body);

    this.closeButton.type = 'button';
    this.closeButton.className = 'panel-collapse-button';
    this.closeButton.textContent = '×';
    this.closeButton.title = `关闭${options.title}`;
    this.closeButton.setAttribute('aria-label', this.closeButton.title);
    heading.append(this.closeButton);

    const dock = getOrCreateDock(root.parentElement ?? document.body);
    this.launcherButton.type = 'button';
    this.launcherButton.className = 'panel-launcher-button';
    this.launcherButton.dataset.panelLauncher = options.id;
    this.launcherButton.dataset.tooltip = options.title;
    this.launcherButton.textContent = options.icon;
    this.launcherButton.title = options.title;
    this.launcherButton.setAttribute('aria-label', `打开${options.title}`);
    this.launcherButton.setAttribute('aria-expanded', 'false');
    dock.append(this.launcherButton);

    heading.addEventListener('pointerdown', this.onDragStart);
    heading.addEventListener('pointermove', this.onDragMove);
    heading.addEventListener('pointerup', this.onDragEnd);
    heading.addEventListener('pointercancel', this.onDragEnd);
    heading.addEventListener('dblclick', this.onHeadingDoubleClick);
    this.closeButton.addEventListener('click', this.close);
    this.launcherButton.addEventListener('click', this.toggleOpen);
    root.addEventListener('pointerdown', this.onPanelPointerEvent);
    root.addEventListener('pointermove', this.onPanelPointerEvent);
    root.addEventListener('pointerup', this.onPanelPointerEvent);
    root.addEventListener('wheel', this.onPanelPointerEvent);
    root.addEventListener('contextmenu', this.onPanelPointerEvent);
    window.addEventListener('resize', this.keepInsideViewport);

    panels.add(this);
    this.close();
  }

  private readonly onPanelPointerEvent = (event: Event): void => {
    event.stopPropagation();
  };

  private readonly bringToFront = (): void => {
    if (highestPanelZ >= 89) {
      highestPanelZ = 20;
      document.querySelectorAll<HTMLElement>('.floating-panel').forEach((panel) => { panel.style.zIndex = String(++highestPanelZ); });
    }
    this.root.style.zIndex = String(++highestPanelZ);
  };

  private readonly toggleOpen = (): void => {
    if (this.root.classList.contains('is-collapsed')) this.open(); else this.close();
  };

  private readonly open = (): void => {
    for (const panel of panels) if (panel !== this) panel.close();
    this.root.classList.remove('is-collapsed');
    this.launcherButton.classList.add('active');
    this.launcherButton.setAttribute('aria-expanded', 'true');
    this.launcherButton.setAttribute('aria-label', `关闭${this.panelTitle}`);
    this.bringToFront();
    requestAnimationFrame(() => this.clampToViewport());
  };

  private readonly close = (): void => {
    this.root.classList.add('is-collapsed');
    this.root.classList.remove('is-dragging');
    this.drag = undefined;
    this.launcherButton.classList.remove('active');
    this.launcherButton.setAttribute('aria-expanded', 'false');
    this.launcherButton.setAttribute('aria-label', `打开${this.panelTitle}`);
  };

  private readonly onHeadingDoubleClick = (event: MouseEvent): void => {
    if ((event.target as Element).closest('button, input, select, a, summary')) return;
    this.close();
  };

  private readonly onDragStart = (event: PointerEvent): void => {
    if (event.button !== 0 || (event.target as Element).closest('button, input, select, a, summary')) return;
    const bounds = this.root.getBoundingClientRect();
    this.drag = { pointerId: event.pointerId, offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top };
    this.root.style.left = `${bounds.left}px`;
    this.root.style.top = `${bounds.top}px`;
    this.root.style.right = 'auto';
    this.root.style.bottom = 'auto';
    this.root.classList.add('is-dragging');
    this.heading.setPointerCapture(event.pointerId);
    this.bringToFront();
    event.preventDefault();
    event.stopPropagation();
  };

  private readonly onDragMove = (event: PointerEvent): void => {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    const bounds = this.root.getBoundingClientRect();
    const left = clamp(event.clientX - this.drag.offsetX, 8, Math.max(8, window.innerWidth - bounds.width - 8));
    const top = clamp(event.clientY - this.drag.offsetY, 68, Math.max(68, window.innerHeight - bounds.height - 8));
    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
    event.preventDefault();
    event.stopPropagation();
  };

  private readonly onDragEnd = (event: PointerEvent): void => {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    this.drag = undefined;
    this.root.classList.remove('is-dragging');
    if (this.heading.hasPointerCapture(event.pointerId)) this.heading.releasePointerCapture(event.pointerId);
    this.clampToViewport();
    event.preventDefault();
    event.stopPropagation();
  };

  private readonly keepInsideViewport = (): void => {
    if (!this.root.classList.contains('is-collapsed')) this.clampToViewport();
  };

  private clampToViewport(): void {
    const bounds = this.root.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const left = clamp(bounds.left, 8, Math.max(8, window.innerWidth - bounds.width - 8));
    const top = clamp(bounds.top, 68, Math.max(68, window.innerHeight - bounds.height - 8));
    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
    this.root.style.right = 'auto';
    this.root.style.bottom = 'auto';
  }
}

function getOrCreateDock(host: HTMLElement): HTMLElement {
  const existing = host.querySelector<HTMLElement>('.panel-launcher');
  if (existing) return existing;
  const dock = document.createElement('nav');
  dock.className = 'panel-launcher';
  dock.setAttribute('aria-label', '功能面板');
  host.append(dock);
  return dock;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
