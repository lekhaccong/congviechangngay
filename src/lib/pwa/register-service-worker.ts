import { Capacitor } from "@capacitor/core";

export function registerServiceWorker(): void {
  if (Capacitor.isNativePlatform() || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => { void navigator.serviceWorker.register("/sw.js").catch((error) => console.error("[pwa]", error)); }, { once: true });
}
