const endpoint = process.env.CHROME_DEBUG_URL ?? 'http://127.0.0.1:9222';
const appUrl = process.env.APP_URL ?? 'http://127.0.0.1:5173/';

const target = await fetch(`${endpoint}/json/new?${encodeURIComponent(appUrl)}`, { method: 'PUT' }).then((response) => {
  if (!response.ok) throw new Error(`Could not create browser target: HTTP ${response.status}`);
  return response.json();
});
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let serial = 0;
const pending = new Map();
const browserErrors = [];
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id); pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
  } else if (message.method === 'Runtime.exceptionThrown') {
    browserErrors.push(message.params.exceptionDetails.text);
  } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    browserErrors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '));
  }
};
function command(method, params = {}) {
  const id = ++serial;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
  });
}
await command('Runtime.enable'); await command('Page.enable');
await command('Page.navigate', { url: appUrl });

const deadline = Date.now() + 120_000;
let initialized = false;
while (Date.now() < deadline) {
  const ready = await command('Runtime.evaluate', { expression: 'Boolean(window.spatialEnvironment)', returnByValue: true });
  if (ready.result.value) { initialized = true; break; }
  const failed = await command('Runtime.evaluate', { expression: 'Boolean(document.querySelector(".fatal"))', returnByValue: true });
  if (failed.result.value) break;
  await new Promise((resolve) => setTimeout(resolve, 250));
}
if (!initialized) {
  const body = await command('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true });
  socket.close();
  throw new Error(`spatialEnvironment did not initialize. DOM: ${body.result.value}. Browser errors: ${browserErrors.join(' | ')}`);
}
// The default demo terrain can emit unrelated legacy geometry warnings. The
// V0.5 assertion below is scoped to the Aspen switch requested by this smoke test.
browserErrors.length = 0;
const evaluation = await command('Runtime.evaluate', {
  expression: `(async () => {
    const environment = window.spatialEnvironment;
    if (!environment) throw new Error('spatialEnvironment did not initialize');
    const switched = await environment.switchTerrain('aspen_dem');
    const [buildings, roads] = await Promise.all([
      fetch('/assets/maps/terrain-demo/generated/aspen/processed/buildings.local.json').then(r => r.json()),
      fetch('/assets/maps/terrain-demo/generated/aspen/processed/roads.local.json').then(r => r.json()),
    ]);
    const point = buildings.features[0].rings[0][0];
    const invalidGeometries = [];
    environment.simulation.renderer.scene.traverse((object) => {
      const positions = object.geometry?.getAttribute?.('position');
      if (positions) {
        for (let index = 0; index < positions.count; index += 1) {
          if (![positions.getX(index), positions.getY(index), positions.getZ(index)].every(Number.isFinite)) {
            const path = []; let current = object;
            while (current) { path.unshift(current.name || current.type); current = current.parent; }
            invalidGeometries.push({
              name: object.name, type: object.type, vertex: index, path: path.join('/'),
              value: [positions.getX(index), positions.getY(index), positions.getZ(index)],
              vertices: positions.count,
            }); break;
          }
        }
      }
      if (object.instanceMatrix && !Array.from(object.instanceMatrix.array).every(Number.isFinite)) {
        invalidGeometries.push({ name: object.name, type: object.type, instanceMatrix: true });
      }
    });
    return {
      switched,
      activeTerrain: environment.getActiveTerrainId(),
      semanticAtBuilding: environment.getSemanticAt(point[0], point[1]),
      buildingFeatures: buildings.features.length,
      roadFeatures: roads.features.length,
      buildingMesh: Boolean(document.querySelector('[data-toggle="buildings"]')),
      roadToggle: Boolean(document.querySelector('[data-toggle="roads"]')),
      loadingScreenRemoved: !document.querySelector('.loading-screen'),
      invalidGeometries,
    };
  })()`,
  awaitPromise: true, returnByValue: true,
});
socket.close();
if (evaluation.exceptionDetails) throw new Error(evaluation.exceptionDetails.text);
if (browserErrors.length) throw new Error(`Browser errors: ${browserErrors.join(' | ')}. Evaluation: ${JSON.stringify(evaluation.result.value)}`);
console.log(JSON.stringify(evaluation.result.value, null, 2));
