require('dotenv').config({
  path: require('path').resolve(__dirname, '../../.env'),
});
const mongoose = require('mongoose');

const l1DB = mongoose.createConnection(process.env.MONGO_URI_L1 || process.env.MONGO_URI, {
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  bufferCommands: true, // ← KEY FIX: allow buffering until connected
  maxPoolSize: 3,
});

l1DB.on('connected', () => console.log('🔵 L1 MongoDB connected (salva-l1 DB)'));
l1DB.on('error', (e) => console.error('❌ L1 MongoDB error:', e.message));
l1DB.on('disconnected', () => console.warn('⚠️ L1 MongoDB disconnected'));

// Export a promise that resolves once connected, for explicit awaiting
l1DB.readyPromise = new Promise((resolve) => {
  l1DB.once('connected', resolve);
  l1DB.once('error', (err) => {
    console.error('❌ L1 MongoDB failed to connect (non-fatal):', err.message);
    resolve(); // resolve anyway so the server doesn't crash
  });
});

module.exports = l1DB;
