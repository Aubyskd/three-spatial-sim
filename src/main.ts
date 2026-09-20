import './styles/main.css';
import { Environment } from './algorithm/Environment';
import { runAlgorithmEnvironmentAcceptance } from './algorithm/AlgorithmEnvironmentAcceptance';
import { LocalBridge } from './bridge/LocalBridge';
import { MultiTerrainSimulation } from './core/MultiTerrainSimulation';
import { ExperimentPanel } from './ui/ExperimentPanel';

async function bootstrap(): Promise<void> {
  const host = document.querySelector<HTMLElement>('#app');
  if (!host) throw new Error('Application mount element #app is missing.');

  try {
    const simulation = await MultiTerrainSimulation.create(host);
    const environment = new Environment(simulation);
    const experimentPanel = new ExperimentPanel(host, environment, environment.getAvailableTerrains());
    const bridge = new LocalBridge(environment);
    // Deliberate development bridge: algorithms can call window.spatialEnvironment without touching Three.js meshes.
    Object.assign(window, { spatialEnvironment: environment, spatialExperimentRunner: experimentPanel.runner, spatialAlgorithmBridge: bridge });
    simulation.start();
    if (new URLSearchParams(location.search).get('algorithmSelfTest') === '1') {
      const report = await runAlgorithmEnvironmentAcceptance(environment);
      const output = document.createElement('pre'); output.id = 'algorithm-self-test'; output.textContent = JSON.stringify(report, null, 2); host.append(output);
    }
    document.querySelector('.loading-screen')?.remove();
  } catch (error) {
    console.error('Spatial simulation failed to initialize.', error);
    const message = error instanceof Error ? error.message : String(error);
    host.innerHTML = `<main class="fatal"><span>INITIALIZATION ERROR</span><h1>仿真未能启动</h1><p>${message}</p><button onclick="location.reload()">Reload</button></main>`;
  }
}

document.querySelector('#app')?.insertAdjacentHTML(
  'beforeend',
  '<div class="loading-screen"><div class="loader-mark"></div><span>BUILDING SPATIAL WORLD</span></div>',
);

void bootstrap();

declare global {
  interface Window {
    spatialEnvironment?: Environment;
    spatialExperimentRunner?: ExperimentPanel['runner'];
    spatialAlgorithmBridge?: LocalBridge;
  }
}
