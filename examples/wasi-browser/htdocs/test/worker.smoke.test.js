import { expect } from 'chai';

function waitForMessage(worker, type, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type}`)), timeout);
    const handler = (event) => {
      if (event.data && event.data.type === type) {
        clearTimeout(timer);
        worker.removeEventListener('message', handler);
        resolve(event.data);
      }
    };
    worker.addEventListener('message', handler);
  });
}

describe('opfs worker smoke', () => {
  it('responds with opfs-ready on status ping', async () => {
    const worker = new Worker('../worker.js', { type: 'module' });
    worker.postMessage({ type: 'opfs-status' });
    const ready = await waitForMessage(worker, 'opfs-ready', 10000);
    expect(ready.type).to.equal('opfs-ready');
    worker.terminate();
  });

  it('returns snapshot failure cleanly when WASI not initialized', async () => {
    const worker = new Worker('../worker.js', { type: 'module' });
    worker.postMessage({ type: 'opfs-status' });
    await waitForMessage(worker, 'opfs-ready', 10000);

    worker.postMessage({ type: 'snapshot', name: 'test-smoke' });
    const result = await waitForMessage(worker, 'snapshot_result', 10000);
    expect(result.success).to.be.false;
    expect(result.error).to.be.a('string');
    worker.terminate();
  });
});
