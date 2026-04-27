// config.js
export const SALVA_API_URL =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:3001"
    : "https://salva-web.vercel.app";
