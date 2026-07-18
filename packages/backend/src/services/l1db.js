// packages/backend/src/services/l1db.js
const mongoose = require('mongoose');

const L1_URI = process.env.MONGO_URI_L1 || process.env.MONGO_URI;

const l1DB = mongoose.createConnection(L1_URI, {
  serverSelectionTimeoutMS: 30000,
  connectTimeoutMS: 30000,
  socketTimeoutMS: 60000,
  bufferCommands: true,
  maxPoolSize: 3,
});

l1DB.on('connected', () => console.log('🔵 L1 MongoDB connected (salva-l1 DB)'));
l1DB.on('error', (e) => console.error('❌ L1 MongoDB error:', e.message));
l1DB.on('disconnected', () =>
  console.warn('⚠️ L1 MongoDB disconnected — will reconnect on demand')
);

// ── FIX: this is now a FUNCTION, not a stale promise. ────────────────────────
// Every call re-checks the CURRENT readyState and returns a promise that
// resolves once THIS connection attempt settles — not whatever happened
// the first time the module loaded.
l1DB.waitUntilReady = function (timeoutMs = 10000) {
  if (l1DB.readyState === 1) return Promise.resolve(true);

  return new Promise((resolve) => {
    let settled = false;
    const onConnected = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(true);
    };
    const onError = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      console.error('❌ L1 MongoDB connect wait failed:', err.message);
      resolve(false);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      console.warn('⚠️ L1 MongoDB wait timed out after', timeoutMs, 'ms');
      resolve(false);
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      l1DB.removeListener('connected', onConnected);
      l1DB.removeListener('error', onError);
    }

    l1DB.once('connected', onConnected);
    l1DB.once('error', onError);

    // If it's currently disconnected (not actively connecting), nudge it.
    // Mongoose's driver normally auto-reconnects, but this covers cases
    // where the connection object is fully closed rather than mid-retry.
    if (l1DB.readyState === 0) {
      l1DB
        .openUri(L1_URI)
        .catch((e) => console.error('❌ L1 manual reconnect attempt failed:', e.message));
    }
  });
};

// Kept for backward compatibility with any old `await l1db.readyPromise` calls —
// but now it's a getter that always returns a FRESH promise, not a cached one.
Object.defineProperty(l1DB, 'readyPromise', {
  get() {
    return l1DB.waitUntilReady(15000);
  },
});

module.exports = l1DB;
