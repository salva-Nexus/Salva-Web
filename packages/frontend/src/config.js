// config.js
import { Capacitor } from '@capacitor/core';

// Capacitor's Android/iOS WebView serves the app from hostname "localhost"
// by default — so a plain hostname check can't distinguish "running in the
// browser on my dev machine" from "running inside the native app on a real
// phone." isNativePlatform() checks the actual runtime, not the URL, so the
// native app always talks to the real deployed backend, while local browser
// dev still gets the local backend.
const isLocalWebDev =
  !Capacitor.isNativePlatform() &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const SALVA_API_URL = isLocalWebDev
  ? 'http://127.0.0.1:3001'
  : 'https://salva-web.vercel.app';