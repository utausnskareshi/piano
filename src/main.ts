// App entry. Boots state, registers the service worker, runs a hash-based router.

import { store } from './state';
import { renderLanding } from './ui/landing';
import { renderKeyboardScreen } from './ui/keyboard';
import { renderInstrumentsScreen } from './ui/instruments';
import { renderSongsScreen } from './ui/songs';
import { renderAddSongScreen } from './ui/add-song';
import './styles.css';

const root = document.getElementById('app')!;

async function route() {
  const hash = location.hash || '#/';
  // Lock viewport scroll only on play screen for keyboard precision.
  document.body.classList.toggle('on-play', hash === '#/play');
  switch (hash) {
    case '#/':
    case '#/help':
      renderLanding(root);
      break;
    case '#/play':
      await renderKeyboardScreen(root);
      break;
    case '#/instruments':
      renderInstrumentsScreen(root);
      break;
    case '#/songs':
      await renderSongsScreen(root);
      break;
    case '#/add-song':
      renderAddSongScreen(root);
      break;
    default:
      renderLanding(root);
  }
}

window.addEventListener('hashchange', route);

(async () => {
  await store.load();
  // Apply user preferences to the audio engine eagerly (engine starts on first gesture).
  store.applyCurrentPreset();
  await route();

  // PWA registration — provided by vite-plugin-pwa virtual module.
  try {
    const { registerSW } = await import('virtual:pwa-register');
    registerSW({ immediate: true });
  } catch {
    // Not built with PWA plugin (e.g. dev mode without it) — silently ignore.
  }
})();
