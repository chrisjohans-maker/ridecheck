// Consistent inline-SVG icon set (Feather-style line icons) rendered in currentColor,
// replacing the mixed weather/condition emoji. Weather icons keyed by WMO code.

const P = {
  sun: '<circle cx="12" cy="12" r="4.5"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.2" y1="4.2" x2="5.6" y2="5.6"/><line x1="18.4" y1="18.4" x2="19.8" y2="19.8"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.2" y1="19.8" x2="5.6" y2="18.4"/><line x1="18.4" y1="5.6" x2="19.8" y2="4.2"/>',
  partly: '<circle cx="8" cy="8" r="3"/><line x1="8" y1="2.5" x2="8" y2="3.8"/><line x1="2.5" y1="8" x2="3.8" y2="8"/><line x1="4.2" y1="4.2" x2="5.1" y2="5.1"/><line x1="11.8" y1="4.2" x2="10.9" y2="5.1"/><path d="M17.5 20H8a4 4 0 0 1 0-8 5 5 0 0 1 9.5-1 3.5 3.5 0 0 1 0 9z"/>',
  cloud: '<path d="M17.5 19H7a4.5 4.5 0 0 1 0-9 5.5 5.5 0 0 1 10.5-1 3.8 3.8 0 0 1 0 10z"/>',
  fog: '<path d="M16.5 12.5H6a4 4 0 0 1 0-8 5 5 0 0 1 9.5-1 3.5 3.5 0 0 1 1 9z" opacity="0.9"/><line x1="4" y1="17" x2="20" y2="17"/><line x1="7" y1="21" x2="17" y2="21"/>',
  rain: '<path d="M17.5 15H7a4.5 4.5 0 0 1 0-9 5.5 5.5 0 0 1 10.5-1 3.8 3.8 0 0 1 0 10z"/><line x1="8" y1="18" x2="7" y2="21"/><line x1="12" y1="18" x2="11" y2="21"/><line x1="16" y1="18" x2="15" y2="21"/>',
  snow: '<path d="M17.5 15H7a4.5 4.5 0 0 1 0-9 5.5 5.5 0 0 1 10.5-1 3.8 3.8 0 0 1 0 10z"/><line x1="8" y1="19" x2="8.01" y2="19"/><line x1="12" y1="20.5" x2="12.01" y2="20.5"/><line x1="16" y1="19" x2="16.01" y2="19"/>',
  thunder: '<path d="M17.5 14H7a4.5 4.5 0 0 1 0-9 5.5 5.5 0 0 1 10.5-1 3.8 3.8 0 0 1 0 10z"/><polyline points="12 13 9.5 17 13 17 10.5 21.5"/>',
  thermometer: '<path d="M14 14.76V4.5a2.5 2.5 0 0 0-5 0v10.26a4.5 4.5 0 1 0 5 0z"/>',
  droplet: '<path d="M12 2.7l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
  wind: '<path d="M9.6 4.6A2 2 0 1 1 11 8H2m10.6 11.4A2 2 0 1 0 14 16H2m15.7-8.3A2.5 2.5 0 1 1 19.5 12H2"/>',
  sunrise: '<path d="M17 18a5 5 0 0 0-10 0"/><line x1="12" y1="2" x2="12" y2="9"/><polyline points="8 6 12 2 16 6"/><line x1="2" y1="18" x2="4" y2="18"/><line x1="20" y1="18" x2="22" y2="18"/><line x1="4.9" y1="10.9" x2="6.3" y2="12.3"/><line x1="17.7" y1="12.3" x2="19.1" y2="10.9"/><line x1="1" y1="22" x2="23" y2="22"/>',
  sunset: '<path d="M17 18a5 5 0 0 0-10 0"/><line x1="12" y1="9" x2="12" y2="2"/><polyline points="16 5 12 9 8 5"/><line x1="2" y1="18" x2="4" y2="18"/><line x1="20" y1="18" x2="22" y2="18"/><line x1="4.9" y1="10.9" x2="6.3" y2="12.3"/><line x1="17.7" y1="12.3" x2="19.1" y2="10.9"/><line x1="1" y1="22" x2="23" y2="22"/>',
};

function wrap(paths, px, label) {
  // Labeled → announced as an image; unlabeled → decorative (hidden from AT,
  // since these icons sit next to text that already conveys the meaning).
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true" focusable="false"';
  return `<svg ${a11y} width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-0.18em;">${paths}</svg>`;
}

// A UI icon by name (thermometer, droplet, wind, sun, sunrise, sunset).
export function uiIcon(name, px = 20, label) {
  return P[name] ? wrap(P[name], px, label) : '';
}

// Map a WMO weather code to an icon type.
export function weatherType(code) {
  if ([0, 1].includes(code)) return 'sun';
  if (code === 2) return 'partly';
  if (code === 3) return 'cloud';
  if ([45, 48].includes(code)) return 'fog';
  if ([71, 73, 75].includes(code)) return 'snow';
  if ([56, 57, 66, 67].includes(code)) return 'snow'; // freezing → snow glyph
  if ([95, 96, 99].includes(code)) return 'thunder';
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return 'rain';
  return 'sun';
}

// Weather icon (inline SVG) for a WMO code. Pass `label` (e.g. the condition
// name) to announce it to screen readers; omit for decorative use next to text.
export function weatherSvg(code, px = 20, label) {
  return wrap(P[weatherType(code)], px, label);
}
