import type { DebugRenderer } from '../render/DebugRenderer';
import type { NavigationCell } from './NavMeshManager';

interface NavigationDebugSource { getCells(): NavigationCell[]; }

export class NavigationDebug {
  constructor(
    private readonly nav: NavigationDebugSource,
    private readonly debug: DebugRenderer,
  ) {}

  refresh(): void {
    this.debug.drawNavigationCells(this.nav.getCells());
  }

  setVisible(visible: boolean): void {
    this.debug.setNavVisible(visible);
  }
}
