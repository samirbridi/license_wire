import { createMorph } from './vendor/morphicons/dom.js';

// Original 24px line drawings. The animation engine is Morphicons (MIT).
const paths = Object.freeze({
  camera: 'M4 7h4l2-3h4l2 3h4v13H4ZM15 13a3 3 0 1 1-6 0a3 3 0 1 1 6 0',
  grid: 'M4 4h6v6H4ZM14 4h6v6h-6ZM4 14h6v6H4ZM14 14h6v6h-6Z',
  play: 'M8 5L19 12L8 19Z',
  open: 'M7 17L17 7M7 7h10v10',
  close: 'M6 6L18 18M18 6L6 18',
  info: 'M21 12a9 9 0 1 1-18 0a9 9 0 1 1 18 0M12 11v6M12 7v.1',
  refresh: 'M20 9a8 8 0 0 0-14-3L3 9M3 4v5h5M4 15a8 8 0 0 0 14 3l3-3M16 15h5v5',
  calendar: 'M4 5h16v16H4ZM8 3v4M16 3v4M4 10h16M8 14h2M14 14h2M8 18h2',
  lock: 'M5 10h14v11H5ZM8 10V7a4 4 0 0 1 8 0v3M12 14v3',
  volumeOff: 'M4 10h4l5-4v12l-5-4H4ZM17 9l5 6M22 9l-5 6',
  volumeOn: 'M4 10h4l5-4v12l-5-4H4ZM17 8a6 6 0 0 1 0 8M20 5a10 10 0 0 1 0 14',
  expand: 'M8 4H4v4M16 4h4v4M4 16v4h4M20 16v4h-4',
  dual: 'M3 5h8v14H3ZM14 5h7v14h-7Z',
  previous: 'M15 5L8 12l7 7',
  next: 'M9 5l7 7l-7 7',
  download: 'M12 3v12M7 10l5 5l5-5M5 17v4h14v-4',
});
const controls = new WeakMap();

export function createIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false', class: 'ui-icon' })) svg.setAttribute(key, value);
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', paths[name] || paths.camera); svg.append(path);
  return svg;
}

export function setIconButton(element, name, label = '') {
  let state = controls.get(element);
  if (!state) {
    const svg = createIcon(name), text = document.createElement('span');
    text.className = 'button-label'; element.replaceChildren(svg, text);
    element.classList.add('with-icon');
    state = { name, text, morph: createMorph(svg.firstElementChild, paths[name], { reducedMotion: 'user' }) };
    controls.set(element, state);
  } else if (state.name !== name) {
    state.morph.morphTo(paths[name], 'snappy'); state.name = name;
  }
  state.text.textContent = label; state.text.hidden = !label;
  element.dataset.icon = name;
}

export function hydrateIcons() {
  document.querySelectorAll('[data-icon]').forEach(element => setIconButton(element, element.dataset.icon, element.textContent.trim()));
}
