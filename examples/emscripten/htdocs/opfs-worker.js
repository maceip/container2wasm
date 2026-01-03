// opfs-worker.js - OPFS sync agent worker for happy-opfs
import { startSyncAgent } from 'https://esm.sh/happy-opfs@latest';

// Start the sync agent to handle requests from main thread
startSyncAgent();
