// ─── Extracted pure logic (unit-tested in tests/) ───
import { WMO_CODES, WMO_SHORT, nwsTextToWMO, nwsWind, nwsDir } from './lib/weather-codes.js';
import { toDisplay as _toDisplay, toWindDisplay as _toWindDisplay, unitLabel as _unitLabel, windDir } from './lib/units.js';
import { escHtml, csvCell } from './lib/strings.js';
import { calcStreak } from './lib/streak.js';
import { locationNow as _locationNow } from './lib/time.js';
import { FOOD_DB, matchFood } from './lib/food.js';
import { estimateDuration as _estimateDuration, getDurationBucket } from './lib/duration.js';
import { buildFuelingPlan, buildNutritionPlan } from './lib/fueling.js';
import { weatherPenalty } from './lib/scoring.js';
import { summarizeNowcast } from './lib/nowcast.js';
import { windStrategy, latestSafeStart } from './lib/advice.js';
import { computeInsights } from './lib/insights.js';
import { weatherSvg, uiIcon } from './lib/weather-icons.js';
import { updateAvailable } from './lib/version.js';
import { parseBackup, mergeRides } from './lib/backup.js';

// Build id baked in at build time (Vite `define`); 'dev' in un-built contexts.
const RUNNING_BUILD = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';
let _updateShown = false;
let _lastUpdateCheck = 0;

// Detect a new deploy so users don't sit on a stale bundle (see version.json).
async function checkForUpdate() {
  const now = Date.now();
  if (now - _lastUpdateCheck < 30000) return; // throttle to every 30s
  _lastUpdateCheck = now;
  try {
    const res = await fetchWithTimeout('/version.json?_=' + now, {}, 5000);
    if (!res.ok) return;
    const { build } = await res.json();
    if (updateAvailable(RUNNING_BUILD, build)) showUpdateBanner();
  } catch (e) { /* offline or missing — ignore */ }
}

function showUpdateBanner() {
  if (_updateShown) return;
  _updateShown = true;
  const b = document.createElement('button');
  b.id = 'updateBanner';
  b.setAttribute('aria-label', 'Update available — tap to refresh');
  b.setAttribute('role', 'status');
  b.textContent = '🔄 Update available — tap to refresh';
  b.setAttribute('style', 'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 70px);transform:translateX(-50%);z-index:9999;background:var(--green);color:#fff;border:none;border-radius:999px;padding:10px 18px;font-family:inherit;font-size:0.85rem;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,0.3);cursor:pointer;-webkit-appearance:none;');
  b.addEventListener('click', () => location.reload());
  document.body.appendChild(b);
}


// Thin wrappers: read the global appState and delegate to the pure cores above.
function toDisplay(tempF) { return _toDisplay(tempF, appState.tempUnit); }
function toWindDisplay(mph) { return _toWindDisplay(mph, appState.tempUnit); }
function unitLabel() { return _unitLabel(appState.tempUnit); }
function locationNow() { return _locationNow(appState.weather?.utc_offset_seconds); }
function estimateDuration(distanceMi, rideType) { return _estimateDuration(distanceMi, rideType, appState.elevationM); }

/* ===========================================
   RideCheck — Mobile Cycling Conditions App
   =========================================== */


const TRAIL_TYPES = {
  cycleway:    { label:"Dedicated Cycleway",  icon:"🚲", surface:"paved"   },
  path:        { label:"Shared Path",         icon:"🛤️", surface:"varies"  },
  track:       { label:"Trail / Track",       icon:"🌿", surface:"unpaved" },
  footway:     { label:"Multi-use Path",      icon:"🚶", surface:"paved"   },
  residential: { label:"Residential Street", icon:"🏘️", surface:"paved"   },
  primary:     { label:"Main Road Bike Lane", icon:"🛣️", surface:"paved"   },
  secondary:   { label:"Road with Bike Lane", icon:"🛣️", surface:"paved"   },
};

const AQ_LEVELS = [
  { max:50,       label:"Good",                    color:"#52B788", bg:"#D8EDDF", desc:"Great air. No concerns for cycling." },
  { max:100,      label:"Moderate",                 color:"#E9A01A", bg:"#FDF3DC", desc:"Acceptable. Sensitive riders may notice on long rides." },
  { max:150,      label:"Unhealthy for Sensitive",  color:"#C05621", bg:"#FFF0E0", desc:"Sensitive riders should reduce intensity." },
  { max:200,      label:"Unhealthy",                color:"#C1121F", bg:"#FFE5E7", desc:"Shorten your ride or move indoors." },
  { max:300,      label:"Very Unhealthy",           color:"#7B0D1E", bg:"#FFE5E7", desc:"Avoid outdoor exercise." },
  { max:Infinity, label:"Hazardous",                color:"#4A0000", bg:"#FFE5E7", desc:"Do not ride outdoors." }
];

// ─── STATE ────────────────────────────────────────────────────
const appState = {
  geo: null, weather: null, airQuality: null,
  trails: [], shops: [],
  rideType: 'road', duration: 'medium',
  distanceMi: null, unit: 'mi',
  weightKg: 70, weightUnit: 'lb',
  intensity: 'moderate',
  tempUnit: 'F',
  elevationM: null,
  activeProfile: null,
  forecastDays: null,
  bikeType: 'road',
  leafletMap: null, mapLayers: [],
  activeFilter: 'all',
};

// ─── DOM ──────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ─── COMPAT HELPERS ───────────────────────────────────────────
// AbortSignal.timeout() not available on iOS < 16.4 — polyfill it
function fetchWithTimeout(url, opts, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...opts, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

// Current wall-clock time at the *searched location*, using Open-Meteo's utc_offset_seconds.
// Forecast time strings (Open-Meteo + our NWS mapping) are location-local naive, so comparing
// them against the device clock is wrong whenever the user checks a location in another timezone.
// Falls back to device time until the offset is known.

// ─── STORAGE HELPERS ──────────────────────────────────────────
function getSaved() {
  try { return JSON.parse(localStorage.getItem('ridecheck_saved') || '[]'); } catch { return []; }
}

// Location history — auto-populated, replaces explicit "save"
function getLocationHistory() {
  try {
    const history = JSON.parse(localStorage.getItem('ridecheck_history') || '[]');
    // One-time migration: seed from old saved locations
    if (!history.length) {
      const old = JSON.parse(localStorage.getItem('ridecheck_saved') || '[]');
      if (old.length) {
        old.forEach(s => {
          if (!history.some(h => h.label === s.label)) {
            history.push({ postal: s.postal, label: s.label, city: s.city || s.label.split(',')[0], state: s.state || '', country: '', lat: null, lon: null, lastUsed: Date.now() });
          }
        });
        localStorage.setItem('ridecheck_history', JSON.stringify(history));
      }
    }
    return history;
  } catch { return []; }
}

function addToLocationHistory(geo, postal) {
  const history = getLocationHistory();
  const entry = {
    postal:  postal || geo.postal || '',
    label:   geo.label,
    city:    geo.city  || geo.label.split(',')[0],
    state:   geo.state || '',
    country: geo.country || '',
    lat:     geo.lat,
    lon:     geo.lon,
    lastUsed: Date.now(),
  };
  // Remove existing entry for same city
  const filtered = history.filter(h => h.label !== entry.label);
  filtered.unshift(entry);
  if (filtered.length > 10) filtered.pop();
  localStorage.setItem('ridecheck_history', JSON.stringify(filtered));
}

function removeFromLocationHistory(label) {
  const history = getLocationHistory().filter(h => h.label !== label);
  localStorage.setItem('ridecheck_history', JSON.stringify(history));
}
function getLastUsed() {
  try { return JSON.parse(localStorage.getItem('ridecheck_last') || 'null'); } catch { return null; }
}
function setLastUsed(postal, label) {
  const city = appState.geo?.city || label.split(',')[0];
  const state = appState.geo?.state || '';
  localStorage.setItem('ridecheck_last', JSON.stringify({ postal, label, city, state, fetchedAt: Date.now() }));
}

// ─── INIT (runs once on page load) ───────────────────────────
function init() {
  renderSavedLocations();
  setupNavigation();
  setupSearchForm();
  setupBackButton();
  setupSaveButton();
  setupGearTab();
  setupDarkMode();
  setupTempUnit();
  setupProfiles();
  // Settings button on search screen
  $('btnOpenSettings')?.addEventListener('click', openSettings);
  $('btnTopSettings')?.addEventListener('click', openSettings);

  // Restore weight on boot
  const savedWeight     = localStorage.getItem('ridecheck_weight');
  const savedWeightUnit = localStorage.getItem('ridecheck_weight_unit') || 'lb';
  if (savedWeight) {
    const raw = parseFloat(savedWeight);
    appState.weightUnit = savedWeightUnit;
    appState.weightKg   = savedWeightUnit === 'lb' ? raw * 0.453592 : raw;
    const wInput = $('weightInput');
    if (wInput) wInput.value = savedWeight;
    document.querySelectorAll('.unit-btn[data-wunit]').forEach(b => {
      b.classList.toggle('active', b.dataset.wunit === savedWeightUnit);
    });
    updateWeightSettingsSub();
  }

  // Weight row tap — open sheet
  $('settingWeight')?.addEventListener('click', openWeightSheet);
  $('weightSheetBackdrop')?.addEventListener('click', closeWeightSheet);
  $('weightSheetClose')?.addEventListener('click', closeWeightSheet);

  // Unit toggle in weight sheet
  document.querySelectorAll('.unit-btn[data-wunit]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.unit-btn[data-wunit]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const prev = appState.weightUnit;
      appState.weightUnit = btn.dataset.wunit;
      const wInput = $('weightInput');
      if (wInput?.value) {
        const val = parseFloat(wInput.value);
        if (!isNaN(val)) {
          wInput.value = appState.weightUnit === 'kg'
            ? Math.round(val * 0.453592 * 10) / 10
            : Math.round(val * 2.20462);
        }
      }
    });
  });

  // Save button in weight sheet
  $('weightSheetSave')?.addEventListener('click', () => {
    const raw = parseFloat($('weightInput').value);
    if (!isNaN(raw) && raw > 0) {
      appState.weightKg = appState.weightUnit === 'lb' ? raw * 0.453592 : raw;
      localStorage.setItem('ridecheck_weight', $('weightInput').value);
      localStorage.setItem('ridecheck_weight_unit', appState.weightUnit);
      updateWeightSettingsSub();
      if (appState.weather) renderGear();
      if (navigator.vibrate) navigator.vibrate(40);
    }
    closeWeightSheet();
  });

  // Weight input in settings
  $('weightInput')?.addEventListener('input', () => {
    const raw = parseFloat($('weightInput').value);
    if (!isNaN(raw) && raw > 0) {
      appState.weightKg = appState.weightUnit === 'lb' ? raw * 0.453592 : raw;
      localStorage.setItem('ridecheck_weight', $('weightInput').value);
      localStorage.setItem('ridecheck_weight_unit', appState.weightUnit);
      updateWeightSettingsSub();
      if (appState.weather) renderGear();
    } else {
      appState.weightKg = 70;
    }
  });

  // Weight unit toggle in settings
  document.querySelectorAll('.unit-btn[data-wunit]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.unit-btn[data-wunit]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const prev = appState.weightUnit;
      appState.weightUnit = btn.dataset.wunit;
      const input = $('weightInput');
      if (input?.value) {
        const val = parseFloat(input.value);
        if (!isNaN(val)) {
          input.value = appState.weightUnit === 'kg'
            ? Math.round(val * 0.453592 * 10) / 10
            : Math.round(val * 2.20462);
        }
      }
      const raw = parseFloat($('weightInput')?.value);
      if (!isNaN(raw) && raw > 0) {
        appState.weightKg = appState.weightUnit === 'lb' ? raw * 0.453592 : raw;
        localStorage.setItem('ridecheck_weight', $('weightInput').value);
        localStorage.setItem('ridecheck_weight_unit', appState.weightUnit);
        updateWeightSettingsSub();
        if (appState.weather) renderGear();
      }
    });
  });
  setupWeightInterstitial();
  setupLogEdit();
  setupLocationSwitcher();
  setupForecastDetail();
  setupStrava();
  setupFoodChecker();
  setupOnboarding();
  setupVisibilityRefresh();
  setupPullToRefresh();
  setupRideLog();
  setupShare();
  setupLogFilter();
  setupSettings();
  autoLoadDefaultProfile();
  autoLoadLastLocation();
}

// Bulletproof delegation for critical buttons
document.addEventListener('click', e => {
  // Log ride save (submit button inside sheet)
  if (e.target.closest('#logSave')) {
    e.preventDefault();
try { saveEntry(); } catch(err) { console.error(err); showToast('Error: ' + err.message); }
    return;
  }
  // Log ride open (green button on Log tab)
  if (e.target.closest('#btnLogRide')) {
try { openLogSheet(); } catch(err) { console.error(err); showToast('Error opening log'); }
    return;
  }
  // Log sheet cancel
  if (e.target.closest('#logSheetCancel') || e.target.closest('#logCancelBtn')) {
try { closeLogSheet(); } catch(err) { console.error(err); }
    return;
  }
});


const STALE_MS = 10 * 60 * 1000; // 10 minutes

function autoLoadLastLocation() {
  let last = getLastUsed();
  // Fall back to most recent history entry
  if (!last) {
    const history = getLocationHistory();
    if (history.length) last = history[0];
  }
  if (!last) return;

  // Show "Loading your last location" hint on search screen
  const hint = $('searchReturning');
  const hintText = $('searchReturningText');
  if (hint && hintText) {
    const city = last.city || (last.label ? last.label.split(',')[0] : last.postal);
    hintText.textContent = `Loading ${city}…`;
    hint.classList.remove('hidden');
  }

  $('postalInput').value = last.postal;
  runCheck(last.postal);
}

// Called when app becomes visible again (tab/app switch back)
function setupVisibilityRefresh() {
  
function updateTimestamp() {
  const el = $('lastUpdated');
  if (!el || !appState._lastFetchTime) return;
  const mins = Math.round((Date.now() - appState._lastFetchTime) / 60000);
  if (mins < 1) el.textContent = 'Updated just now';
  else if (mins === 1) el.textContent = 'Updated 1 min ago';
  else el.textContent = 'Updated ' + mins + ' min ago';
}
// Keep timestamp fresh every 60s
setInterval(updateTimestamp, 60000);

function checkAndRefresh() {
    if (typeof updateTimestamp === 'function') updateTimestamp();
    const last = getLastUsed();
    if (!last || !appState.geo) return;
    const age = last.fetchedAt ? Date.now() - last.fetchedAt : Infinity;
    if (age > STALE_MS) {
      runCheck(last.postal);
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkAndRefresh();
  });
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) checkAndRefresh();
  });
  window.addEventListener('focus', checkAndRefresh);
}

// ─── NAVIGATION ───────────────────────────────────────────────
function setupNavigation() {
  $('bottomNav').addEventListener('click', e => {
    const item = e.target.closest('.nav-item');
    if (!item) return;
    const tabId = item.dataset.tab;
    document.querySelectorAll('.nav-item').forEach(n => { n.classList.remove('active'); n.removeAttribute('aria-current'); });
    document.querySelectorAll('.tab-pane').forEach(p => {
      p.classList.remove('active');
      p.scrollTop = 0; // reset scroll on every tab switch
    });
    item.classList.add('active');
    item.setAttribute('aria-current', 'page');
    $(tabId).classList.add('active');
    if (tabId === 'tabFood') {
      renderFoodTab();
    }
  });
}

function setupBackButton() {
  // btnBack — topbar back arrow (shown on app screen)
  $('btnBack')?.addEventListener('click', () => {
    $('screenApp').classList.remove('active');
    $('screenSearch').classList.add('active');
    $('searchBackBtn')?.classList.remove('hidden');
    $('postalInput').value = '';
    setTimeout(() => $('postalInput')?.focus(), 200);
  });

  // searchBackBtn — back button on search screen (shown when returning from app)
  $('searchBackBtn')?.addEventListener('click', () => {
    $('screenSearch').classList.remove('active');
    $('screenApp').classList.add('active');
    $('searchBackBtn')?.classList.add('hidden');
  });
}

function setupSaveButton() {
  $('btnSave').addEventListener('click', () => {
    if (!appState.geo) return;
    const saved  = getSaved();
    const postal = $('postalInput').value.trim();
    const label  = appState.geo.label;
    const existing = saved.findIndex(s =>
      s.postal === postal.toUpperCase() ||
      s.postal === postal ||
      s.label  === label
    );
    if (existing >= 0) {
      saved.splice(existing, 1);
      $('btnSave').classList.remove('saved');
      $('btnSave').textContent = 'Save';
    } else {
      saved.unshift({
        postal: postal.toUpperCase(),
        label:  appState.geo.label,
        city:   appState.geo.city  || label.split(',')[0],
        state:  appState.geo.state || '',
      });
      if (saved.length > 5) saved.pop();
      $('btnSave').classList.add('saved');
      $('btnSave').textContent = 'Saved ✓';
    }
    localStorage.setItem('ridecheck_saved', JSON.stringify(saved));
    renderSavedLocations();
    showToast(existing >= 0 ? 'Location removed' : 'Location saved');
  });
}

function setupDarkMode() {
  // Default to dark mode — only go light if user explicitly chose light
  const stored = localStorage.getItem('ridecheck_dark');
  const isDark = stored === null ? true : stored === '1';
  if (isDark) {
    document.body.classList.add('dark');
    updateDarkIcon(true);
  }
  $('btnDark').addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark');
    localStorage.setItem('ridecheck_dark', isDark ? '1' : '0');
    updateDarkIcon(isDark);
  });
}

function updateDarkIcon(isDark) {
  const btn = $('btnDark');
  // Moon icon for light mode (click to go dark), sun icon for dark mode (click to go light)
  btn.innerHTML = isDark
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
}

function updateSaveButton() {
  const postal  = $('postalInput').value.trim();
  const label   = appState.geo?.label || '';
  const saved   = getSaved();
  const isSaved = saved.some(s =>
    s.postal === postal.toUpperCase() ||
    s.postal === postal ||
    s.label  === label
  );
  const btn = $('btnSave');
  if (btn) {
    btn.classList.toggle('saved', isSaved);
    btn.textContent = isSaved ? 'Saved ✓' : 'Save';
  }
}

// ─── SAVED LOCATIONS ──────────────────────────────────────────
function renderSavedLocations() {
  const saved = getSaved();
  const section = $('savedSection');
  const list = $('savedList');
  if (!saved.length) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  list.innerHTML = saved.map((s, i) => `
    <div class="saved-item" data-postal="${escHtml(s.postal)}">
      <div class="saved-item-left">
        <span class="saved-item-icon">📍</span>
        <div>
          <div class="saved-item-name">${escHtml(s.city || s.label)}</div>
          <div class="saved-item-code">${escHtml(s.postal)}</div>
        </div>
      </div>
      <button class="saved-item-del" data-index="${i}" aria-label="Remove">✕</button>
    </div>
  `).join('');

  list.querySelectorAll('.saved-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.saved-item-del')) return;
      $('postalInput').value = el.dataset.postal;
      runCheck(el.dataset.postal);
    });
  });
  list.querySelectorAll('.saved-item-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const saved = getSaved();
      saved.splice(parseInt(btn.dataset.index), 1);
      localStorage.setItem('ridecheck_saved', JSON.stringify(saved));
      renderSavedLocations();
    });
  });
}

// ─── SEARCH FORM + AUTOCOMPLETE ──────────────────────────────
let _acDebounce = null;
let _acResults  = [];
let _acIndex    = -1;
let _acSelected = null; // { lat, lon, label, postal } from autocomplete pick

function setupSearchForm() {
  const input    = $('postalInput');
  const dropdown = $('autocompleteDropdown');
  const clearBtn = $('searchClear');

  // Show/hide clear button
  input.addEventListener('input', () => {
    clearBtn.classList.toggle('hidden', !input.value);
    $('searchHint').textContent = '';
    _acSelected = null;

    clearTimeout(_acDebounce);
    const val = input.value.trim();
    if (val.length < 2) { hideDropdown(); return; }
    _acDebounce = setTimeout(() => fetchSuggestions(val), 300);
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.classList.add('hidden');
    hideDropdown();
    input.focus();
    _acSelected = null;
  });

  // Keyboard navigation
  input.addEventListener('keydown', e => {
    if (!_acResults.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _acIndex = Math.min(_acIndex + 1, _acResults.length - 1);
      highlightItem(_acIndex);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _acIndex = Math.max(_acIndex - 1, 0);
      highlightItem(_acIndex);
    } else if (e.key === 'Enter' && _acIndex >= 0) {
      e.preventDefault();
      selectResult(_acResults[_acIndex]);
    } else if (e.key === 'Escape') {
      hideDropdown();
    }
  });

  // Close dropdown on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('#searchForm')) hideDropdown();
  });

  $('searchForm').addEventListener('submit', async e => {
    e.preventDefault();
    hideDropdown();

    // If user picked from dropdown, use that directly
    if (_acSelected) {
      input.blur();
      await runCheckFromGeo(_acSelected);
      return;
    }

    const val = input.value.trim();
    if (val.length < 2) {
      $('searchHint').textContent = 'Please enter a city or postal code.';
      return;
    }
    $('searchHint').textContent = '';
    input.blur();
    // Free-text geocode
    await runCheckFromQuery(val);
  });
}

async function fetchSuggestions(query) {
  const dropdown = $('autocompleteDropdown');
  dropdown.classList.remove('hidden');
  dropdown.innerHTML = `<div class="autocomplete-loading"><div class="spinner"></div><span>Searching…</span></div>`;

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&addressdetails=1&featuretype=city,town,village,postcode`;
    const res = await fetchWithTimeout(url, { headers: { 'Accept-Language': 'en' } }, 8000);
    const data = await res.json();
    _acResults = data.map(d => {
      const addr = d.address || {};
      const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || d.display_name.split(',')[0].trim();
      const state = addr.state || addr.region || '';
      const country = addr.country || '';
      const postal = addr.postcode || '';
      const type = d.type || d.class || '';
      const icon = type === 'administrative' || ['city','town','village','municipality'].includes(type) ? '🏙️'
                 : postal ? '📮' : '📍';
      const detail = [state, country].filter(Boolean).join(', ');
      return { lat: parseFloat(d.lat), lon: parseFloat(d.lon), city, state, country, postal, label: [city, state, addr.country_code?.toUpperCase()].filter(Boolean).join(', '), icon, detail, displayName: d.display_name };
    });

    renderDropdown(_acResults);
  } catch {
    dropdown.innerHTML = '<div class="autocomplete-loading">Search unavailable</div>';
  }
}

function renderDropdown(results) {
  const dropdown = $('autocompleteDropdown');
  _acIndex = -1;
  if (!results.length) {
    dropdown.innerHTML = '<div class="autocomplete-loading">No results found</div>';
    return;
  }
  dropdown.innerHTML = results.map((r, i) => `
    <div class="autocomplete-item" data-index="${i}">
      <div class="autocomplete-icon">${r.icon}</div>
      <div class="autocomplete-info">
        <div class="autocomplete-name">${escHtml(r.city)}</div>
        <div class="autocomplete-detail">${escHtml(r.detail)}${r.postal ? ` · ${escHtml(r.postal)}` : ''}</div>
      </div>
    </div>
  `).join('');

  dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
    item.addEventListener('mousedown', e => e.preventDefault()); // prevent blur
    item.addEventListener('click', () => {
      selectResult(_acResults[parseInt(item.dataset.index)]);
    });
  });
}

function highlightItem(index) {
  document.querySelectorAll('.autocomplete-item').forEach((el, i) => {
    el.classList.toggle('highlighted', i === index);
  });
}

function selectResult(result) {
  $('postalInput').value = result.city + (result.state ? `, ${result.state}` : '');
  $('searchClear').classList.remove('hidden');
  _acSelected = result;
  _acResults = [];
  hideDropdown();
}

function hideDropdown() {
  $('autocompleteDropdown').classList.add('hidden');
  _acResults = [];
  _acIndex = -1;
}

// Run check using a pre-resolved geo object (from autocomplete)
async function runCheckFromGeo(geo) {
  // Request-sequence guard: if the user picks another location mid-fetch, the older
  // (slower) response must not overwrite/merge into the newer one.
  const myReq = appState._reqSeq = (appState._reqSeq || 0) + 1;
  const isCurrent = () => myReq === appState._reqSeq;
  showLoading('Fetching weather & air quality…');
  try {
    $('postalInput').value = geo.city || geo.label;

    const [weather, airQuality, elevationM] = await Promise.all([
      fetchWeather(geo.lat, geo.lon),
      fetchAirQuality(geo.lat, geo.lon),
      fetchElevation(geo.lat, geo.lon),
    ]);
    if (!isCurrent()) return; // superseded by a newer check
    appState.geo = geo;
    appState.weather    = weather;
    appState._lastFetchTime = Date.now();
    appState.airQuality = airQuality;
    appState.elevationM = elevationM;

    // Override forecast with NWS data for US locations (more accurate)
    const isUS = geo.lat >= 24 && geo.lat <= 50 && geo.lon >= -125 && geo.lon <= -66;
    if (isUS) {
      try {
        const nws = await fetchNWSForecast(geo.lat, geo.lon);
        if (!isCurrent()) return; // superseded while waiting on NWS
        if (nws) {
          // Keep Open-Meteo current conditions + sunrise/sunset + UV
          // Override hourly and daily with NWS data
          const omSunrise = weather.daily?.sunrise;
          const omSunset = weather.daily?.sunset;
          const omUVMax = weather.daily?.uv_index_max;
          
          appState.weather.hourly = { ...appState.weather.hourly, ...nws.hourly };
          appState.weather.daily = { ...appState.weather.daily, ...nws.daily };
          
          // Restore Open-Meteo fields NWS doesn't provide
          if (omSunrise) appState.weather.daily.sunrise = omSunrise;
          if (omSunset) appState.weather.daily.sunset = omSunset;
          if (omUVMax) appState.weather.daily.uv_index_max = omUVMax;
          
          console.log('NWS forecast data merged successfully');
          // Also override current weather code with NWS current hour data
          const nowHour = locationNow().hour; // NWS times are location-local, so use location hour
          const nwsHourIdx = nws.hourly.time.findIndex(t => {
            const h = parseInt(t.split('T')[1]);
            return h === nowHour;
          });
          if (nwsHourIdx >= 0) {
            appState.weather.current.weather_code = nws.hourly.weather_code[nwsHourIdx];
            // Also update current temp and wind from NWS if available
            // Use != null so legitimate zeros (0°F, calm wind, due-north 0°, 0% humidity) aren't dropped
            if (nws.hourly.temperature_2m[nwsHourIdx] != null) {
              appState.weather.current.temperature_2m = nws.hourly.temperature_2m[nwsHourIdx];
              appState.weather.current.apparent_temperature = nws.hourly.temperature_2m[nwsHourIdx];
            }
            if (nws.hourly.wind_speed_10m[nwsHourIdx] != null) {
              appState.weather.current.wind_speed_10m = nws.hourly.wind_speed_10m[nwsHourIdx];
            }
            if (nws.hourly.relative_humidity_2m[nwsHourIdx] != null) {
              appState.weather.current.relative_humidity_2m = nws.hourly.relative_humidity_2m[nwsHourIdx];
            }
            if (nws.hourly.wind_direction_10m[nwsHourIdx] != null) {
              appState.weather.current.wind_direction_10m = nws.hourly.wind_direction_10m[nwsHourIdx];
            }
            console.log('NWS current hour override applied');
          }
        }
      } catch(e) { console.warn('NWS merge failed:', e); }
    }

    if (!isCurrent()) return; // superseded — let the newer check own the UI
    hideLoading();
    // Only switch to app view if still on search screen
    if (!$('screenApp')?.classList.contains('active')) {
      switchToApp(geo);
    } else {
      renderAll();
      updateTimestamp();
    }
    renderAll();
    loadTrailsAndShops(geo);
  } catch (err) {
    console.error(err);
    hideLoading();
    $('searchHint').textContent = 'Something went wrong. Please try again.';
  }
}

// Run check from free-text query (fallback if no autocomplete pick)
async function runCheckFromQuery(query) {
  showLoading('Locating…');
  try {
    // Try as postal code first, then free text
    const isPostal = /^[A-Z0-9 -]{2,10}$/i.test(query) && query.length <= 10;
    let geo = isPostal ? await geocodePostal(query) : null;
    if (!geo) geo = await geocodeFreeText(query);
    if (!geo) {
      hideLoading();
      $('searchHint').textContent = 'Location not found. Try a different city name.';
      return;
    }
    await runCheckFromGeo(geo);
  } catch (err) {
    console.error(err);
    hideLoading();
    $('searchHint').textContent = 'Something went wrong. Please try again.';
  }
}

async function geocodeFreeText(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1`;
  const res = await fetchWithTimeout(url, { headers: { 'Accept-Language': 'en' } }, 8000);
  const data = await res.json();
  if (!data.length) return null;
  const d = data[0];
  const addr = d.address || {};
  const city = addr.city || addr.town || addr.village || addr.county || d.display_name.split(',')[0].trim();
  const state = addr.state || addr.region || '';
  const country = addr.country_code?.toUpperCase() || '';
  return { lat: parseFloat(d.lat), lon: parseFloat(d.lon), city, state, country, label: [city, state, country].filter(Boolean).join(', ') };
}


// ─── MAIN ORCHESTRATOR ────────────────────────────────────────
// runCheck: used by saved locations + auto-load (accepts postal or city string)
async function runCheck(query) {
  return runCheckFromQuery(query);
}

function loadTrailsAndShops(geo) {
  renderTrailsTab(geo);
}

// ─── BEST WINDOW ──────────────────────────────────────────────
function calcBestWindow(hourly) {
  if (!hourly?.time?.length) return null;

  const ln = locationNow();
  const nowHour = ln.hour;
  const nowDate = ln.date;

  // Get sunset/sunrise hours
  const sunsetRaw = appState.weather?.daily?.sunset?.[0];
  const sunriseRaw = appState.weather?.daily?.sunrise?.[0];
  const sunsetH = sunsetRaw ? new Date(sunsetRaw).getHours() : 20;
  const sunriseH = sunriseRaw ? new Date(sunriseRaw).getHours() : 5;

  // Score each FUTURE hour within daylight
  const scored = [];
  for (let i = 0; i < hourly.time.length; i++) {
    const t = hourly.time[i] || '';
    // Extract date and hour from string (avoid Date parsing entirely)
    const tDate = t.slice(0, 10); // "2026-07-01"
    const tHour = parseInt(t.slice(11, 13)) || 0; // 9, 10, 11...

    // Only today's hours
    if (tDate !== nowDate) continue;
    // Only future hours (current hour is borderline — include if just started)
    if (tHour <= nowHour) continue;
    // Only daylight hours
    if (tHour < sunriseH || tHour > sunsetH) continue;

    const fl   = hourly.apparent_temperature?.[i] ?? hourly.temperature_2m?.[i] ?? 65;
    const wind = hourly.wind_speed_10m?.[i] ?? 0;
    const pop  = hourly.precipitation_probability?.[i] ?? 0;
    const code = hourly.weather_code?.[i] ?? 0;
    const humid = hourly.relative_humidity_2m?.[i] ?? 50;
    const uv   = hourly.uv_index?.[i] ?? 0;

    let score = 100;

    // Shared weather brackets (temp/humidity/wind/precip/rain-prob/sky/UV) — see src/lib/scoring.js
    score += weatherPenalty({ fl, humid, wind, code, pop, uv });

    // Near sunset
    if (tHour >= sunsetH) score -= 15;
    else if (tHour >= sunsetH - 1) score -= 5;

    scored.push({
      time: t,
      hour: tHour,
      score: Math.max(0, Math.min(100, score)),
      wmo: WMO_CODES[code] || { icon:'☀️', label:'Clear' },
      fl: fl, wind: wind, pop: pop
    });
  }

  if (scored.length === 0) return null;

  // Find best 1-3 hour consecutive window
  let bestScore = 0, bestStart = scored[0], bestEnd = scored[0];
  for (let i = 0; i < scored.length; i++) {
    let sum = 0, count = 0;
    for (let j = i; j < Math.min(i + 3, scored.length); j++) {
      // Only consecutive hours
      if (j > i && scored[j].hour !== scored[j-1].hour + 1) break;
      sum += scored[j].score;
      count++;
      const avg = sum / count;
      if (avg > bestScore) {
        bestScore = avg;
        bestStart = scored[i];
        bestEnd = scored[j];
      }
    }
  }

  return { score: Math.round(bestScore), bestStart, bestEnd, hours: scored };
}


function renderBestWindow(hourly) {
  const card = $('bestWindowCard');
  if (!card) return;
  const result = calcBestWindow(hourly);
  if (!result || result.score < 40) {
    card.classList.remove('hidden');
    card.style.background = 'var(--surface)';
    card.style.border = '1px solid var(--border)';
    card.innerHTML = `
      <div class="best-window-icon">😔</div>
      <div class="best-window-info">
        <div class="best-window-label" style="color:var(--text-muted)">Best window today</div>
        <div class="best-window-time" style="color:var(--text);font-size:1rem;">No great window found</div>
        <div class="best-window-desc" style="color:var(--text-muted)">Conditions stay tough all day — consider riding tomorrow.</div>
      </div>
    `;
    return;
  }
  card.style.background = '';
  card.style.border = '';

  const fmt = d => (d instanceof Date ? d : new Date(d)).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });
  const startStr = fmt(result.bestStart.time);
  const endStr   = fmt(result.bestEnd.time);

  // Pick icon based on conditions
  const icon = result?.bestStart?.wmo?.icon || '🚲';
  const fl   = toDisplay(result.bestStart.fl);
  const windStr = toWindDisplay(result.bestStart.wind);
  const desc = result.score >= 75
    ? `${fl}${unitLabel()} · ${windStr} · looking great`
    : result.score >= 55
    ? `${fl}${unitLabel()} · ${windStr} · decent window`
    : `${fl}${unitLabel()} · ${windStr} · best available`;

  card.classList.remove('hidden');
  card.innerHTML = `
    <div class="best-window-icon">${icon}</div>
    <div class="best-window-info">
      <div class="best-window-label">Best window today</div>
      <div class="best-window-time">${startStr} – ${endStr}</div>
      <div class="best-window-desc">${desc}</div>
    </div>
  `;
}

// ─── RENDER ALL ───────────────────────────────────────────────
function renderRideTips(current, daily) {
  const el = $('rideTips');
  if (!el) return;
  if (!current) { el.setAttribute('style', 'display:none'); return; }

  const tips = [];

  // Wind strategy (only when meaningful)
  const ws = windStrategy(current.wind_speed_10m, current.wind_direction_10m);
  if (ws && ws.level !== 'calm') tips.push({ icon: '🧭', text: ws.text });

  // Latest safe start — uses the entered distance, else assumes 25 mi (shown in the text)
  const distMi = appState.distanceMi || 25;
  const durationMins = estimateDuration(distMi, appState.rideType);
  const sunsetRaw = daily?.sunset?.[0];
  const sunsetHourF = sunsetRaw ? (new Date(sunsetRaw).getHours() + new Date(sunsetRaw).getMinutes() / 60) : null;
  const ss = latestSafeStart(durationMins, sunsetHourF, locationNow().hourF);
  if (ss) {
    const suffix = appState.distanceMi ? '' : ` (${Math.round(distMi)} mi)`;
    tips.push({ icon: ss.feasible ? uiIcon('sunset', 18) : '🔦', text: ss.text + suffix });
  }

  if (!tips.length) { el.setAttribute('style', 'display:none'); return; }
  el.setAttribute('style', 'background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:12px 18px;margin-bottom:10px;display:flex;flex-direction:column;gap:8px;');
  el.innerHTML = tips.map(t =>
    `<div style="display:flex;align-items:center;gap:10px;font-size:0.9rem;color:var(--text-muted);line-height:1.4;">
      <span style="font-size:1.05rem;line-height:1;flex-shrink:0;">${t.icon}</span>
      <span>${escHtml(t.text)}</span>
    </div>`
  ).join('');
}

function renderNowcast(minutely15) {
  const el = $('precipNowcast');
  if (!el) return;
  const s = summarizeNowcast(minutely15, locationNow().wall.getTime());
  if (!s.hasData) { el.setAttribute('style', 'display:none'); return; }

  const icon = s.state === 'dry' ? '🚴' : weatherSvg(s.state === 'stopping' ? 80 : 63, 22);

  let bar = '';
  if (s.peakMm > 0) {
    const bars = s.series.map(b => {
      const h = Math.max(6, Math.round((b.mm / s.peakMm) * 100));
      const op = b.mm >= 0.1 ? 1 : 0.22;
      return `<div style="flex:1;min-width:3px;height:${h}%;background:#5AA0E0;opacity:${op};border-radius:2px 2px 0 0;"></div>`;
    }).join('');
    bar = `<div style="margin-top:10px;">
      <div style="display:flex;align-items:flex-end;gap:3px;height:30px;">${bars}</div>
      <div style="font-size:0.68rem;color:var(--text-faint);margin-top:4px;">next 2 hrs</div>
    </div>`;
  }

  el.setAttribute('style', 'background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:14px 18px;margin-bottom:10px;');
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;">
      <span style="font-size:1.2rem;line-height:1;color:var(--text);">${icon}</span>
      <span style="font-family:'Space Grotesk',monospace;font-size:0.95rem;font-weight:600;color:var(--text);">${escHtml(s.text)}</span>
    </div>
    ${bar}
  `;
}

function renderAll() {
  const { weather, airQuality } = appState;
  if (!weather?.current) return;
  const current = weather.current;
  const wmo = WMO_CODES[current.weather_code] || { label:'Unknown', icon:'🌡️', rain:false };

  const renders = [
    () => {
      const { score, factors } = calcConfidence(current, weather.hourly);
      renderConfidence(score, factors);
      renderGlanceable(current, weather.hourly, score);
      return { score, factors };
    },
    () => renderNowcast(weather.minutely_15),
    () => renderRideTips(current, weather.daily),
    () => renderConditions(current, weather.daily, airQuality),
    () => renderHourly(weather.hourly),
    () => renderWeeklyGoal(),
    () => { renderWeekForecast(weather.daily); renderMiniOutlook(); },
    () => renderGear(),
    () => renderBestWindow(weather.hourly),
    () => renderConditionsPills(calcConfidence(current, weather.hourly).factors),
  ];

  let ctx = {};
  const errors = [];
  for (let i = 0; i < renders.length; i++) {
    try { const r = renders[i](ctx); if (r) ctx = r; }
    catch (e) { errors.push(`Step ${i}: ${e.message}`); console.error('Render error step ' + i + ':', e); }
  }

  // Show errors visually if any
  let errEl = $('renderErrors');
  if (!errEl) {
    errEl = document.createElement('div');
    errEl.id = 'renderErrors';
    errEl.style.cssText = 'padding:8px 12px;margin:8px 0;background:#2a1010;border:1px solid #C1121F;border-radius:8px;font-size:0.75rem;color:#ff6b6b;display:none;word-break:break-all;';
    const hero = $('confidenceHero');
    if (hero) hero.parentNode.insertBefore(errEl, hero);
  }
  if (errors.length) {
    errEl.style.display = 'block';
    errEl.textContent = errors.join(' | ');
  } else {
    errEl.style.display = 'none';
  }
}

function switchToApp(geo) {
  $('searchReturning')?.classList.add('hidden');
  $('topbarLocation').innerHTML = `${escHtml(geo.city || geo.label.split(',')[0])} <span style="font-size:0.65rem;opacity:0.6">▾</span>`;

  // Persist the postal/query so it can be restored
  const query = $('postalInput').value.trim();
  geo.postal = geo.postal || query;

  setLastUsed(query, geo.label);
  addToLocationHistory(geo, query);  // auto-add to history
  updateSaveButton();
  updateTimestamp();
  $('screenSearch').classList.remove('active');
  $('screenApp').classList.add('active');
  // Reset to home tab
  document.querySelectorAll('.nav-item').forEach(n => { n.classList.remove('active'); n.removeAttribute('aria-current'); });
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelector('.nav-item[data-tab="tabHome"]').classList.add('active'); document.querySelector('.nav-item[data-tab="tabHome"]').setAttribute('aria-current','page');
  $('tabHome').classList.add('active');
  // Reset gear result panel
  $('gearResult').classList.add('hidden');
  // Dismiss keyboard and scroll home tab to top
  document.activeElement?.blur();
  setTimeout(() => { $('tabHome').scrollTop = 0; }, 50);

  // Show weight interstitial on first visit if no weight set
  if (!localStorage.getItem('ridecheck_weight') && !localStorage.getItem('ridecheck_weight_skipped',
                    'ridecheck_history',
                    'ridecheck_weekly_goal',
                    'ridecheck_strava')) {
    setTimeout(() => showWeightInterstitial(), 800);
  }
}

// ─── GEOCODING ────────────────────────────────────────────────
async function geocodePostal(postal) {
  const url = `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(postal)}&format=json&limit=1&addressdetails=1`;
  const res = await fetchWithTimeout(url, { headers: { 'Accept-Language': 'en' } }, 8000);
  const data = await res.json();
  if (!data.length) return null;
  const d = data[0];
  const addr = d.address || {};
  const city = addr.city || addr.town || addr.village || addr.county || d.display_name.split(',')[0].trim();
  const state = addr.state || addr.region || '';
  const country = addr.country_code?.toUpperCase() || '';
  return {
    lat: parseFloat(d.lat), lon: parseFloat(d.lon),
    city, state, country,
    label: [city, state, country].filter(Boolean).join(', '),
  };
}

// ─── WEATHER ──────────────────────────────────────────────────

// ── NWS API (US locations) ──

async function fetchNWSForecast(lat, lon) {
  try {
    const pr = await fetchWithTimeout('https://api.weather.gov/points/' + lat.toFixed(4) + ',' + lon.toFixed(4), { headers: { 'User-Agent': 'RideCheck Cycling App (ridecheckforvampires.netlify.app)' } }, 8000);
    if (!pr.ok) return null;
    const pts = await pr.json();
    const hUrl = pts.properties?.forecastHourly;
    if (!hUrl) return null;
    const hr = await fetchWithTimeout(hUrl + '?units=us', { headers: { 'User-Agent': 'RideCheck Cycling App (ridecheckforvampires.netlify.app)' } }, 8000);
    if (!hr.ok) return null;
    const hd = await hr.json();
    const periods = hd.properties?.periods;
    if (!periods?.length) return null;

    const time=[],temp=[],wc=[],pop=[],ws=[],wd=[],rh=[];
    periods.forEach(p => {
      // startTime is offset-aware (e.g. ...T23:00:00-05:00); slice the location-local wall clock directly
      time.push(p.startTime.slice(0,13)+':00:00');
      temp.push(p.temperature); wc.push(nwsTextToWMO(p.shortForecast));
      pop.push(p.probabilityOfPrecipitation?.value ?? 0);
      ws.push(nwsWind(p.windSpeed)); wd.push(nwsDir(p.windDirection));
      rh.push(p.relativeHumidity?.value ?? 50);
    });

    const days = {};
    periods.forEach(p => {
      const dk = p.startTime.slice(0,10); // location-local calendar date, not UTC
      if (!days[dk]) days[dk]={t:[],w:[],c:[],h:[]};
      days[dk].t.push(p.temperature); days[dk].w.push(nwsWind(p.windSpeed));
      days[dk].c.push(nwsTextToWMO(p.shortForecast)); days[dk].h.push(p.relativeHumidity?.value??50);
    });
    const dt=[],tmax=[],tmin=[],wmax=[],dc=[],hmax=[];
    Object.keys(days).sort().forEach(k => {
      const d=days[k]; dt.push(k);
      tmax.push(Math.max(...d.t)); tmin.push(Math.min(...d.t));
      wmax.push(Math.max(...d.w)); hmax.push(Math.max(...d.h));
      dc.push(d.c.sort((a,b)=>b-a)[0]);
    });

    return {
      hourly: { time, temperature_2m:temp, apparent_temperature:temp, weather_code:wc, precipitation_probability:pop, wind_speed_10m:ws, wind_direction_10m:wd, relative_humidity_2m:rh },
      daily: { time:dt, temperature_2m_max:tmax, temperature_2m_min:tmin, apparent_temperature_max:tmax, apparent_temperature_min:tmin, wind_speed_10m_max:wmax, weather_code:dc, relative_humidity_2m_max:hmax }
    };
  } catch(e) { console.warn('NWS failed:', e); return null; }
}

async function fetchWeather(lat, lon) {
  const modelParam = '';
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,relative_humidity_2m,precipitation,uv_index` +
    `&hourly=temperature_2m,apparent_temperature,weather_code,precipitation_probability,wind_speed_10m,wind_direction_10m,relative_humidity_2m,uv_index` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,wind_speed_10m_max,sunrise,sunset,uv_index_max,relative_humidity_2m_max` +
    `&minutely_15=precipitation&forecast_minutely_15=8` + // next 2 hrs (HRRR in N. America) for the next-hour nowcast
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=8${modelParam}`;
  const res = await fetchWithTimeout(url, {}, 8000);
  if (!res.ok) throw new Error('Open-Meteo forecast HTTP ' + res.status);
  const data = await res.json();
  if (!data || data.error) throw new Error('Open-Meteo forecast error: ' + (data && data.reason || 'unknown'));
  return data;
}

// ─── AIR QUALITY ──────────────────────────────────────────────
async function fetchAirQuality(lat, lon) {
  // US locations: use AirNow (EPA ground sensors, most accurate)
  const isUS = lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66;
  if (isUS) {
    try {
      // Proxied through a Netlify function so the AirNow API key stays server-side.
      const anUrl = '/.netlify/functions/airnow?lat=' + lat.toFixed(4) + '&lon=' + lon.toFixed(4);
      const res = await fetchWithTimeout(anUrl, {}, 8000);
      if (res.ok) {
        const data = await res.json();
        if (data && data.length) {
          // Find the worst (highest) AQI across all pollutants
          const worst = data.reduce((max, obs) => obs.AQI > max.AQI ? obs : max, data[0]);
          // Return in the same format the app expects
          return {
            current: {
              us_aqi: worst.AQI,
              pm2_5: data.find(d => d.ParameterName === 'PM2.5')?.AQI ?? null,
              pm10: data.find(d => d.ParameterName === 'PM10')?.AQI ?? null,
            },
            _source: 'airnow'
          };
        }
      }
    } catch(e) { console.warn('AirNow failed, falling back to Open-Meteo:', e); }
  }

  // Fallback: Open-Meteo (non-US or AirNow failure)
  try {
    const url = 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + lat + '&longitude=' + lon + '&current=us_aqi,pm2_5,pm10';
    const res = await fetchWithTimeout(url, {}, 8000);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.error) return null;
    return data;
  } catch(e) { return null; }
}

// Fetch elevation at the searched point (Open-Meteo elevation API — same origin, always works)
async function fetchElevation(lat, lon) {
  try {
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`;
    const res = await fetchWithTimeout(url, {}, 8000);
    if (!res.ok) return null;
    const data = await res.json();
    return data.elevation?.[0] ?? null;
  } catch { return null; }
}

// ─── TRAILS TAB ──────────────────────────────────────────────
function renderTrailsTab(geo) {
  const lat  = geo.lat.toFixed(5);
  const lon  = geo.lon.toFixed(5);
  const city = encodeURIComponent(geo.city || geo.label);

  // Condition-aware header
  const current = appState.weather?.current;
  const wmo     = current ? (WMO_CODES[current.weather_code] || {}) : {};
  const trailStatus = !current ? null
    : wmo.rain || [71,73,75].includes(current.weather_code)
      ? { icon:'⚠️', msg:'Wet conditions — trails may be slippery. Check surfaces before heading out.', bad:true }
    : current.apparent_temperature < 32
      ? { icon:'🧊', msg:'Below freezing — watch for ice on paths and shaded sections.', bad:true }
    : current.wind_speed_10m > 25
      ? { icon:'💨', msg:`Strong winds (${Math.round(current.wind_speed_10m)} mph) — exposed routes will be tough.`, bad:false }
    : current.apparent_temperature >= 55 && current.apparent_temperature <= 82
      ? { icon:'✅', msg:'Good conditions for most surfaces. Enjoy the ride.', bad:false }
    : null;

  // Categorised links — best URL formats verified
  const categories = [
    {
      label: '🗺️ Find routes',
      links: [
        {
          name: 'Komoot',
          desc: 'Curated routes with elevation, surface type and community reviews',
          url: `https://www.komoot.com/discover/cycling/@${lat},${lon},13z`,
          color: '#6CC04A',
          icon: '🗺️',
        },
        {
          name: 'RideWithGPS',
          desc: 'Route library with turn-by-turn directions and elevation profiles',
          url: `https://ridewithgps.com/find/routes?start_lat=${lat}&start_lng=${lon}&search_radius=20`,
          color: '#F7971C',
          icon: '📍',
        },
        {
          name: 'Strava Heatmap',
          desc: 'Global heatmap of where cyclists ride most — best indicator of quality local routes',
          url: `https://www.strava.com/maps/global-heatmap?sport=Ride&style=hot#13/${lat}/${lon}`,
          color: '#FC4C02',
          icon: '🔥',
        },
      ],
    },
    {
      label: '🛤️ Trail & path maps',
      links: [
        {
          name: 'OpenCycleMap',
          desc: 'Dedicated cycling map — bike lanes, paths, trails and elevation contours',
          url: `https://www.opencyclemap.org/?zoom=13&lat=${lat}&lon=${lon}&layers=B0000`,
          color: '#0057A8',
          icon: '🚲',
        },
        {
          name: 'OSM Cycling Layer',
          desc: 'OpenStreetMap cycling overlay — detailed surfaces and designations worldwide',
          url: `https://www.openstreetmap.org/#map=13/${lat}/${lon}&layers=C`,
          color: '#7EBC6F',
          icon: '🌍',
        },
        {
          name: 'Trailforks',
          desc: 'Mountain bike trail database with conditions, ratings and flow trails',
          url: `https://www.trailforks.com/region/discover/?lat=${lat}&lon=${lon}`,
          color: '#E8630A',
          icon: '⛰️',
        },
      ],
    },
    {
      label: '🔧 Bike shops & services',
      links: [
        {
          name: 'Google Maps — Bike shops',
          desc: 'Find nearby shops for repairs, tubes and emergency stops',
          url: `https://www.google.com/maps/search/bike+shop/@${lat},${lon},14z`,
          color: '#4285F4',
          icon: '🛠️',
        },
        {
          name: 'Google Maps — Bike rentals',
          desc: 'Find bike hire if you are travelling without your own',
          url: `https://www.google.com/maps/search/bike+rental/@${lat},${lon},14z`,
          color: '#34A853',
          icon: '🚴',
        },
      ],
    },
  ];

  const statusHtml = trailStatus ? `
    <div class="trail-status ${trailStatus.bad ? 'trail-status-bad' : 'trail-status-ok'}">
      <span class="trail-status-icon">${trailStatus.icon}</span>
      <span>${escHtml(trailStatus.msg)}</span>
    </div>
  ` : '';

  $('externalLinks').innerHTML = statusHtml + categories.map(cat => `
    <div class="ext-category">
      <div class="ext-category-label">${cat.label}</div>
      ${cat.links.map(l => `
        <a class="ext-link-card" href="${l.url}" target="_blank" rel="noopener">
          <div class="ext-link-icon" style="background:${l.color}18;color:${l.color}">${l.icon}</div>
          <div class="ext-link-info">
            <div class="ext-link-name">${escHtml(l.name)}</div>
            <div class="ext-link-desc">${escHtml(l.desc)}</div>
          </div>
          <div class="ext-link-arrow">→</div>
        </a>
      `).join('')}
    </div>
  `).join('');
}

// ─── GEAR TAB ─────────────────────────────────────────────────
// ─── GEAR TAB ─────────────────────────────────────────────────
function setupGearTab() {
  // Weight now managed in Settings

  // rideType derived from bikeType on restore above

  // Restore intensity
  const savedIntensity = localStorage.getItem('ridecheck_intensity');
  if (savedIntensity) {
    appState.intensity = savedIntensity;
    document.querySelectorAll('.ride-pill[data-intensity]').forEach(p => {
      p.classList.toggle('active', p.dataset.intensity === savedIntensity);
    });
  }

  // Restore distance unit
  const savedDistUnit = localStorage.getItem('ridecheck_dist_unit');
  if (savedDistUnit) {
    appState.unit = savedDistUnit;
    document.querySelectorAll('.unit-btn[data-unit]').forEach(b => {
      b.classList.toggle('active', b.dataset.unit === savedDistUnit);
    });
  }

  // Restore distance value
  const savedDist = localStorage.getItem('ridecheck_distance');
  if (savedDist) {
    const distInput = $('distanceInput');
    if (distInput) distInput.value = savedDist;
    const raw = parseFloat(savedDist);
    if (!isNaN(raw) && raw > 0) {
      appState.distanceMi = appState.unit === 'km' ? raw * 0.621371 : raw;
    }
  }

  // Ride type now derived from bike type

  // Unit toggle (mi / km)
  document.querySelectorAll('.unit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.unit-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const prevUnit = appState.unit;
      appState.unit = btn.dataset.unit;
      localStorage.setItem('ridecheck_dist_unit', appState.unit);
      // Convert existing value if any
      const input = $('distanceInput');
      if (input.value && prevUnit !== appState.unit) {
        const val = parseFloat(input.value);
        if (!isNaN(val)) {
          input.value = appState.unit === 'km'
            ? Math.round(val * 1.60934)
            : Math.round(val * 0.621371);
        }
      }
      updateDistanceAndRender();
    });
  });

  // Distance input
  $('distanceInput').addEventListener('input', () => updateDistanceAndRender());

  // Weight input
  $('weightInput').addEventListener('input', () => {
    const raw = parseFloat($('weightInput').value);
    if (!isNaN(raw) && raw > 0) {
      appState.weightKg = appState.weightUnit === 'lb' ? raw * 0.453592 : raw;
      localStorage.setItem('ridecheck_weight', $('weightInput').value);
      localStorage.setItem('ridecheck_weight_unit', appState.weightUnit);
    } else {
      appState.weightKg = 70;
    }
    if (appState.weather) renderGear();
  });

  // Weight unit toggle
  document.querySelectorAll('.unit-btn[data-wunit]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.unit-btn[data-wunit]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const prevUnit = appState.weightUnit;
      appState.weightUnit = btn.dataset.wunit;
      const input = $('weightInput');
      if (input.value && prevUnit !== appState.weightUnit) {
        const val = parseFloat(input.value);
        if (!isNaN(val)) {
          input.value = appState.weightUnit === 'lb'
            ? Math.round(val * 2.20462)
            : Math.round(val * 0.453592);
        }
      }
      const raw = parseFloat(input.value);
      appState.weightKg = (!isNaN(raw) && raw > 0)
        ? (appState.weightUnit === 'lb' ? raw * 0.453592 : raw)
        : 70;
      if (!isNaN(raw) && raw > 0) {
        localStorage.setItem('ridecheck_weight', $('weightInput').value);
        localStorage.setItem('ridecheck_weight_unit', appState.weightUnit);
        }
      if (appState.weather) renderGear();
    });
  });

  // Intensity pills
  document.querySelectorAll('.ride-pill[data-intensity]').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.ride-pill[data-intensity]').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      appState.intensity = pill.dataset.intensity;
      localStorage.setItem('ridecheck_intensity', appState.intensity);
      if (appState.weather) renderGear();
    });
  });

  // Bike type pills — also sets rideType for gear/fueling logic
  document.querySelectorAll('.ride-pill[data-bike]').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.ride-pill[data-bike]').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      appState.bikeType = pill.dataset.bike;
      appState.rideType = bikeTypeToRideType(appState.bikeType);
      localStorage.setItem('ridecheck_bike_type', appState.bikeType);
      localStorage.setItem('ridecheck_ride_type', appState.rideType);
      if (appState.weather) renderGear();
      renderPrepSummary();
    });
  });

  

  // Restore bike prefs
  const savedBikeType = localStorage.getItem('ridecheck_bike_type');
  if (savedBikeType) {
    appState.bikeType = savedBikeType;
    appState.rideType = bikeTypeToRideType(savedBikeType);
    document.querySelectorAll('.ride-pill[data-bike]').forEach(p => {
      p.classList.toggle('active', p.dataset.bike === savedBikeType);
    });
  }

}

function updateDistanceAndRender() {
  const raw = parseFloat($('distanceInput').value);
  if (!isNaN(raw) && raw > 0) {
    appState.distanceMi = appState.unit === 'km' ? raw * 0.621371 : raw;
    localStorage.setItem('ridecheck_distance', $('distanceInput').value);
  } else {
    appState.distanceMi = null;
    localStorage.removeItem('ridecheck_distance');
  }
  if (appState.weather) renderGear();
  renderPrepSummary();
}

function renderPrepSummary() {
  const el = $('prepSummary');
  if (!el) return;
  if (!appState.distanceMi) { el.classList.add('hidden'); return; }

  const durationMins = estimateDuration(appState.distanceMi, appState.rideType);
  const hrs = Math.floor(durationMins / 60);
  const mins = durationMins % 60;
  const durLabel = hrs > 0
    ? `${hrs}h${mins > 0 ? ` ${mins}m` : ''}`
    : `${mins}m`;
  const distLabel = appState.unit === 'km'
    ? `${Math.round(appState.distanceMi * 1.60934)} km`
    : `${Math.round(appState.distanceMi)} mi`;

  el.classList.remove('hidden');
  el.innerHTML = `
    <div>
      <div class="prep-summary-label">Planned ride</div>
      <div class="prep-summary-value">${escHtml(distLabel)}</div>
    </div>
    <div class="prep-summary-stats">
      <div class="prep-summary-stat">
        <div class="prep-summary-value">${durLabel}</div>
        <div class="prep-summary-label">est. time</div>
      </div>
      <div class="prep-summary-stat">
        <div class="prep-summary-value">${appState.rideType}</div>
        <div class="prep-summary-label">ride type</div>
      </div>
    </div>
  `;
}

// Called from renderAll and whenever ride type / duration changes
function renderGear() {
  if (!appState.weather) return;
  const current = appState.weather.current;
  const hourly  = appState.weather.hourly;
  const durationMins = appState.distanceMi
    ? estimateDuration(appState.distanceMi, appState.rideType)
    : null;
  const duration = getDurationBucket(durationMins);
  const items   = buildGearList(current, hourly, appState.rideType, duration, appState.bikeType);
  const gearResult = $('gearResult');
  gearResult.classList.remove('hidden');

  const grouped = {};
  items.forEach(item => {
    if (!grouped[item.cat]) grouped[item.cat] = [];
    grouped[item.cat].push(item);
  });

  gearResult.innerHTML = Object.entries(grouped).map(([cat, catItems]) => `
    <div class="gear-group">
      <div class="gear-group-label">${escHtml(cat)}</div>
      ${catItems.map(item => `
        <div class="gear-item">
          <div class="gear-item-icon">${escHtml(item.icon)}</div>
          <div class="gear-item-text">
            <div class="gear-item-name">${escHtml(item.name)}</div>
            <div class="gear-item-reason">${escHtml(item.reason)}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `).join('');

  renderFueling();
  renderNutrition();
  renderProfileContext();
  // Auto-open fueling + recovery sections when distance is set
  // Update section headers with item counts
  setTimeout(() => {
    const countItems = (id) => document.querySelectorAll('#' + id + ' .gear-item').length;
    const gearN = countItems('sectionGear');
    const fuelN = countItems('sectionFueling');
    const gearS = $('sectionGear')?.querySelector('summary');
    const fuelS = $('sectionFueling')?.querySelector('summary');
    if (gearS && gearN) gearS.innerHTML = `🎽 What to wear <span class="section-count">${gearN}</span>`;
    if (fuelS && fuelN) fuelS.innerHTML = `💧 Hydration &amp; fueling <span class="section-count">${fuelN}</span>`;
  }, 50);
}

// ─── GEAR LOGIC ENGINE ────────────────────────────────────────

function buildGearList(current, hourly, rideType, duration, bikeType) {
  const gear = [];
  const fl    = current.apparent_temperature ?? current.temperature_2m ?? 65;
  const wind  = current.wind_speed_10m ?? 0;
  const gusts = current.wind_gusts_10m;
  const uv    = current.uv_index ?? 0;
  const wmo   = current.weather_code;

  const isRaining = [51,53,55,61,63,65,80,81,82,95,96,99].includes(wmo);
  const isSnowing = [71,73,75].includes(wmo);
  const isFoggy   = [45,48].includes(wmo);

  // Intensity shifts the effective temperature felt by the body
  // Hard effort generates more heat — dress as if it\u0027s warmer
  // Easy effort generates less heat — dress as if it\u0027s cooler
  const intensityOffset = appState.intensity === 'hard' ? 8
                        : appState.intensity === 'easy' ? -6
                        : 0;
  const flEff = fl + intensityOffset; // effective feels-like for clothing decisions

  // Look 4 hours ahead from NOW (not from start of array)
  const now4h     = new Date();
  const hourlyTimes = hourly?.time || [];
  const nowIdx    = hourlyTimes.findIndex(t => new Date(t) >= now4h);
  const startIdx  = nowIdx >= 0 ? nowIdx : 0;
  const nextPop   = (hourly?.precipitation_probability || []).slice(startIdx, startIdx + 4);
  const nextFL    = (hourly?.apparent_temperature || hourly?.temperature_2m || []).slice(startIdx, startIdx + 4);
  const maxPop4h  = Math.max(...nextPop, 0);
  const minFL4h   = nextFL.length ? Math.min(...nextFL) : fl;
  const rainLikely  = isRaining || maxPop4h > 50;
  const coldComing  = minFL4h < fl - 8;

  // BASE LAYER — uses intensity-adjusted effective temp
  const intensityNote = appState.intensity === 'hard' ? ' (adjusted for hard effort heat)'
                      : appState.intensity === 'easy' ? ' (adjusted for easy pace)'
                      : '';
  if (isSnowing || flEff < 32)    gear.push({ icon:'🧥', cat:'Clothing', name:'Thermal bib tights + long sleeve base layer', reason:`Freezing at ${toDisplay(fl)}${unitLabel()}${intensityNote} — full thermal coverage essential` });
  else if (flEff < 45)            gear.push({ icon:'🧥', cat:'Clothing', name:'Bib tights + thermal jersey', reason:`Cold at ${toDisplay(fl)}${unitLabel()}${intensityNote} — keep legs and core warm` });
  else if (flEff < 58)            gear.push({ icon:'👕', cat:'Clothing', name:'Bib shorts + thermal jersey', reason:`Cool at ${toDisplay(fl)}${unitLabel()}${intensityNote} — light warmth on the bike` });
  else if (flEff < 75)            gear.push({ icon:'👕', cat:'Clothing', name:'Bib shorts + short sleeve jersey', reason:`Perfect temp at ${toDisplay(fl)}${unitLabel()}${intensityNote}` });
  else                            gear.push({ icon:'👕', cat:'Clothing', name:'Bib shorts + lightweight jersey', reason:`Warm at ${toDisplay(fl)}${unitLabel()}${intensityNote} — go light and breathe` });

  // MID / WIND LAYER — also intensity-adjusted
  if (flEff < 45 || (wind > 18 && flEff < 65))
    gear.push({ icon:'🦺', cat:'Clothing', name:'Wind vest / gilet', reason: flEff < 45 ? 'Insulates core without overheating arms' : `${toWindDisplay(wind)} wind — protect your chest` });

  // GLOVES — hands don\u0027t generate much heat, less intensity adjustment (halved)
  const flGloves = fl + intensityOffset * 0.5;
  if (fl < 32 || isSnowing)         gear.push({ icon:'🧤', cat:'Clothing', name:'Insulated full-finger gloves', reason:'Below freezing — bare hands lose grip and dexterity fast' });
  else if (flGloves < 52 || gusts > 22) gear.push({ icon:'🧤', cat:'Clothing', name:'Light cycling gloves', reason: flGloves < 52 ? `${toDisplay(fl)}${unitLabel()} — fingers will numb without protection` : `Gusts to ${toWindDisplay(gusts)} adds wind chill to hands` });

  // NECK / EARS
  if (flEff < 45)               gear.push({ icon:'🧣', cat:'Clothing', name:'Neck gaiter + ear covers', reason:'Seals the cold gap between collar and helmet' });

  // RAIN GEAR
  if (isRaining)               gear.push({ icon:'🌧️', cat:'Rain gear', name:'Waterproof cycling jacket', reason:`${WMO_SHORT[wmo] || 'Rain'} right now — stay dry or you'll get cold fast` });
  else if (rainLikely)         gear.push({ icon:'🌂', cat:'Rain gear', name:'Packable rain cape', reason:`${Math.round(maxPop4h)}% chance of rain in the next 4 hours` });
  if (isRaining || (rainLikely && duration !== 'short')) {
    const shoeType = bikeType === 'mtb' ? 'Waterproof MTB shoe covers' : 'Shoe covers / overshoes';
    gear.push({ icon:'👟', cat:'Rain gear', name:shoeType, reason:'Wet feet destroy comfort within 20 minutes' });
  }
  // Tyre advice for wet conditions by bike type
  if (isRaining && bikeType === 'road') gear.push({ icon:'🔧', cat:'Pre-ride checks', name:'Drop tyre pressure 5–10 psi', reason:'Lower pressure improves wet grip on road tyres significantly' });
  if (isRaining && bikeType === 'gravel') gear.push({ icon:'🔧', cat:'Pre-ride checks', name:'Mudguards / fenders if fitted', reason:'Gravel + rain = rooster tail up your back without coverage' });

  if (coldComing)              gear.push({ icon:'🧥', cat:'Clothing', name:'Extra layer in jersey pocket', reason:`Feels like temp drops ${Math.round(Math.abs(fl - minFL4h))}${unitLabel()} in the next few hours` });

  // EYEWEAR + SUN
  if (uv >= 6)                 gear.push({ icon:'🕶️', cat:'Sun & visibility', name:'Sunglasses + SPF 50 sunscreen', reason:`UV index ${Math.round(uv)} — high burn risk on exposed skin` });
  else if (uv >= 3 || isFoggy) gear.push({ icon:'🕶️', cat:'Sun & visibility', name:'Sunglasses / clear lenses', reason: isFoggy ? 'Clear lenses improve contrast in fog' : `UV ${Math.round(uv)} — protect your eyes` });
  if (isFoggy)                 gear.push({ icon:'🔦', cat:'Sun & visibility', name:'Front + rear lights (flashing)', reason:'Fog cuts driver visibility dramatically — be seen' });

  // HELMET — always
  gear.push({ icon:'⛑️', cat:'Safety', name:'Helmet', reason:'Always.' });

  // HYDRATION & FUEL — what to WEAR/CARRY on the bike
  const hotThresh = 82 - intensityOffset;
  const isHot  = fl > hotThresh;
  const isWarm = fl > 68 - intensityOffset;
  const humid  = current.relative_humidity_2m ?? 60;
  const isLong = duration === 'long' || duration === 'epic';
  const isMed  = duration === 'medium';

  // BOTTLES
  if (duration === 'short') {
    gear.push({ icon:'💧', cat:'Hydration & fuel', name:'1 water bottle', reason:'One bottle is plenty' + (isHot ? ` — sip every 10 min at ${toDisplay(fl)}${unitLabel()}` : ' for a short ride') });
  } else if (isHot || isLong) {
    gear.push({ icon:'💧', cat:'Hydration & fuel', name:'2 water bottles + electrolyte tabs', reason: isHot ? `High sweat rate at ${toDisplay(fl)}${unitLabel()} — salts prevent cramps` : 'Long ride — two bottles minimum, electrolytes prevent bonking' });
    if (isLong) gear.push({ icon:'💧', cat:'Hydration & fuel', name:'Plan water refill points', reason:'Know where to top up on route — carry enough or plan refills' });
  } else {
    gear.push({ icon:'💧', cat:'Hydration & fuel', name:'2 water bottles', reason:`Standard setup for this distance at ${toDisplay(fl)}${unitLabel()}` });
  }

  // HYDRATION PACK/VEST for longer or hot off-road rides
  if (isLong && (rideType === 'mtb' || rideType === 'gravel')) {
    gear.push({ icon:'🎒', cat:'Hydration & fuel', name:'Hydration vest or pack', reason:'Off-road long ride — a vest carries 1.5–2L without stopping to refill' });
  } else if (isLong && isHot) {
    gear.push({ icon:'🎒', cat:'Hydration & fuel', name:'Consider a hydration vest', reason:'Hot long ride — a vest lets you carry more water than two bottles' });
  }

  // ON-BIKE FUEL STORAGE
  if (duration !== 'short') {
    if (isMed) {
      gear.push({ icon:'⚡', cat:'Hydration & fuel', name:'2 gels or bars in back jersey pocket', reason:'Fuel every 30–45 min — pocket keeps it accessible without stopping' });
    } else {
      gear.push({ icon:'🍱', cat:'Hydration & fuel', name:'Bento box or top-tube bag', reason:'Long ride needs frequent fuelling — bento box keeps food reachable without unzipping' });
      gear.push({ icon:'🥙', cat:'Hydration & fuel', name:'Gels, bars + real food (banana, rice cake)', reason:'3h+ ride — mix formats to avoid flavour fatigue and gut issues' });
    }
  }

  // ELECTROLYTES for heat or humidity
  if ((isHot || humid > 75) && duration !== 'short') {
    gear.push({ icon:'🧂', cat:'Hydration & fuel', name:'Electrolyte capsules in pocket', reason: isHot ? `Carry salt caps — heavy sweating at ${toDisplay(fl)}${unitLabel()} depletes sodium fast` : 'High humidity = high sweat rate even when it feels cool' });
  }
  // NUTRITION
  if (duration === 'medium')   gear.push({ icon:'⚡', cat:'Hydration & fuel', name:'1–2 energy gels or bars', reason:'Fuel at 45–60 min to avoid the bonk' });
  else if (duration === 'long') gear.push({ icon:'🥙', cat:'Hydration & fuel', name:'3+ gels/bars + real food', reason:'Fuel every 30–45 min — more on hot days' });

  // RIDE-TYPE EXTRAS
  if (rideType === 'commute') {
    gear.push({ icon:'💼', cat:'Commute essentials', name:'Pannier or dry bag', reason:'Keep work clothes and laptop dry and crumple-free' });
    if (rainLikely) gear.push({ icon:'🔒', cat:'Commute essentials', name:'D-lock or chain lock', reason:'Leaving your bike outside while you work' });
  }
  if (rideType === 'mtb') {
    gear.push({ icon:'🛡️', cat:'MTB extras', name:'Knee & elbow pads', reason:'Trail riding — protection matters more than weight' });
    gear.push({ icon:'🧰', cat:'MTB extras', name:'Tube, tyre levers, mini pump', reason:'Remote trails — flats happen and help is far away' });
  }
  if (rideType === 'gravel') {
    gear.push({ icon:'🧰', cat:'Gravel extras', name:'Saddle bag: tube, CO₂, tyre plugs, multi-tool', reason:'Gravel roads eat tyres — carry more than you think you need' });
    gear.push({ icon:'📱', cat:'Gravel extras', name:'Phone with offline maps downloaded', reason:'Gravel routes often have no signal' });
  }
  if (rideType === 'road' && duration !== 'short') {
    gear.push({ icon:'🧰', cat:'Road essentials', name:'Saddle bag: tube, CO₂, tyre levers', reason:'Road tyres flat without warning — be self-sufficient' });
  }

  return gear;
}


// ─── FUELING & NUTRITION ENGINE ──────────────────────────────

// Derive estimated duration (minutes) from distance + ride type + elevation

// ── HYDRATION & FUELING (during ride) ────────────────────────

// Build a horizontal row of tappable scored-food chips (by FOOD_DB name).
function foodPickChipsHtml(names) {
  return names.map(name => {
    const f = FOOD_DB.find(fd => fd.name === name);
    if (!f) return '';
    const color = f.score >= 75 ? 'var(--green)' : f.score >= 50 ? '#E9A01A' : '#C1121F';
    const macro = f.carbs != null ? ` · ${f.carbs}g` : '';
    return '<button class="food-pick-chip" data-food="' + escHtml(f.name) + '" style="flex:0 0 auto;display:flex;align-items:center;gap:6px;padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;cursor:pointer;-webkit-appearance:none;font-family:inherit">' +
      '<span style="font-family:var(--font-data);font-weight:700;font-size:0.85rem;color:' + color + '">' + f.score + '</span>' +
      '<span style="font-size:0.82rem;font-weight:600;color:var(--text)">' + escHtml(f.name) + macro + '</span></button>';
  }).join('');
}

// Wire food-pick chips in `container` to open the tapped food's card on the Food tab.
function wireFoodPickChips(container) {
  container?.querySelectorAll('.food-pick-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const food = FOOD_DB.find(f => f.name === btn.dataset.food);
      if (!food) return;
      document.querySelectorAll('.nav-item').forEach(n => { n.classList.remove('active'); n.removeAttribute('aria-current'); });
      document.querySelectorAll('.tab-pane').forEach(p => { p.classList.remove('active'); p.scrollTop = 0; });
      document.querySelector('.nav-item[data-tab="tabFood"]')?.classList.add('active'); document.querySelector('.nav-item[data-tab="tabFood"]')?.setAttribute('aria-current','page');
      $('tabFood')?.classList.add('active');
      renderFoodTab();
      const resultEl = $('foodTabResult');
      renderFoodResult(food, resultEl);
      setTimeout(() => resultEl?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    });
  });
}

function renderFueling() {
  const el = $('fuelingResult');
  if (!el) return;
  if (!appState.weather || !appState.distanceMi) {
    el.innerHTML = '<div class="empty-state">Enter a distance above to see your fueling plan.</div>';
    return;
  }

  const current = appState.weather.current;
  const plan    = buildFuelingPlan(current, appState.distanceMi, appState.rideType, appState.weightKg, appState.intensity, appState.bikeType, appState.elevationM);
  if (!plan) return;

  const distLabel = appState.unit === 'km'
    ? `${Math.round(appState.distanceMi * 1.60934)} km`
    : `${Math.round(appState.distanceMi)} mi`;
  const hrsLabel = plan.durationMins >= 60
    ? `${Math.floor(plan.durationMins/60)}h ${plan.durationMins%60 > 0 ? (plan.durationMins%60)+'m' : ''}`.trim()
    : `${plan.durationMins}m`;

  el.innerHTML = `
    <div class="fueling-stats">
      <div class="nstat">
        <div class="nstat-val">${plan.waterOz} oz</div>
        <div class="nstat-label">water to carry</div>
      </div>
      <div class="nstat">
        <div class="nstat-val">${plan.bottles}</div>
        <div class="nstat-label">bottle${plan.bottles !== 1 ? 's' : ''} needed</div>
      </div>
      <div class="nstat">
        <div class="nstat-val">${plan.totalCarbsDuring > 0 ? plan.totalCarbsDuring+'g' : '—'}</div>
        <div class="nstat-label">carbs en route</div>
      </div>
    </div>

    <div class="fueling-section-label">📍 ${distLabel} · est. ${hrsLabel}</div>
    <div class="fueling-timeline">
      ${plan.events.map((e, i) => `
        <div class="timeline-item">
          <div class="timeline-marker">
            <div class="timeline-dot ${e.dot || ''}"></div>
            ${i < plan.events.length - 1 ? '<div class="timeline-line"></div>' : ''}
          </div>
          <div class="timeline-content">
            <div class="timeline-when">${escHtml(e.when)}</div>
            <div class="timeline-what">${escHtml(e.what)}</div>
            <div class="timeline-why">${escHtml(e.why)}</div>
          </div>
        </div>
      `).join('')}
    </div>
    <div style="margin-top:14px;">
      <div style="font-size:0.72rem;font-weight:600;color:var(--text-muted);margin-bottom:8px;">🍫 On-bike fuel — tap for the scored breakdown</div>
      <div style="display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding-bottom:4px;">${foodPickChipsHtml(['Energy gel', 'Energy bar', 'Banana', 'Dates', 'Clif Bloks', 'Stroopwafel'])}</div>
    </div>
    <p class="fueling-note">${appState.bikeType === 'ebike' ? '⚡ E-bike: estimates reduced ~50% for assisted effort. ' : ''}Based on ${distLabel} ${appState.rideType} ride at ${toDisplay(current.apparent_temperature)}${unitLabel()}${appState.elevationM && appState.elevationM > 800 ? ` · ${Math.round(appState.elevationM)}m elevation` : ""}. Assumes ${Math.round(appState.weightKg)}kg rider.</p>
  `;
  wireFoodPickChips(el);
}

// ── POST-RIDE NUTRITION ───────────────────────────────────────

function renderNutrition() {
  const el = $('nutritionResult');
  if (!el) return;
  if (!appState.weather) { el.innerHTML = '<div class="empty-state">Search a location to see recovery plan.</div>'; return; }

  const current = appState.weather.current;
  const plan    = buildNutritionPlan(current, appState.distanceMi, appState.rideType, appState.weightKg, appState.intensity, appState.bikeType, appState.elevationM);

  el.innerHTML = `
    <div class="nutrition-stats">
      <div class="nstat">
        <div class="nstat-val">${plan.caloriesBurned}</div>
        <div class="nstat-label">kcal burned</div>
      </div>
      <div class="nstat">
        <div class="nstat-val">${plan.fluidOz} oz</div>
        <div class="nstat-label">fluid to replace</div>
      </div>
      <div class="nstat">
        <div class="nstat-val">${plan.carbsG}g</div>
        <div class="nstat-label">carbs needed</div>
      </div>
      <div class="nstat">
        <div class="nstat-val">${plan.proteinG}g</div>
        <div class="nstat-label">protein target</div>
      </div>
    </div>

    <div class="nutrition-section">
      <div class="nutrition-section-label">⚡ Within 30 minutes</div>
      ${plan.immediate.map(f => `
        <div class="nutrition-item">
          <span class="nutrition-icon">${f.icon}</span>
          <div>
            <div class="nutrition-name">${escHtml(f.name)}</div>
            <div class="nutrition-detail">${escHtml(f.detail)}</div>
          </div>
        </div>`).join('')}
    </div>

    <div class="nutrition-section">
      <div class="nutrition-section-label">🍽️ Recovery meal (1–2 hrs after)</div>
      ${plan.meal.map(f => `
        <div class="nutrition-item">
          <span class="nutrition-icon">${f.icon}</span>
          <div>
            <div class="nutrition-name">${escHtml(f.name)}</div>
            <div class="nutrition-detail">${escHtml(f.detail)}</div>
          </div>
        </div>`).join('')}
    </div>

    <div style="margin-top:14px;">
      <div style="font-size:0.72rem;font-weight:600;color:var(--text-muted);margin-bottom:8px;">🏁 Recovery picks — tap for the scored breakdown</div>
      <div style="display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding-bottom:4px;">${foodPickChipsHtml(['Chocolate milk', 'Rice bowl', 'Chicken breast', 'Greek yogurt', 'Sweet potato', 'Berries'])}</div>
    </div>
    <p class="nutrition-note">Based on ${plan.durationMins < 60 ? plan.durationMins+'min' : Math.round(plan.durationMins/60*10)/10+'hr'} ${appState.rideType} ride at ${toDisplay(current.apparent_temperature)}${unitLabel()}${appState.elevationM && appState.elevationM > 800 ? ` · ${Math.round(appState.elevationM)}m elevation` : ''}. Assumes ${Math.round(appState.weightKg)}kg rider.</p>
  `;
  wireFoodPickChips(el);
}

// ─── LOADING ──────────────────────────────────────────────────
function showLoading(msg) { $('loadingMsg').textContent = msg; $('loadingOverlay').classList.remove('hidden'); }
function setLoading(msg)  { $('loadingMsg').textContent = msg; }
function hideLoading()    { $('loadingOverlay').classList.add('hidden'); }

// ─── TEMPERATURE UNIT ─────────────────────────────────────────
function setupTempUnit() {
  const stored = localStorage.getItem('ridecheck_unit');
  if (stored === 'C') {
    appState.tempUnit = 'C';
    $('btnTempUnit').textContent = '°C';
    $('btnTempUnit').classList.add('celsius');
  }
  $('btnTempUnit').addEventListener('click', () => {
    appState.tempUnit = appState.tempUnit === 'F' ? 'C' : 'F';
    const btn = $('btnTempUnit');
    btn.textContent = `°${appState.tempUnit}`;
    btn.classList.toggle('celsius', appState.tempUnit === 'C');
    localStorage.setItem('ridecheck_unit', appState.tempUnit);
    if (appState.weather) renderAll(); // re-render with new unit
  });

  // Distance unit toggle
  const distBtn = $('btnDistUnit');
  if (distBtn) {
    distBtn.textContent = appState.unit === 'km' ? 'km' : 'mi';
    distBtn.addEventListener('click', () => {
      appState.unit = appState.unit === 'mi' ? 'km' : 'mi';
      distBtn.textContent = appState.unit === 'km' ? 'km' : 'mi';
      localStorage.setItem('ridecheck_unit', appState.unit);
      if (appState.weather) renderAll();
      renderLogStats();
      renderLogEntries();
      showToast('Distance: ' + (appState.unit === 'km' ? 'kilometers' : 'miles'));
    });
  }

}


// ─── SAVED RIDE PROFILES ──────────────────────────────────────
function getProfiles() {
  try { return JSON.parse(localStorage.getItem('ridecheck_profiles') || '[]'); } catch { return []; }
}

function setupProfiles() {
  renderProfileChips();
  $('btnSaveProfile')?.addEventListener('click', () => {
    const dist = parseFloat($('distanceInput')?.value);
    const wt   = parseFloat($('weightInput')?.value);
    if (!dist) { showToast('Enter a distance to save a setup'); return; }
    const profile = {
      id: Date.now(),
      isDefault: false,
      label: buildProfileLabel(appState.rideType, appState.distanceMi, appState.unit, appState.intensity),
      rideType: appState.rideType,
      bikeType: appState.bikeType,
      distanceVal: dist,
      unit: appState.unit,
      distanceMi: appState.distanceMi,
      weightVal: wt || null,
      weightUnit: appState.weightUnit,
      weightKg: appState.weightKg,
      intensity: appState.intensity,
    };
    const profiles = getProfiles();
    profiles.unshift(profile);
    if (profiles.length > 5) profiles.pop();
    localStorage.setItem('ridecheck_profiles', JSON.stringify(profiles));
    renderProfileChips();
  });
}

function renderProfileChips() {
  const row = $('setupSelectRow');
  if (!row) return;
  const profiles = getProfiles();
  const activeId = appState.activeProfile?.id;

  if (!profiles.length) {
    row.style.display = 'none';
    return;
  }
  row.style.display = '';

  const bikeIcon = (type) => ({road:'\u{1F6B4}',gravel:'\u{1FAA8}',mtb:'\u{1F33F}',commuter:'\u{1F3D9}','e-bike':'\u26A1'}[type] || '\u{1F6B4}');
  row.innerHTML = `
    <div class="log-setups-label">Saved setups</div>
    <div class="prep-setups-scroll">
      ${profiles.map(p => {
        const dist = p.distanceMi ? (p.unit === 'km' ? Math.round(p.distanceMi * 1.60934) + ' km' : Math.round(p.distanceMi) + ' mi') : '';
        return '<button class="log-setup-chip ' + (p.id === activeId ? 'active' : '') + '" data-id="' + p.id + '" style="flex-shrink:0">' +
          '<span class="log-chip-icon">' + bikeIcon(p.bikeType || p.rideType) + '</span>' +
          '<span class="log-chip-label">' + escHtml(p.rideType) + '</span>' +
          (dist ? '<span class="log-chip-dist">' + dist + '</span>' : '') +
          '<span class="profile-chip-del" data-del="' + p.id + '">\u2715</span>' +
          '</button>';
      }).join('')}
    </div>
  `;

  row.querySelectorAll('.log-setup-chip').forEach(chip => {
    chip.addEventListener('click', e => {
      if (e.target.closest('.profile-chip-del')) {
        const delId = parseInt(e.target.dataset.del);
        const profs = getProfiles().filter(x => x.id !== delId);
        localStorage.setItem('ridecheck_profiles', JSON.stringify(profs));
        if (appState.activeProfile?.id === delId) appState.activeProfile = null;
        renderProfileChips();
        renderProfileContext();
        showToast('Setup deleted');
        return;
      }
      const p = getProfiles().find(x => x.id === parseInt(chip.dataset.id));
      if (!p) return;
      appState.rideType = p.rideType;
      appState.distanceMi = p.distanceMi;
      appState.unit = p.unit;
      appState.weightKg = p.weightKg || 70;
      appState.weightUnit = p.weightUnit || 'kg';
      appState.intensity = p.intensity || 'moderate';
      appState.activeProfile = p;
      document.querySelectorAll('.ride-pill[data-type]').forEach(btn => btn.classList.toggle('active', btn.dataset.type === p.rideType));
      if ($('distanceInput')) $('distanceInput').value = p.distanceVal || '';
      document.querySelectorAll('.unit-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.unit === p.unit));
      document.querySelectorAll('.ride-pill[data-intensity]').forEach(btn => btn.classList.toggle('active', btn.dataset.intensity === p.intensity));
      renderProfileChips();
      if (appState.weather) renderGear();
      renderProfileContext();
    });
  });
}

// ─── ONBOARDING ───────────────────────────────────────────────
function setupOnboarding() {
  if (localStorage.getItem('ridecheck_onboarded')) return;

  const overlay = $('onboardOverlay');
  const steps   = document.querySelectorAll('.onboard-step');
  const dots    = document.querySelectorAll('.onboard-dot');
  const nextBtn = $('onboardNext');
  const skipBtn = $('onboardSkip');
  let current   = 0;

  overlay.classList.remove('hidden');

  function goTo(n) {
    steps[current].classList.remove('active');
    dots[current].classList.remove('active');
    current = n;
    steps[current].classList.add('active');
    dots[current].classList.add('active');
    nextBtn.textContent = current === steps.length - 1 ? 'Get started' : 'Next';
  }

  nextBtn.addEventListener('click', () => {
    if (current < steps.length - 1) {
      goTo(current + 1);
    } else {
      finish();
    }
  });

  skipBtn.addEventListener('click', finish);

  // Weight unit toggle in onboarding
  document.querySelectorAll('[data-owunit]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-owunit]').forEach(b => {
        b.style.background = 'transparent';
        b.style.color = 'var(--text-muted)';
        b.classList.remove('active');
      });
      btn.style.background = 'var(--green)';
      btn.style.color = '#fff';
      btn.classList.add('active');
    });
  });
  $('onboardBackdrop')?.addEventListener('click', finish);

  function finish() {
    // Save weight if entered during onboarding
    const owInput = $('onboardWeight');
    if (owInput && owInput.value) {
      const activeUnit = document.querySelector('[data-owunit].active');
      const owUnit = activeUnit ? activeUnit.dataset.owunit : 'lb';
      const raw = parseFloat(owInput.value);
      if (!isNaN(raw) && raw > 0) {
        const wKg = owUnit === 'lb' ? Math.round(raw * 0.453592) : raw;
        appState.weightKg = wKg;
        appState.weightUnit = owUnit;
        localStorage.setItem('ridecheck_weight', owInput.value);
        localStorage.setItem('ridecheck_weight_unit', owUnit);
      }
    }
    localStorage.setItem('ridecheck_onboarded', '1');
    overlay.classList.add('hidden');
  }
}

// ─── TIMESTAMP ────────────────────────────────────────────────
function updateTimestamp() {
  const el = $('topbarUpdated');
  if (!el) return;
  el.classList.remove('hidden');
  el.textContent = 'Updated just now';
  el.style.cursor = 'pointer';

  // Tap to refresh (wire once)
  if (!el._wired) {
    el._wired = true;
    el.addEventListener('click', async () => {
      if (!appState.geo) return;
      el.textContent = 'Refreshing…';
      try {
        // Use the full check path so US locations get the NWS merge (not raw Open-Meteo)
        await runCheckFromGeo(appState.geo);
        const last = getLastUsed();
        if (last) { last.fetchedAt = Date.now(); localStorage.setItem('ridecheck_last', JSON.stringify(last)); }
        updateTimestamp();
      } catch(e) {
        el.textContent = 'Refresh failed';
      }
    });
  }
  // Update to relative time every minute
  clearInterval(window._tsInterval);
  window._tsInterval = setInterval(() => {
    const last = getLastUsed();
    if (!last?.fetchedAt) return;
    const mins = Math.round((Date.now() - last.fetchedAt) / 60000);
    if (mins < 1)       el.textContent = 'Updated just now';
    else if (mins < 60) el.textContent = `Updated ${mins} min ago`;
    else {
      const hrs = Math.round(mins / 60);
      el.textContent = `Updated ${hrs}h ago`;
    }
  }, 60000);
}

// ─── PULL TO REFRESH ──────────────────────────────────────────
function setupPullToRefresh() { /* disabled — auto-refresh handles this */ }

function getRideLog() {
  try { return JSON.parse(localStorage.getItem('ridecheck_log') || '[]'); } catch { return []; }
}

function saveRideLog(entries) {
  localStorage.setItem('ridecheck_log', JSON.stringify(entries));
}

let logUnit = 'mi';
let logFeel = 'good';

function setupRideLog() {
  renderLogEntries();
  updateLogSubtitle();

  // Open sheet
  $('btnLogRide').addEventListener('click', openLogSheet);

  // Backdrop close
  $('logSheetBackdrop')?.addEventListener('click', closeLogSheet);
  $('logSheetCancel')?.addEventListener('click', closeLogSheet);
  $('logCancelBtn')?.addEventListener('click', closeLogSheet);

  // Feel pills
  document.querySelectorAll('.log-feel-btn[data-feel]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.log-feel-btn[data-feel]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      logFeel = btn.dataset.feel;
    });
  });

  // Expand for notes/bike
  $('logMoreBtn')?.addEventListener('click', () => {
    $('logExtra').classList.remove('hidden');
    $('logMoreBtn').classList.add('hidden');
    $('logBike')?.focus();
  });

  // Save - wire directly AND via delegation for robustness
  const logSaveBtn = $('logSave');
  if (logSaveBtn) {
    logSaveBtn.addEventListener('click', saveEntry);
    logSaveBtn.addEventListener('touchend', e => { e.preventDefault(); saveEntry(); });
  }
}

function openLogSheet() {
  // Reset feel to good
  logFeel = 'good';
  document.querySelectorAll('.log-feel-btn[data-feel]').forEach(b => {
    b.classList.toggle('active', b.dataset.feel === 'good');
  });

  // Hide extra fields
  $('logExtra')?.classList.add('hidden');
  $('logMoreBtn')?.classList.remove('hidden');
  if ($('logBike')) $('logBike').value = '';
  if ($('logNotes')) $('logNotes').value = '';

  // Render saved setup chips
  renderLogSetups();

  // Build summary
  renderLogPrefilled();

  // Wire summary card tap to toggle edit mode
  const card = $('logSummaryCard');
  const editEl = $('logSummaryEdit');
  const displayEl = $('logSummaryDisplay');
  if (card && !card._wired) {
    card._wired = true;
    card.addEventListener('click', e => {
      if (e.target.closest('#logSummaryEdit')) return; // don\u0027t toggle when interacting with inputs
      const isEditing = !editEl.classList.contains('hidden');
      editEl.classList.toggle('hidden', isEditing);
      displayEl.classList.toggle('hidden', !isEditing);
      card.style.cursor = isEditing ? 'pointer' : 'default';
      if (!isEditing) $('logDistance')?.focus();
    });
    $('logEditDone')?.addEventListener('click', e => {
      e.stopPropagation();
      editEl.classList.add('hidden');
      displayEl.classList.remove('hidden');
      card.style.cursor = 'pointer';
      // Update summary display with new values
      renderLogSummary();
    });
    // Unit toggle in log form
    document.querySelectorAll('.unit-btn[data-logunit]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.unit-btn[data-logunit]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const prev = logUnit;
        logUnit = btn.dataset.logunit;
        const input = $('logDistance');
        if (input?.value && prev !== logUnit) {
          const val = parseFloat(input.value);
          if (!isNaN(val)) input.value = logUnit === 'km' ? Math.round(val * 1.60934 * 10)/10 : Math.round(val * 0.621371 * 10)/10;
        }
      });
    });
  }

  // Show sheet
  $('logSheetOverlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeLogSheet() {
  const sheet = $('logSheet');
  if (sheet) {
    sheet.style.animation = 'sheetDown 0.2s ease forwards';
    setTimeout(() => {
      $('logSheetOverlay').classList.add('hidden');
      sheet.style.animation = '';
      document.body.style.overflow = '';
    }, 200);
  } else {
    $('logSheetOverlay').classList.add('hidden');
    document.body.style.overflow = '';
  }
}

function renderLogPrefilled() {
  renderLogSummary();
}

function renderLogSummary() {
  const display = $('logSummaryDisplay');
  const bike   = $('logBike')?.value?.trim() || null;
  if (!display) return;

  // Pre-fill the edit fields too
  const distVal = appState.distanceMi
    ? (logUnit === 'km' ? Math.round(appState.distanceMi * 1.60934 * 10) / 10 : Math.round(appState.distanceMi * 10) / 10)
    : null;
  const durVal = appState.distanceMi ? estimateDuration(appState.distanceMi, appState.rideType) : null;
  

  // Set edit field values silently
  const distInput = $('logDistance');
  const durInput  = $('logDuration');
  if (distInput && distVal) distInput.value = distVal;
  if (durInput && durVal) durInput.value = durVal;
  if ($('logBike') && bike) $('logBike').value = bike;

  // Set unit toggle to match
  document.querySelectorAll('.unit-btn[data-logunit]').forEach(b => {
    b.classList.toggle('active', b.dataset.logunit === logUnit);
  });

  // Build summary items
  const items = [];

  if (distVal) {
    const durLabel = durVal
      ? (durVal >= 60 ? `${Math.floor(durVal/60)}h${durVal%60?` ${durVal%60}m`:''}` : `${durVal}m`)
      : null;
    items.push(`<div class="log-summary-item"><span class="log-summary-item-icon">🗺️</span><span>${distVal} ${logUnit}${durLabel ? ` · ${durLabel}` : ''}</span></div>`);
  }

  if (bike) {
    items.push(`<div class="log-summary-item"><span class="log-summary-item-icon">🚲</span><span>${escHtml(bike)}</span></div>`);
  }

  if (appState.weather?.current) {
    const c   = appState.weather.current;
    const wmo = WMO_CODES[c.weather_code] || { icon: '🌡️' };
    items.push(`<div class="log-summary-item"><span class="log-summary-item-icon">${wmo.icon}</span><span>${toDisplay(c.temperature_2m)}${unitLabel()}</span></div>`);
  }

  if (!items.length) {
    display.innerHTML = `<div class="log-summary-item" style="color:var(--text-faint)">Tap to add distance, bike &amp; notes</div>`;
  } else {
    display.innerHTML = items.join('');
  }
}


function resetLogForm() {
  $('logDistance').value = '';
  $('logDuration').value = '';
  if ($('logBike')) $('logBike').value = '';
  $('logNotes').value = '';
  logFeel = 'good';
  document.querySelectorAll('.ride-pill[data-feel]').forEach(p => {
    p.classList.toggle('active', p.dataset.feel === 'good');
  });
}

function saveEntry() {
  // Re-entrancy guard: #logSave is wired via a delegated click, a direct click,
  // and touchend — dedupe so one tap can't create two entries.
  const _t = Date.now();
  if (saveEntry._last && _t - saveEntry._last < 800) return;
  saveEntry._last = _t;
  try {
    const distVal  = parseFloat($('logDistance')?.value) || 0;
    const durVal   = parseInt($('logDuration')?.value) || 0;
    const notes    = $('logNotes')?.value?.trim() || '';
    const bikeVal  = $('logBike')?.value?.trim() || null;

    const current  = appState.weather?.current;
    const wmo      = current ? (WMO_CODES[current.weather_code] || {}) : {};

    const entry = {
      id:        Date.now(),
      date:      (function(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':00'; })(),
      bike:      bikeVal,
      bikeType:  appState.bikeType || appState.rideType || 'road',
      distanceMi: distVal ? (logUnit === 'km' ? distVal * 0.621371 : distVal) : null,
      distanceVal: distVal || null,
      distanceUnit: logUnit || 'mi',
      durationMins: durVal || null,
      feel:      logFeel || 'good',
      rideType:  appState.rideType || 'road',
      notes:     notes || null,
      location:  appState.geo?.label || null,
      tempF:     current?.temperature_2m || null,
      weatherIcon: wmo.icon || '🚲',
      weatherLabel: wmo.label || null,
    };

    const log = getRideLog();
    log.unshift(entry);
    // Safety cap only — well above any real ride history (localStorage holds thousands).
    // Previously 100, which silently dropped the oldest ride on every new log past 100.
    if (log.length > 5000) log.pop();
    saveRideLog(log);

    if (navigator.vibrate) navigator.vibrate(40);

    closeLogSheet();
    renderLogEntries();
    updateLogSubtitle();
    if (typeof renderLogStats === 'function') renderLogStats();
    if (typeof renderWeeklyGoal === 'function') renderWeeklyGoal();
    showToast('Ride logged!');
    renderRecoveryCard(entry);
  } catch(e) {
    alert('Error logging ride: ' + e.message);
    console.error('saveEntry error:', e);
  }
}

function renderLogEntries() {
  const el = $('logEntries');
  if (!el) return;
  const allLog = getRideLog();

  // Apply filter
  const log = activeLogFilter === 'all' ? allLog : allLog.filter(e => {
    if (['road','gravel','mtb','commute'].includes(activeLogFilter)) return e.rideType === activeLogFilter;
    if (['great','good','tough','bad'].includes(activeLogFilter)) return e.feel === activeLogFilter;
    return true;
  });

  if (!log.length) {
    el.innerHTML = allLog.length
      ? `<div class="empty-state">No ${activeLogFilter} rides logged yet.</div>`
      : '<div class="log-empty-state"><div class="log-empty-icon">🚴</div><div class="log-empty-title">Ready for your first ride?</div><div class="log-empty-sub">Tap "Log ride" after your next session to start tracking your history.</div></div>';
    return;
  }
  const feelEmoji = { great:'😄', good:'👍', tough:'😤', bad:'😞' };

  // Build entries with date group headers
  const now = new Date();
  const todayStr = now.toDateString();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();
  const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
  const twoWeeksAgo = new Date(now); twoWeeksAgo.setDate(now.getDate() - 14);
  const monthAgo = new Date(now); monthAgo.setMonth(now.getMonth() - 1);

  function getGroup(date) {
    // Compare using local date only (strip time)
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const y = new Date(t); y.setDate(t.getDate() - 1);
    const diff = Math.round((t - d) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (date >= weekAgo) return 'This week';
    if (date >= twoWeeksAgo) return 'Last week';
    if (date >= monthAgo) return 'This month';
    return date.toLocaleDateString([], { month: 'long', year: 'numeric' });
  }

  let lastGroup = '';
  el.innerHTML = log.map(e => {
    const entryDate = new Date(e.date);
    const group = getGroup(entryDate);
    let groupHeader = '';
    if (group !== lastGroup) {
      lastGroup = group;
      groupHeader = `<div class="log-date-group">${group}</div>`;
    }
    return groupHeader + (function(e) {
    const date = new Date(e.date);
    const dateStr = date.toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' });
    const timeStr = date.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });

    const dist = e.distanceVal
      ? `${e.distanceVal} ${e.distanceUnit}`
      : null;
    const dur = e.durationMins
      ? (e.durationMins >= 60
          ? `${Math.floor(e.durationMins/60)}h ${e.durationMins%60 > 0 ? e.durationMins%60+'m' : ''}`.trim()
          : `${e.durationMins}m`)
      : null;
    const temp = e.tempF ? `${toDisplay(e.tempF)}${unitLabel()}` : null;

    const meta = [dist, dur, temp].filter(Boolean).join(' · ');

    return `<div class="log-entry">
      <div class="log-entry-icon">${e.weatherIcon || '🚲'}</div>
      <div class="log-entry-main" data-editid="${e.id}" style="cursor:pointer">
        <div class="log-entry-date">${escHtml(dateStr)} <span style="font-weight:400;color:var(--text-muted)">${timeStr}</span></div>
        ${meta ? `<div class="log-entry-meta">${escHtml(meta)}</div>` : ''}
        <div class="log-entry-conditions">
          ${e.feel ? `<span class="tag">${feelEmoji[e.feel] || ''} ${e.feel}</span>` : ''}
          ${e.bike ? `<span class="tag">🚲 ${escHtml(e.bike)}</span>` : e.rideType ? `<span class="tag">${escHtml(e.rideType)}</span>` : ''}
          ${e.location ? `<span class="tag">📍 ${escHtml(e.location.split(',')[0])}</span>` : ''}
        </div>
        ${e.notes ? `<div class="log-entry-notes">"${escHtml(e.notes)}"</div>` : ''}
        <div style="font-size:0.72rem;color:var(--text-faint);margin-top:4px;">Tap to edit</div>
      </div>
      <button class="log-entry-del" data-id="${e.id}" aria-label="Delete entry">✕</button>
    </div>`;
  })(e);
  }).join('');

  el.querySelectorAll('.log-entry-main[data-editid]').forEach(main => {
    main.addEventListener('click', () => {
      const entry = getRideLog().find(e => e.id === parseInt(main.dataset.editid));
      if (entry) openLogEdit(entry);
    });
  });

  el.querySelectorAll('.log-entry-del').forEach(btn => {
    let confirming = false;
    btn.addEventListener('click', e => {
      e.stopPropagation();

      if (!confirming) {
        // First tap — ask for confirmation
        confirming = true;
        btn.textContent = 'Delete?';
        btn.classList.add('confirming');
        // Auto-reset after 3 seconds if no second tap
        setTimeout(() => {
          if (confirming) {
            confirming = false;
            btn.textContent = '✕';
            btn.classList.remove('confirming');
          }
        }, 3000);
        return;
      }

      // Second tap — confirmed, animate out then delete
      confirming = false;
      const entry = btn.closest('.log-entry');
      if (entry) {
        entry.style.transition = 'opacity 0.15s, transform 0.15s';
        entry.style.opacity = '0';
        entry.style.transform = 'translateX(20px)';
        setTimeout(() => {
          const updated = getRideLog().filter(e => e.id !== parseInt(btn.dataset.id));
          saveRideLog(updated);
          renderLogEntries();
          updateLogSubtitle();
        }, 150);
      } else {
        const updated = getRideLog().filter(e => e.id !== parseInt(btn.dataset.id));
        saveRideLog(updated);
        renderLogEntries();
        updateLogSubtitle();
      }
    });
  });
}

function updateLogSubtitle() {
  const el = $('logSubtitle');
  if (!el) return;
  const log = getRideLog();
  if (!log.length) { el.textContent = ''; renderLogStats(); return; }

  const totalDist = log.reduce((s, e) => s + (e.distanceMi || 0), 0);
  const count = log.length;
  const distLabel = appState.unit === 'km'
    ? `${Math.round(totalDist * 1.60934)} km`
    : `${Math.round(totalDist)} mi`;
  el.textContent = `${count} ride${count !== 1 ? 's' : ''} · ${distLabel} total`;
  renderLogStats();
}

function renderLogInsights() {
  const el = $('logInsights');
  if (!el) return;
  const log = getRideLog();
  const ins = computeInsights(log);
  if (!ins.totalRides) { el.setAttribute('style', 'display:none'); return; }

  const km = appState.unit === 'km';
  const conv = mi => km ? mi * 1.60934 : mi;
  const uLabel = km ? 'km' : 'mi';
  const num = n => Math.round(n).toLocaleString();

  // ── Stat tiles (magnitude headlines — not a chart) ──
  const tiles = [
    { v: num(ins.totalRides), l: 'rides' },
    { v: num(conv(ins.totalMi)), l: `${uLabel} total` },
    { v: num(conv(ins.avgMi)), l: `${uLabel} avg` },
    { v: num(conv(ins.longestMi)), l: `${uLabel} longest` },
  ].map(t =>
    `<div style="flex:1;min-width:64px;text-align:center;">
      <div style="font-family:'Space Grotesk',monospace;font-size:1.4rem;font-weight:700;color:var(--text);line-height:1.1;">${t.v}</div>
      <div style="font-size:0.68rem;color:var(--text-faint);margin-top:2px;">${t.l}</div>
    </div>`
  ).join('');

  // ── Monthly distance — labeled bars (value on top, month below), current month emphasized ──
  const HUE = '#5AA0E0';
  const TRACK = 56; // px height of the bar track
  const maxMi = Math.max(...ins.months.map(m => m.mi), 0);
  let chart = '';
  if (maxMi > 0) {
    const bars = ins.months.map(m => {
      const barPx = m.mi > 0 ? Math.max(4, Math.round((m.mi / maxMi) * TRACK)) : 0;
      const valBar = m.mi > 0
        ? `<div style="position:relative;width:100%;max-width:26px;height:${barPx}px;background:${HUE};opacity:${m.isCurrent ? 1 : 0.55};border-radius:4px 4px 0 0;"></div>`
        : '';
      return `<div title="${escHtml(m.label + ': ' + num(conv(m.mi)) + ' ' + uLabel)}" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0;">
        <div style="font-size:0.62rem;font-weight:600;color:${m.isCurrent ? 'var(--text)' : 'var(--text-faint)'};height:12px;">${m.mi > 0 ? num(conv(m.mi)) : ''}</div>
        <div style="position:relative;width:100%;height:${TRACK}px;display:flex;justify-content:center;align-items:flex-end;">
          <div style="position:absolute;left:50%;transform:translateX(-50%);bottom:0;width:100%;max-width:26px;height:${TRACK}px;background:var(--border);opacity:0.35;border-radius:4px;"></div>
          ${valBar}
        </div>
        <div style="font-size:0.64rem;color:${m.isCurrent ? 'var(--text)' : 'var(--text-faint)'};font-weight:${m.isCurrent ? 700 : 400};">${escHtml(m.label)}</div>
      </div>`;
    }).join('');
    chart = `<div style="margin-top:14px;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
        <span style="font-size:0.72rem;font-weight:600;color:var(--text-muted);">Monthly distance</span>
        <span style="font-size:0.66rem;color:var(--text-faint);">this month <span style="color:var(--text);font-weight:700;">${num(conv(ins.thisMonthMi))} ${uLabel}</span></span>
      </div>
      <div style="display:flex;align-items:flex-end;gap:6px;">${bars}</div>
    </div>`;
  }

  // ── Rides by feel (compact summary line) ──
  const feelIcons = { great: '😄', good: '👍', tough: '😤', bad: '😞' };
  const feelParts = Object.entries(ins.byFeel).filter(([, c]) => c > 0)
    .map(([k, c]) => `${feelIcons[k]} ${c}`).join('  ·  ');
  const feel = feelParts
    ? `<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);font-size:0.8rem;color:var(--text-muted);">${feelParts}</div>`
    : '';

  el.setAttribute('style', 'background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:14px 16px;margin-bottom:12px;');
  el.innerHTML = `
    <div style="font-size:0.8rem;font-weight:700;color:var(--text);margin-bottom:10px;">Insights</div>
    <div style="display:flex;gap:8px;">${tiles}</div>
    ${chart}
    ${feel}
  `;
}

function renderLogStats() {
  renderLogInsights();
  let el = $('logStats');
  if (!el) {
    el = document.createElement('div');
    el.id = 'logStats';
    el.className = 'log-stats-strip';
    const header = $('logHeader') || document.querySelector('.log-header');
    if (header) header.insertAdjacentElement('afterend', el);
  }

  const log = getRideLog();
  if (!log.length) { el.style.display = 'none'; return; }
  el.style.display = 'grid';

  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0,0,0,0);
  const monthAgo = new Date(now.getFullYear(), now.getMonth(), 1);

  const thisWeek  = log.filter(e => new Date(e.date) >= monday);
  const thisMonth = log.filter(e => new Date(e.date) >= monthAgo);
  const weekDist  = thisWeek.reduce((s, e) => s + (e.distanceMi || 0), 0);
  const monthDist = thisMonth.reduce((s, e) => s + (e.distanceMi || 0), 0);

  // Streak — consecutive days with at least one ride
  const rideDays = new Set(log.map(e => new Date(e.date).toDateString()));
  let streak = 0;
  const check = new Date();
  // Grace: if today hasn't been ridden yet, start counting from yesterday so the streak doesn't reset mid-day.
  if (!rideDays.has(check.toDateString())) check.setDate(check.getDate() - 1);
  while (rideDays.has(check.toDateString())) {
    streak++;
    check.setDate(check.getDate() - 1);
  }

  const fmt = mi => appState.unit === 'km'
    ? `${Math.round(mi * 1.60934)}km`
    : `${Math.round(mi)}mi`;

  el.innerHTML = `
    <div class="log-stat">
      <div class="log-stat-val">${thisWeek.length}</div>
      <div class="log-stat-label">this week</div>
    </div>
    <div class="log-stat">
      <div class="log-stat-val">${fmt(weekDist)}</div>
      <div class="log-stat-label">week dist</div>
    </div>
    <div class="log-stat">
      <div class="log-stat-val">${fmt(monthDist)}</div>
      <div class="log-stat-label">this month</div>
    </div>
    <div class="log-stat">
      <div class="log-stat-val">${streak > 0 ? '🔥 ' + streak + 'd' : '—'}</div>
      <div class="log-stat-label">streak</div>
    </div>
  `;
}

// ─── PROFILE CONTEXT BANNER ──────────────────────────────────
function renderProfileContext() {
  // Find or create the context element inside the Prep tab
  let el = $('profileContext');
  if (!el) {
    el = document.createElement('div');
    el.id = 'profileContext';
    // Insert it just before the first prep-section (What to wear)
    const firstSection = document.querySelector('.prep-section');
    if (firstSection) firstSection.parentNode.insertBefore(el, firstSection);
  }

  if (!appState.activeProfile || !appState.weather) {
    el.innerHTML = '';
    el.style.display = 'none';
    return;
  }

  const current = appState.weather.current;
  const wmo = WMO_CODES[current.weather_code] || { label: 'current conditions', icon: '🌡️' };
  const temp = `${toDisplay(current.apparent_temperature)}${unitLabel()}`;
  const wind = toWindDisplay(current.wind_speed_10m);
  const p = appState.activeProfile;
  const distLabel = p.unit === 'km'
    ? `${Math.round(p.distanceMi * 1.60934)} km`
    : `${Math.round(p.distanceMi)} mi`;

  el.style.display = 'block';
  el.innerHTML = `
    <div class="profile-context-banner">
      <div class="profile-context-top">
        <span class="profile-context-title">${escHtml(p.label)} · ${distLabel} · ${wmo.icon} ${temp}</span>
      </div>
    </div>
  `;
}

function updateWeightSettingsSub() {
  const el  = $('weightSettingsSub');
  const disp = $('weightDisplay');
  const val = $('weightInput')?.value;
  if (val && parseFloat(val) > 0) {
    if (el) el.textContent = 'Used for fueling and hydration estimates';
    if (disp) disp.textContent = `${val} ${appState.weightUnit}`;
  } else {
    if (el) el.textContent = 'Tap to set — used for fueling estimates';
    if (disp) disp.textContent = '—';
  }
}

function openWeightSheet() {
  const sheet = $('weightSheetOverlay');
  if (sheet) sheet.classList.remove('hidden');
  setTimeout(() => $('weightInput')?.focus(), 300);
}

function closeWeightSheet() {
  const sheet = $('weightSheet');
  if (sheet) {
    sheet.style.animation = 'sheetDown 0.2s ease forwards';
    setTimeout(() => {
      $('weightSheetOverlay').classList.add('hidden');
      sheet.style.animation = '';
    }, 200);
  } else {
    $('weightSheetOverlay')?.classList.add('hidden');
  }
}

// ─── WEIGHT SAVED INDICATOR ──────────────────────────────────
let _weightSavedTimer = null;

function showWeightSaved(flash) {
  const tag = $('weightSavedTag');
  if (!tag) return;
  tag.classList.remove('hidden');
  if (flash) {
    tag.classList.add('flash');
    clearTimeout(_weightSavedTimer);
    _weightSavedTimer = setTimeout(() => tag.classList.remove('flash'), 1500);
  }
}

// ─── PROFILE HELPERS ─────────────────────────────────────────
function autoLoadDefaultProfile() {
  const profiles = getProfiles();
  const def = profiles.find(p => p.isDefault);
  if (!def) return;
  // Apply silently without marking chip active yet
  appState.rideType   = def.rideType;
  appState.distanceMi = def.distanceMi;
  appState.unit       = def.unit;
  appState.weightKg   = def.weightKg || 70;
  appState.weightUnit = def.weightUnit || 'lb';
  appState.intensity  = def.intensity || 'moderate';
  // Update UI
  document.querySelectorAll('.ride-pill[data-type]').forEach(p => p.classList.toggle('active', p.dataset.type === def.rideType));
  if (def.bikeType) {
    appState.bikeType = def.bikeType;
    document.querySelectorAll('.ride-pill[data-bike]').forEach(p => p.classList.toggle('active', p.dataset.bike === def.bikeType));
  }
  
  document.querySelectorAll('.ride-pill[data-intensity]').forEach(p => p.classList.toggle('active', p.dataset.intensity === def.intensity));
  document.querySelectorAll('.unit-btn[data-unit]').forEach(b => b.classList.toggle('active', b.dataset.unit === def.unit));
  document.querySelectorAll('.unit-btn[data-wunit]').forEach(b => b.classList.toggle('active', b.dataset.wunit === def.weightUnit));
  const di = $('distanceInput');
  if (di && def.distanceVal) di.value = def.distanceVal;
  const wi = $('weightInput');
  if (wi && def.weightVal) wi.value = def.weightVal;
}


function buildProfileLabel(rideType, dist, unit, intensity) {
  if (intensity && intensity !== 'moderate') return `${rideType} · ${intensity}`;
  return rideType;
}

// ─── SHARE ────────────────────────────────────────────────────
function setupShare() {
  $('btnShare')?.addEventListener('click', shareConditions);
}

function shareConditions() {
  if (!appState.weather || !appState.geo) return;
  const current = appState.weather.current;
  const wmo     = WMO_CODES[current.weather_code] || { label: 'Unknown', icon: '🌡️' };
  const { score } = calcConfidence(current, appState.weather.hourly);
  const verdict = score >= 75 ? 'Great day to ride' : score >= 55 ? 'Rideable with prep' : score >= 35 ? 'Challenging' : 'Not recommended';
  const temp    = `${toDisplay(current.temperature_2m)}${unitLabel()}`;
  const fl      = `${toDisplay(current.apparent_temperature)}${unitLabel()}`;
  const wind    = toWindDisplay(current.wind_speed_10m);
  const wd      = windDir(current.wind_direction_10m);
  const windStr = wd ? `${wind} ${wd.label}` : wind;

  const best    = calcBestWindow(appState.weather.hourly);
  const bestStr = best && best.score >= 40
    ? `
Best window: ${new Date(best.bestStart.time).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})} – ${new Date(best.bestEnd.time).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}`
    : '';

  const aqLevel = appState.airQuality?.current?.us_aqi != null
    ? (AQ_LEVELS.find(l => appState.airQuality.current.us_aqi <= l.max) || AQ_LEVELS[AQ_LEVELS.length-1]).label
    : null;

  const shareFl = current.apparent_temperature;
  const shareKit = shareFl < 32 ? '🧥 Full winter kit'
    : shareFl < 45 ? '🧥 Tights + thermal jersey'
    : shareFl < 58 ? '👕 Arm warmers + vest'
    : shareFl < 75 ? '👕 Shorts + jersey'
    : '👕 Light kit + sunscreen';

  const text = [
    `🚲 RideCheck — ${appState.geo.city}, ${appState.geo.state || appState.geo.country}`,
    `Ride score: ${score}/100 · ${verdict}`,
    `${wmo.icon} ${wmo.label} · ${temp} (feels ${fl})`,
    `💨 ${windStr}${aqLevel ? ` · AQ: ${aqLevel}` : ''}`,
    bestStr,
    shareKit,
  ].filter(Boolean).join('\n');

  if (navigator.share) {
    navigator.share({ title: 'RideCheck conditions', text }).catch(() => {});
  } else {
    // Fallback — copy to clipboard
    navigator.clipboard?.writeText(text).then(() => {
      showToast('Conditions copied to clipboard');
    }).catch(() => {
      showToast('Share not available on this device');
    });
  }
}

function showToast(msg) {
  let toast = $('appToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appToast';
    toast.className = 'app-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ─── LOG FILTER ───────────────────────────────────────────────
let activeLogFilter = 'all';

function setupLogFilter() {
  $('logFilterBar')?.addEventListener('click', e => {
    const btn = e.target.closest('.log-filter');
    if (!btn) return;
    activeLogFilter = btn.dataset.filter;
    document.querySelectorAll('.log-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderLogEntries();
  });
}

// ─── SETTINGS ─────────────────────────────────────────────────
function setupSettings() {
  // Open settings — add gear icon to topbar (long-press on location or dedicated button)
  // Trigger via existing dark mode btn long press OR add to search screen
  // For now: add a settings item to the search screen wordmark area
  // Wire the settings from within the app via topbar long-press on location


  $('settingsBackdrop')?.addEventListener('click', closeSettings);
  $('settingsClose')?.addEventListener('click', closeSettings);

  $('settingReplayOnboarding')?.addEventListener('click', () => {
    closeSettings();
    localStorage.removeItem('ridecheck_onboarded');
    setTimeout(() => setupOnboarding(), 300);
  });

  $('settingExportLog')?.addEventListener('click', () => {
    exportLogCSV();
    closeSettings();
  });

  $('settingBackupLog')?.addEventListener('click', () => {
    exportLogJSON();
    closeSettings();
  });

  // Restore via a link or pasted JSON — iOS home-screen PWAs can't open a file
  // picker, so we don't rely on <input type=file>. A URL is fetched; anything
  // else is treated as pasted backup text.
  $('settingRestoreLog')?.addEventListener('click', async () => {
    const input = prompt('Paste a backup link (URL) or the backup text:');
    if (input == null) return;
    let text = input.trim();
    if (!text) return;
    if (/^https?:\/\//i.test(text)) {
      try {
        const res = await fetchWithTimeout(text, {}, 8000);
        if (!res.ok) { showToast('Could not open that link'); return; }
        text = await res.text();
      } catch { showToast('Could not open that link'); return; }
    }
    restoreFromText(text);
    closeSettings();
  });

  $('settingClearLog')?.addEventListener('click', () => {
    if (confirm('Delete all logged rides? This cannot be undone.')) {
      localStorage.removeItem('ridecheck_log');
      renderLogEntries();
      updateLogSubtitle();
      closeSettings();
      showToast('Ride log cleared');
    }
  });

  $('settingClearAll')?.addEventListener('click', () => {
    if (confirm('Reset everything? All saved data, profiles, and preferences will be deleted.')) {
      const keys = ['ridecheck_saved','ridecheck_last','ridecheck_log','ridecheck_profiles',
                    'ridecheck_onboarded','ridecheck_dark','ridecheck_unit','ridecheck_weight',
                    'ridecheck_weight_unit','ridecheck_ride_type','ridecheck_intensity',
                    'ridecheck_dist_unit','ridecheck_distance','ridecheck_bike_type',
                    'ridecheck_bike_name',
                    'ridecheck_weight_skipped',
                    'ridecheck_history',
                    'ridecheck_weekly_goal',
                    'ridecheck_strava'];
      keys.forEach(k => localStorage.removeItem(k));
      location.reload();
    }
  });
}

function openSettings() {
  $('settingsOverlay').classList.remove('hidden');
}

function closeSettings() {
  const sheet = $('settingsSheet');
  if (sheet) {
    sheet.style.animation = 'sheetDown 0.2s ease forwards';
    setTimeout(() => {
      $('settingsOverlay').classList.add('hidden');
      sheet.style.animation = '';
    }, 200);
  } else {
    $('settingsOverlay').classList.add('hidden');
  }
}

// Save a generated file. iOS Safari/PWAs ignore programmatic <a download>, so use
// the native share sheet ("Save to Files"/AirDrop) when files can be shared, and
// fall back to a download link on desktop. Must be called from a user gesture.
async function downloadOrShare(filename, text, mime) {
  try {
    const file = new File([text], filename, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled'; // user dismissed the sheet
    // any other error → fall through to the download path
  }
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  return 'downloaded';
}

async function exportLogJSON() {
  const log = getRideLog();
  if (!log.length) { showToast('No rides to back up'); return; }
  const payload = JSON.stringify({ app: 'ridecheck', type: 'ridelog', version: 1, exportedAt: new Date().toISOString(), rides: log }, null, 2);
  const how = await downloadOrShare('ridecheck-backup.json', payload, 'application/json');
  if (how === 'cancelled') return;
  showToast(how === 'shared' ? 'Backup ready — choose Save to Files' : 'Backup downloaded — keep it safe');
}

function restoreFromText(text) {
  const res = parseBackup(text);
  if (!res.ok) { showToast('Import failed: ' + res.error); return; }
  const { merged, added } = mergeRides(getRideLog(), res.rides);
  saveRideLog(merged);
  renderLogEntries();
  updateLogSubtitle();
  if (typeof renderLogStats === 'function') renderLogStats();
  showToast(added ? `Restored ${added} ride${added !== 1 ? 's' : ''}` : 'No new rides (already in your log)');
}

async function exportLogCSV() {
  const log = getRideLog();
  if (!log.length) { showToast('No rides to export'); return; }
  const rows = log.map(e => [
    new Date(e.date).toLocaleString(),
    e.bike || '',
    e.rideType || '',
    e.distanceMi ? Math.round(e.distanceMi * 10) / 10 : '',
    e.durationMins || '',
    e.feel || '',
    e.location || '',
    e.tempF ? Math.round(e.tempF) : '',
    e.weatherLabel || '',
    e.notes || '',
  ]);
  const csv = [headers, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
  const how = await downloadOrShare('ridecheck-log.csv', csv, 'text/csv');
  if (how === 'cancelled') return;
  showToast(how === 'shared' ? 'CSV ready — choose Save to Files' : 'Log exported as CSV');
}

// ─── WEIGHT INTERSTITIAL ─────────────────────────────────────
function showWeightInterstitial() {
  const el = $('weightInterstitial');
  if (!el) return;
  el.classList.remove('hidden');
  setTimeout(() => $('weightInterstitialInput')?.focus(), 100);
}

function hideWeightInterstitial() {
  const el = $('weightInterstitial');
  if (el) {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.2s';
    setTimeout(() => {
      el.classList.add('hidden');
      el.style.opacity = '';
      el.style.transition = '';
    }, 200);
  }
}

function setupWeightInterstitial() {
  let wiUnit = 'lb';

  // Unit toggle
  document.querySelectorAll('.unit-btn[data-wiunit]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.unit-btn[data-wiunit]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const prev = wiUnit;
      wiUnit = btn.dataset.wiunit;
      const input = $('weightInterstitialInput');
      if (input?.value) {
        const val = parseFloat(input.value);
        if (!isNaN(val)) {
          input.value = wiUnit === 'kg'
            ? Math.round(val * 0.453592 * 10) / 10
            : Math.round(val * 2.20462);
        }
      }
    });
  });

  // Save
  $('weightInterstitialSave')?.addEventListener('click', () => {
    const raw = parseFloat($('weightInterstitialInput')?.value);
    if (!isNaN(raw) && raw > 0) {
      appState.weightKg   = wiUnit === 'lb' ? raw * 0.453592 : raw;
      appState.weightUnit = wiUnit;
      localStorage.setItem('ridecheck_weight', String(raw));
      localStorage.setItem('ridecheck_weight_unit', wiUnit);
      // Sync to settings sheet display
      const wInput = $('weightInput');
      if (wInput) wInput.value = raw;
      document.querySelectorAll('.unit-btn[data-wunit]').forEach(b => {
        b.classList.toggle('active', b.dataset.wunit === wiUnit);
      });
      updateWeightSettingsSub();
      if (appState.weather) renderGear();
      if (navigator.vibrate) navigator.vibrate(40);
    }
    hideWeightInterstitial();
  });

  // Allow Enter key to save
  $('weightInterstitialInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') $('weightInterstitialSave')?.click();
  });

  // Skip
  $('weightInterstitialSkip')?.addEventListener('click', () => {
    localStorage.setItem('ridecheck_weight_skipped',
                    'ridecheck_history',
                    'ridecheck_weekly_goal',
                    'ridecheck_strava', '1');
    hideWeightInterstitial();
  });
}

// Map bike type to ride type for gear/fueling logic
function bikeTypeToRideType(bikeType) {
  const map = { road:'road', gravel:'gravel', mtb:'mtb', commuter:'commute', ebike:'commute' };
  return map[bikeType] || 'road';
}

// ─── LOG ENTRY EDIT ──────────────────────────────────────────
let _editingEntryId = null;
let _editUnit = 'mi';

function openLogEdit(entry) {
  _editingEntryId = entry.id;
  _editUnit = entry.distanceUnit || 'mi';

  // Populate fields
  const distInput = $('editDistance');
  if (distInput) distInput.value = entry.distanceVal || '';

  const durInput = $('editDuration');
  if (durInput) durInput.value = entry.durationMins || '';

  document.querySelectorAll('.unit-btn[data-editunit]').forEach(b => {
    b.classList.toggle('active', b.dataset.editunit === _editUnit);
  });

  document.querySelectorAll('.ride-pill[data-editfeel]').forEach(p => {
    p.classList.toggle('active', p.dataset.editfeel === (entry.feel || 'good'));
  });

  const bikeInput = $('editBike');
  if (bikeInput) bikeInput.value = entry.bike || '';

  const notesInput = $('editNotes');
  if (notesInput) notesInput.value = entry.notes || '';

  $('logEditSheetOverlay').classList.remove('hidden');
}

function closeLogEdit() {
  const sheet = $('logEditSheet');
  if (sheet) {
    sheet.style.animation = 'sheetDown 0.2s ease forwards';
    setTimeout(() => {
      $('logEditSheetOverlay').classList.add('hidden');
      sheet.style.animation = '';
      _editingEntryId = null;
    }, 200);
  } else {
    $('logEditSheetOverlay')?.classList.add('hidden');
    _editingEntryId = null;
  }
}

function setupLogEdit() {
  $('logEditSheetBackdrop')?.addEventListener('click', closeLogEdit);
  $('logEditSheetClose')?.addEventListener('click', closeLogEdit);

  // Unit toggle
  document.querySelectorAll('.unit-btn[data-editunit]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.unit-btn[data-editunit]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const prev = _editUnit;
      _editUnit = btn.dataset.editunit;
      const input = $('editDistance');
      if (input?.value) {
        const val = parseFloat(input.value);
        if (!isNaN(val)) {
          input.value = _editUnit === 'km'
            ? Math.round(val * 1.60934 * 10) / 10
            : Math.round(val * 0.621371 * 10) / 10;
        }
      }
    });
  });

  // Feel pills
  document.querySelectorAll('.ride-pill[data-editfeel]').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.ride-pill[data-editfeel]').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
    });
  });

  // Save
  $('logEditSave')?.addEventListener('click', () => {
    if (!_editingEntryId) return;
    const log = getRideLog();
    const idx = log.findIndex(e => e.id === _editingEntryId);
    if (idx === -1) { closeLogEdit(); return; }

    const distVal   = parseFloat($('editDistance').value);
    const durVal    = parseInt($('editDuration').value);
    const feel      = document.querySelector('.ride-pill[data-editfeel].active')?.dataset.editfeel || log[idx].feel;
    const bike      = $('editBike').value.trim() || null;
    const notes     = $('editNotes').value.trim() || null;

    log[idx] = {
      ...log[idx],
      distanceVal:  distVal  || null,
      distanceUnit: _editUnit,
      distanceMi:   distVal  ? (_editUnit === 'km' ? distVal * 0.621371 : distVal) : null,
      durationMins: durVal   || null,
      feel, bike, notes,
    };

    saveRideLog(log);
    if (navigator.vibrate) navigator.vibrate(40);
    closeLogEdit();
    renderLogEntries();
    updateLogSubtitle();
  });
}

// ─── LOCATION SWITCHER ───────────────────────────────────────
function setupLocationSwitcher() {
  $('topbarLocationBtn')?.addEventListener('click', openLocationSwitcher);
  $('locationSwitcherBackdrop')?.addEventListener('click', closeLocationSwitcher);
  $('locationSwitcherClose')?.addEventListener('click', closeLocationSwitcher);
}

function openLocationSwitcher() {
  const history = getLocationHistory();
  const current = appState.geo;
  const body    = $('locationSwitcherBody');
  if (!body) return;

  if (!history.length) {
    body.innerHTML = `
      <div style="text-align:center;padding:24px 16px;font-size:0.88rem;color:var(--text-muted)">
        Your searched locations will appear here.
      </div>
      <div class="loc-switch-add" id="locSwitchAdd">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        Search a new location
      </div>`;
  } else {
    const items = history.map(h => {
      const isCurrent = current && h.label === current.label;
      const sub = [h.state, h.country].filter(Boolean).join(', ') || h.label;
      return `
        <div class="loc-switch-item ${isCurrent ? 'loc-switch-current' : ''}"
             data-label="${escHtml(h.label)}" data-postal="${escHtml(h.postal)}"
             data-lat="${h.lat}" data-lon="${h.lon}">
          <div class="loc-switch-icon">${isCurrent ? '📍' : '🕐'}</div>
          <div class="loc-switch-info">
            <div class="loc-switch-name">${escHtml(h.city || h.label)}</div>
            <div class="loc-switch-sub">${escHtml(sub)}</div>
          </div>
          ${isCurrent
            ? '<div class="loc-switch-check">✓</div>'
            : `<button class="loc-switch-del" data-label="${escHtml(h.label)}" aria-label="Remove">✕</button>`
          }
        </div>`;
    }).join('');

    body.innerHTML = items + `
      <div class="loc-switch-add" id="locSwitchAdd">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        Search a new location
      </div>`;
  }

  // Tap to switch
  body.querySelectorAll('.loc-switch-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('.loc-switch-del')) return;
      const label  = item.dataset.label;
      if (label === current?.label) { closeLocationSwitcher(); return; }
      closeLocationSwitcher();
      const lat = parseFloat(item.dataset.lat);
      const lon = parseFloat(item.dataset.lon);
      const hist = getLocationHistory().find(h => h.label === label);
      if (hist && lat && lon) {
        // Use cached geo — skip geocode round trip
        runCheckFromGeo({ ...hist, lat, lon });
      } else {
        $('postalInput').value = item.dataset.postal || label;
        runCheckFromQuery(item.dataset.postal || label);
      }
    });
  });

  // Delete from history
  body.querySelectorAll('.loc-switch-del').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      removeFromLocationHistory(btn.dataset.label);
      openLocationSwitcher(); // re-render
    });
  });

  // Search new
  $('locSwitchAdd')?.addEventListener('click', () => {
    closeLocationSwitcher();
    $('screenApp').classList.remove('active');
    $('screenSearch').classList.add('active');
    $('searchBackBtn')?.classList.remove('hidden');
    $('postalInput').value = '';
    setTimeout(() => $('postalInput')?.focus(), 200);
  });

  $('locationSwitcherOverlay').classList.remove('hidden');
}

function closeLocationSwitcher() {
  const sheet = $('locationSwitcherSheet');
  if (sheet) {
    sheet.style.animation = 'sheetDown 0.2s ease forwards';
    setTimeout(() => {
      $('locationSwitcherOverlay').classList.add('hidden');
      sheet.style.animation = '';
    }, 200);
  } else {
    $('locationSwitcherOverlay')?.classList.add('hidden');
  }
}

// ─── LOG SETUP CHIPS ─────────────────────────────────────────
function renderLogSetups() {
  const row = $('logSetupsRow');
  if (!row) return;
  const profiles = getProfiles();

  if (!profiles.length) {
    row.innerHTML = '';
    row.style.display = 'none';
    return;
  }

  row.style.display = '';
  const bikeIcon = (type) => ({road:'\u{1F6B4}',gravel:'\u{1FAA8}',mtb:'\u{1F33F}',commuter:'\u{1F3D9}','e-bike':'\u26A1'}[type] || '\u{1F6B4}');
  row.innerHTML = `
    <div class="log-setups-label">Quick fill</div>
    <div class="log-setups-chips">
      ${profiles.map(p => {
        const dist = p.distanceMi ? (p.unit === 'km' ? Math.round(p.distanceMi * 1.60934) + ' km' : Math.round(p.distanceMi) + ' mi') : '';
        return '<button class="log-setup-chip ' + (appState.activeProfile && appState.activeProfile.id === p.id ? 'active' : '') + '" data-id="' + p.id + '">' +
          '<span class="log-chip-icon">' + bikeIcon(p.bikeType || p.rideType) + '</span>' +
          '<span class="log-chip-label">' + escHtml(p.rideType) + '</span>' +
          (dist ? '<span class="log-chip-dist">' + dist + '</span>' : '') +
          '</button>';
      }).join('')}
    </div>
  `;

  row.querySelectorAll('.log-setup-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = getProfiles().find(x => x.id === parseInt(btn.dataset.id));
      if (!p) return;
      appState.rideType   = p.rideType;
      appState.bikeType   = p.bikeType || p.rideType;
      appState.distanceMi = p.distanceMi;
      appState.unit       = p.unit || 'mi';
      appState.intensity  = p.intensity || 'moderate';
      appState.activeProfile = p;
      logUnit = p.unit || 'mi';
      document.querySelectorAll('.unit-btn[data-logunit]').forEach(b => {
        b.classList.toggle('active', b.dataset.logunit === logUnit);
      });
      row.querySelectorAll('.log-setup-chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      renderLogSummary();
    });
  });
}

// ─── FORECAST DAY DETAIL ─────────────────────────────────────
function openForecastDayDetail(dayIndex) {
  try {
  const days   = appState.forecastDays;
  const hourly = appState.weather?.hourly;
  if (!days || !hourly) { console.warn('No days or hourly data'); return; }

  const d = days[dayIndex];
  if (!d) { console.warn('No day at index', dayIndex); return; }

  // Slice hourly data for this specific day — use string match to avoid timezone bugs
  const dayStr = d.t; // e.g. "2026-06-19"

  const dayHourly = {
    time:                     [],
    apparent_temperature:     [],
    temperature_2m:           [],
    weather_code:             [],
    precipitation_probability:[],
    wind_speed_10m:           [],
    wind_direction_10m:       [],
  };

  hourly.time.forEach((t, i) => {
    if (t.startsWith(dayStr)) {
      dayHourly.time.push(t);
      dayHourly.apparent_temperature.push(hourly.apparent_temperature?.[i] ?? hourly.temperature_2m[i]);
      dayHourly.temperature_2m.push(hourly.temperature_2m[i]);
      dayHourly.weather_code.push(hourly.weather_code[i]);
      dayHourly.precipitation_probability.push(hourly.precipitation_probability[i] ?? 0);
      dayHourly.wind_speed_10m.push(hourly.wind_speed_10m[i] ?? 0);
      dayHourly.wind_direction_10m.push(hourly.wind_direction_10m?.[i] ?? 0);
    }
  });

  // For future days, remove the "must be in future" filter from calcBestWindow
  // by temporarily faking the time — use a modified version
  const best = calcBestWindowForDay(dayHourly);

  // Build sheet content
  const dayDate  = new Date(d.t + 'T12:00:00');
  const today    = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const dayCheck = new Date(dayDate); dayCheck.setHours(0,0,0,0);
  const isToday  = dayCheck.getTime() === today.getTime();
  const isTomorrow = dayCheck.getTime() === tomorrow.getTime();
  const dayName  = isToday ? 'Today' : isTomorrow ? 'Tomorrow'
    : dayDate.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });

  const scoreColor = d.score >= 70 ? 'var(--green)' : d.score >= 45 ? 'var(--amber)' : 'var(--red)';
  const timingVerdict = d.timingHint === 'morning' ? ' · ride early' : d.timingHint === 'afternoon' ? ' · ride afternoon' : d.timingHint === 'evening' ? ' · ride evening' : '';
  const scoreLabel = d.score >= 75 ? 'Great' + timingVerdict : d.score >= 55 ? 'Rideable' + timingVerdict : d.score >= 35 ? 'Challenging' + timingVerdict : 'Not recommended';

  let bestWindowHtml = '';
  if (best && best.score >= 35) {
    const fmt = t => new Date(t).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });
    const fl  = toDisplay(best.bestStart.fl);
    const wind = toWindDisplay(best.bestStart.wind);
    const wd  = windDir(best.bestStart.wind_dir);
    const windStr = wd ? `${wind} ${wd.label}` : wind;
    const qual = best.score >= 70 ? 'Best window' : best.score >= 50 ? 'Decent window' : 'Best available';
    bestWindowHtml = `
      <div class="forecast-detail-window">
        <div class="forecast-detail-window-label">${qual}</div>
        <div class="forecast-detail-window-time">${fmt(best.bestStart.time)} – ${fmt(best.bestEnd.time)}</div>
        <div class="forecast-detail-window-meta">${fl}${unitLabel()} · ${windStr} · ${best.bestStart.wmo?.icon || ''}</div>
      </div>`;
  } else {
    bestWindowHtml = `<div class="forecast-detail-window forecast-detail-no-window">No great riding window — tough conditions all day</div>`;
  }

  // Hourly breakdown for the day
  const hourlyHtml = dayHourly.time.map((t, i) => {
    const hour = new Date(t).getHours();
    if (hour < 5 || hour > 21) return ''; // skip overnight
    const label = new Date(t).toLocaleTimeString([], { hour:'numeric' });
    const wmo   = WMO_CODES[dayHourly.weather_code[i]] || { icon:'🌡️' };
    const temp  = toDisplay(dayHourly.apparent_temperature[i]);
    const pop   = dayHourly.precipitation_probability[i] ?? 0;
    return `
      <div class="forecast-hour-item">
        <span class="forecast-hour-time">${label}</span>
        <span class="forecast-hour-icon">${wmo.icon}</span>
        <span class="forecast-hour-temp">${temp}${unitLabel()}</span>
        ${pop > 0 ? `<span class="forecast-hour-pop" style="color:${pop > 50 ? '#C1121F' : pop > 20 ? '#E9A01A' : 'var(--text-faint)'};font-size:0.72rem">💧${pop}%</span>` : ''}
      </div>`;
  }).join('');

  $('forecastDayTitle').textContent = dayName;
  $('forecastDayBody').innerHTML = `
    <div class="forecast-detail-score" style="color:${scoreColor}">
      <span class="forecast-detail-score-num">${d.score}</span>
      <span class="forecast-detail-score-label">${scoreLabel} to ride</span>
    </div>
    <div class="forecast-detail-summary">
      <span style="color:var(--text-muted)">${weatherSvg(d.code ?? 0, 18)}</span> ${d.wmo?.label || ''}  ·
      ${toDisplay(d.maxFL)}${unitLabel()} high · ${toDisplay(d.minFL)}${unitLabel()} low
      ${d.sunset ? ` · <span style="color:var(--text-muted)">${uiIcon('sunset', 13)}</span> ${d.sunset}` : ''}
    </div>
    ${bestWindowHtml}
    <div style="font-size:0.88rem;color:var(--text-muted);margin-bottom:14px;padding:10px 12px;background:var(--bg);border-radius:8px;">
      👕 ${d.maxFL < 32 ? 'Full winter kit' : d.maxFL < 45 ? 'Tights + thermal jersey' : d.maxFL < 58 ? 'Arm warmers + vest' : d.maxFL < 75 ? 'Shorts and jersey' : 'Light kit + sunscreen'}${[51,53,55,61,63,65,80,81,82,95,96,99].includes(d.code ?? 0) ? ' + rain jacket' : ''}
    </div>
    <div class="forecast-detail-section-label">Hourly</div>
    <div class="forecast-hours-grid">${hourlyHtml}</div>
  `;

  $('forecastDayOverlay').classList.remove('hidden');
  } catch(e) { console.error('Forecast detail error:', e); }
}

// calcBestWindow variant that works for any day (ignores past filter)
function calcBestWindowForDay(hourly, dayStart) {
  if (!hourly?.time?.length) return null;
  const scored = hourly.time.map((t, i) => {
    const time = new Date(t);
    const fl   = hourly.apparent_temperature?.[i] ?? hourly.temperature_2m[i];
    const wind = hourly.wind_speed_10m[i] ?? 0;
    const pop  = hourly.precipitation_probability[i] ?? 0;
    const wmo  = WMO_CODES[hourly.weather_code[i]] || {};
    let score  = 100;
    if (fl < 32 || fl > 100) score -= 40;
    else if (fl < 45 || fl > 90) score -= 20;
    if (wind > 25) score -= 30; else if (wind > 15) score -= 15;
    if (pop > 60) score -= 30; else if (pop > 30) score -= 15;
    if (wmo.rain) score -= 20;
    const h = time.getHours();
    if (h < 6 || h > 20) score -= 50;
    return { time, fl, wind, pop, wmo, score: Math.max(0, score), wind_dir: hourly.wind_direction_10m?.[i] };
  }).filter(Boolean);

  if (!scored.length) return null;
  const best = scored.reduce((a, b) => a.score > b.score ? a : b);
  if (best.score < 20) return null;

  // Find contiguous window around best hour
  const bestIdx = scored.indexOf(best);
  let start = bestIdx, end = bestIdx;
  while (start > 0 && scored[start-1].score >= best.score * 0.75) start--;
  while (end < scored.length-1 && scored[end+1].score >= best.score * 0.75) end++;

  return { bestStart: scored[start], bestEnd: scored[end], score: best.score };
}

function closeForecastDayDetail() {
  const sheet = $('forecastDaySheet');
  if (sheet) {
    sheet.style.animation = 'sheetDown 0.2s ease forwards';
    setTimeout(() => {
      $('forecastDayOverlay').classList.add('hidden');
      sheet.style.animation = '';
    }, 200);
  } else {
    $('forecastDayOverlay')?.classList.add('hidden');
  }
}

function setupForecastDetail() {
  // Use delegation since overlay may not exist at init time
  document.addEventListener('click', e => {
    if (e.target.id === 'forecastDayBackdrop' || e.target.id === 'forecastDayClose' || e.target.closest('#forecastDayClose')) {
      closeForecastDayDetail();
    }
  });

  // Event delegation for all day cards (forecast + coming up)
  document.addEventListener('click', e => {
    const card = e.target.closest('[data-daydate]');
    if (!card) return;
    const dateStr = card.dataset.daydate;
    if (!dateStr || !appState.forecastDays) return;
    const idx = appState.forecastDays.findIndex(d => d.t === dateStr);
    if (idx >= 0) openForecastDayDetail(idx);
  });
}

// ─── GLANCEABLE SUMMARY ──────────────────────────────────────
function renderGlanceable(current, hourly, score) {
  const el = $('glanceable');
  if (!el) return;

  const fl = current.apparent_temperature ?? current.temperature_2m ?? 70;
  const wind = current.wind_speed_10m ?? 0;
  const humid = current.relative_humidity_2m ?? 50;
  const code = current.weather_code ?? 0;

  const bestWindow = calcBestWindow(hourly);

  // Clothing
  let kit = '';
  if (fl < 32)      kit = 'full winter kit';
  else if (fl < 45) kit = 'tights and thermal jersey';
  else if (fl < 58) kit = 'arm warmers and a vest';
  else if (fl < 75) kit = 'shorts and jersey';
  else               kit = 'light kit and sunscreen';

  // Best window
  let windowText = '';
  const fmt = t => new Date(t).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});
  // bestWindow only contains future daylight hours — show directly
  if (bestWindow && bestWindow.score >= 40) {
    const startHour = new Date(bestWindow.bestStart.time).getHours();
    if (fl >= 85 && startHour >= 11) {
      windowText = 'Ride <span class="gl-time">early morning</span> \u2014 afternoon is too hot';
    } else {
      if (bestWindow.bestStart.time === bestWindow.bestEnd.time) {
        windowText = 'Ride at <span class="gl-time">' + fmt(bestWindow.bestStart.time) + '</span>';
      } else {
        windowText = 'Ride <span class="gl-time">' + fmt(bestWindow.bestStart.time) + ' \u2013 ' + fmt(bestWindow.bestEnd.time) + '</span>';
      }
    }
  } else if (bestWindow && bestWindow.score >= 20) {
    const startHour = new Date(bestWindow.bestStart.time).getHours();
    if (fl >= 85 && startHour >= 11) {
      windowText = 'Ride <span class="gl-time">early morning</span> if possible';
    } else {
      if (bestWindow.bestStart.time === bestWindow.bestEnd.time) {
        windowText = 'Best window at <span class="gl-time">' + fmt(bestWindow.bestStart.time) + '</span>';
      } else {
        windowText = 'Best window <span class="gl-time">' + fmt(bestWindow.bestStart.time) + ' \u2013 ' + fmt(bestWindow.bestEnd.time) + '</span>';
      }
    }
  } else {
    windowText = fl >= 85 ? 'Ride <span class="gl-time">early morning</span> or skip today' : 'No good window today';
  }

  // Heat callouts
  let heatWarning = '';
  if (fl > 95) {
    heatWarning = '<div style="margin-top:6px;font-size:0.82rem;color:#C1121F;font-weight:600">\u{1F525} Extreme heat \u2014 extra water, electrolytes, ride early or skip</div>';
  } else if (fl >= 88) {
    heatWarning = '<div style="margin-top:6px;font-size:0.82rem;color:#E9A01A;font-weight:600">\u{1F4A7} Hot \u2014 extra water + electrolytes, avoid midday</div>';
  } else if (fl > 80 && humid > 70) {
    heatWarning = '<div style="margin-top:6px;font-size:0.82rem;color:#E9A01A;font-weight:600">\u{1F4A7} Humid \u2014 hydrate more than usual</div>';
  }

  // Storm callout
  let stormWarning = '';
  const aqiVal = appState.airQuality?.current?.us_aqi ?? 0;
  let aqiWarning = '';
  if (aqiVal > 200) {
    aqiWarning = '<div style="margin-top:6px;font-size:0.82rem;color:#C1121F;font-weight:600">\u{1F637} Hazardous air quality (' + aqiVal + ' AQI) \u2014 ride indoors or skip</div>';
  } else if (aqiVal > 150) {
    aqiWarning = '<div style="margin-top:6px;font-size:0.82rem;color:#C05621;font-weight:600">\u{1F637} Unhealthy air (' + aqiVal + ' AQI) \u2014 limit outdoor effort</div>';
  }
  if ([95,96,99].includes(code)) {
    stormWarning = '<div style="margin-top:6px;font-size:0.82rem;color:#C1121F;font-weight:600">\u26A1 Active thunderstorms \u2014 stay inside</div>';
  }

  // Wind callout
  const windText = wind > 12 ? ' \u00b7 ' + Math.round(wind) + ' mph wind' : '';

  if (score < 20) {
    el.innerHTML = 'Consider a rest day or ride indoors.' + heatWarning + stormWarning + aqiWarning;
  } else if (score < 35) {
    el.innerHTML = windowText + ' if you must \u2014 ' + kit + heatWarning + stormWarning + aqiWarning;
  } else {
    el.innerHTML = windowText + ' in <span class="gl-kit">' + kit + '</span>' + windText + heatWarning + stormWarning + aqiWarning;
  }
}


// ─── WEEKLY GOAL ─────────────────────────────────────────────
function renderWeeklyGoal() {
  const el = $('weeklyGoal');
  if (!el) return;

  const log = getRideLog();
  if (!log.length) { el.classList.add('hidden'); return; }

  // This week's rides
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0,0,0,0);

  const weekRides = log.filter(e => new Date(e.date) >= monday);
  const weekMi = weekRides.reduce((s, e) => s + (e.distanceMi || 0), 0);

  // Calculate a reasonable weekly goal from recent activity (last 4 weeks avg, rounded up to nearest 10)
  const fourWeeksAgo = new Date(now); fourWeeksAgo.setDate(now.getDate() - 28);
  const recentRides = log.filter(e => new Date(e.date) >= fourWeeksAgo);
  const recentMi = recentRides.reduce((s, e) => s + (e.distanceMi || 0), 0);
  const avgWeekly = recentMi / 4;
  const goal = Math.max(Math.ceil(avgWeekly / 10) * 10, 20); // minimum 20mi goal

  // User can set their own goal in localStorage
  const userGoal = parseInt(localStorage.getItem('ridecheck_weekly_goal',
                    'ridecheck_strava'));
  const effectiveGoal = userGoal > 0 ? userGoal : goal;

  const pct = Math.min(100, Math.round((weekMi / effectiveGoal) * 100));
  const exceeded = weekMi >= effectiveGoal;
  const unit = appState.unit === 'km' ? 'km' : 'mi';
  const weekDisplay = unit === 'km' ? Math.round(weekMi * 1.60934) : Math.round(weekMi);
  const goalDisplay = unit === 'km' ? Math.round(effectiveGoal * 1.60934) : effectiveGoal;

  // Streak
  const streak = calcStreak(log);

  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="weekly-goal-header">
      <span class="weekly-goal-value">${weekDisplay} ${unit}</span>
      ${exceeded 
        ? '<span class="weekly-goal-hit">\u2714 Goal hit</span>' 
        : `<span class="weekly-goal-of">of ${goalDisplay} ${unit}</span>`}
      ${streak > 1 ? `<span class="weekly-goal-streak">\u{1F525} ${streak}wk</span>` : ''}
      <button class="weekly-goal-edit" id="weeklyGoalEdit">\u270E</button>
    </div>
    <div class="weekly-goal-bar">
      <div class="weekly-goal-fill" style="width:${pct}%;${exceeded ? 'background:var(--green)' : ''}"></div>
    </div>
  `;

  // Wire edit goal
  $('weeklyGoalEdit')?.addEventListener('click', () => {
    const current = effectiveGoal;
    const input = prompt('Weekly distance goal (' + unit + '):', unit === 'km' ? Math.round(current * 1.60934) : current);
    if (input !== null) {
      let val = parseInt(input);
      if (!isNaN(val) && val > 0) {
        if (unit === 'km') val = Math.round(val * 0.621371);
        localStorage.setItem('ridecheck_weekly_goal', String(val));
        renderWeeklyGoal();
      }
    }
  });
}



// ─── 3-DAY OUTLOOK ──────────────────────────────────────────
function renderMiniOutlook() {
  const el = $('miniOutlook');
  if (!el) return;
  const days = appState.forecastDays;
  if (!days || days.length < 4) return;

  // Show next 3 days (skip today at index 0)
  const upcoming = days.slice(1, 4);

  el.innerHTML = `
    <div class="mini-outlook-label">Coming up</div>
    <div class="mini-outlook-row">
      ${upcoming.map((d, i) => {
        const date = new Date(d.t + 'T12:00:00');
        const dayName = i === 0 ? 'Tomorrow' : date.toLocaleDateString([], { weekday: 'short' });
        const scoreColor = d.score >= 70 ? 'var(--green)' : d.score >= 45 ? '#E9A01A' : '#C1121F';
        const timingTxt = d.timingHint === 'morning' ? 'Ride early' : d.timingHint === 'evening' ? 'Ride late' : d.timingHint === 'afternoon' ? 'Ride PM' : '';
        const verdict = d.score >= 70 ? (timingTxt || 'Ride') : d.score >= 45 ? (timingTxt || 'Maybe') : 'Skip';
        const icon = weatherSvg(d.code ?? 0, 20);
        return `<div class="mini-outlook-card" data-daydate="${d.t}">
          <div class="mo-day">${dayName}</div>
          <div class="mo-icon">${icon}</div>
          <div class="mo-score" style="color:${scoreColor}">${d.score}</div>
          <div class="mo-temps">${toDisplay(d.minFL)}–${toDisplay(d.maxFL)}°</div>
          <div class="mo-verdict" style="color:${scoreColor}">${verdict}</div>
        </div>`;
      }).join('')}
    </div>
  `;

  // Taps handled by event delegation in setupForecastDetail
}

// ─── FOOD CHECKER ────────────────────────────────────────────


// Shown when a search doesn't match a curated food — honest, no fabricated score.
function renderNoFoodMatch(el) {
  if (!el) return;
  el.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;">
      <div style="font-size:1.4rem;margin-bottom:6px;">🤷</div>
      <div style="font-weight:600;margin-bottom:4px;color:var(--text);">Not on our list</div>
      <div style="font-size:0.82rem;color:var(--text-muted);line-height:1.5;">We hand-pick foods scored for cycling — try the categories below, or this rule of thumb:</div>
      <div style="margin-top:12px;font-size:0.8rem;color:var(--text-muted);line-height:1.85;">
        <div><b style="color:var(--text);">3–4 hrs before</b> — full meal (pasta, rice, oatmeal)</div>
        <div><b style="color:var(--text);">1–2 hrs</b> — light snack (toast, yogurt, banana)</div>
        <div><b style="color:var(--text);">30–60 min</b> — quick carbs (banana, dates, gel)</div>
        <div><b style="color:var(--text);">During</b> — 30–60g carbs/hr (gels, chews, bananas)</div>
      </div>
    </div>`;
}

function renderFoodResult(food, targetEl) {
  const el = targetEl || $('foodResult') || $('foodTabResult');
  if (!el) return;
  
  if (!food) {
    el.innerHTML = `<div class="food-no-match">
      <div style="font-size:1.5rem;margin-bottom:6px">🤷</div>
      <div style="font-weight:600;margin-bottom:4px">Not in the database</div>
      <div style="font-size:0.82rem;color:var(--text-muted)">Try a different category</div>
    </div>`;
    return;
  }
  
  const scoreColor = food.score >= 75 ? 'var(--green)' : food.score >= 50 ? '#E9A01A' : '#C1121F';
  
  // Timing pills
  const timingPills = food.when.split(',').map(t => {
    const labels = { pre:'Pre-ride', during:'During', post:'Post-ride', avoid:'Avoid' };
    const icons = { pre:'\u{1F550}', during:'\u{1F6B4}', post:'\u{1F3C1}', avoid:'\u26A0\uFE0F' };
    const colors = { pre:'var(--green)', during:'var(--green)', post:'var(--green)', avoid:'#C1121F' };
    return '<span style="display:inline-flex;align-items:center;gap:3px;font-size:0.72rem;font-weight:600;padding:3px 8px;border-radius:6px;background:rgba(45,106,79,0.1);color:' + (colors[t.trim()] || 'var(--text-muted)') + '">' + (icons[t.trim()] || '') + ' ' + (labels[t.trim()] || t) + '</span>';
  }).join(' ') + (food.preTiming ? ' <span style="display:inline-flex;align-items:center;gap:3px;font-size:0.72rem;font-weight:700;padding:3px 8px;border-radius:6px;background:rgba(45,106,79,0.15);color:var(--green)">\u23F0 ' + food.preTiming + '</span>' : '')

  // Nutrient tags (curated foods only; estimated results have none)
  const nutrientTags = (food.nutrients || '').split(',').map(n => n.trim()).filter(Boolean).map(n =>
    `<span style="font-size:0.7rem;font-weight:600;padding:2px 7px;border-radius:4px;background:var(--bg);color:var(--text-muted)">${escHtml(n)}</span>`
  ).join(' ');
  
  const verdict = food.score >= 80 ? 'Great choice' : food.score >= 65 ? 'Solid option' : food.score >= 45 ? 'Not ideal' : 'Skip this';

  // Macro row (per typical serving) when available
  const macroRow = (food.cal != null) ? `
    <div style="margin:10px 0 0;display:flex;gap:16px;align-items:baseline;flex-wrap:wrap;">
      <span style="font-size:0.68rem;color:var(--text-faint);">per ${escHtml(food.serving || 'serving')}</span>
      <span style="font-family:var(--font-data);font-weight:700;font-size:0.92rem;color:var(--text);">${food.cal}<span style="font-size:0.64rem;font-weight:600;color:var(--text-faint);margin-left:2px;">cal</span></span>
      <span style="font-family:var(--font-data);font-weight:700;font-size:0.92rem;color:var(--text);">${food.carbs}g<span style="font-size:0.64rem;font-weight:600;color:var(--text-faint);margin-left:2px;">carbs</span></span>
      <span style="font-family:var(--font-data);font-weight:700;font-size:0.92rem;color:var(--text);">${food.protein}g<span style="font-size:0.64rem;font-weight:600;color:var(--text-faint);margin-left:2px;">protein</span></span>
    </div>` : '';

  el.innerHTML = `
    <div class="food-card">
      <div class="food-card-top">
        <div>
          <div class="food-card-name">${escHtml(food.name)}</div>
          <div class="food-card-verdict" style="color:${scoreColor}">${verdict}</div>
        </div>
        <div class="food-card-score" style="color:${scoreColor}">${food.score}</div>
      </div>
      <div class="food-card-bar"><div class="food-card-bar-fill" style="width:${food.score}%;background:${scoreColor}"></div></div>
      <div style="margin:10px 0 8px;display:flex;gap:4px;flex-wrap:wrap">${timingPills}</div>
      ${macroRow}
      <div class="food-card-why" style="margin-top:10px">${escHtml(food.why)}</div>
      ${nutrientTags ? `<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);display:flex;gap:4px;flex-wrap:wrap">${nutrientTags}</div>` : ''}
    </div>
  `;
}

function setupFoodChecker() {
  $('btnFoodCheck')?.addEventListener('click', () => {
    $('foodSheetOverlay')?.classList.remove('hidden');
    $('foodResult').innerHTML = '';
    renderFoodCategories();
  });
  
  $('foodSheetBackdrop')?.addEventListener('click', closeFoodSheet);
  $('foodSheetClose')?.addEventListener('click', closeFoodSheet);
}

function renderFoodCategories() {
  const catEl = $('foodCategories');
  const chipsEl = $('foodChips');
  const resultEl = $('foodResult');
  if (!catEl) return;

  const cats = [
    { id:'pre',    label:'\u{1F550} Pre-ride',  filter: f => f.when.includes('pre') },
    { id:'during', label:'\u{1F6B4} During',     filter: f => f.when.includes('during') },
    { id:'post',   label:'\u{1F3C1} Recovery',   filter: f => f.when.includes('post') },
    { id:'avoid',  label:'\u26A0\uFE0F Avoid',  filter: f => f.when === 'avoid' },
    { id:'snacks', label:'\u{1F34C} Snacks',    filter: f => ['Banana', 'Nuts', 'Trail mix', 'Dates', 'Granola', 'Fig bar', 'Energy bar', 'Peanut butter', 'Gummy bears', 'Chocolate chip cookie', 'Jerky', 'Stroopwafel', 'Clif Bloks', 'Protein bar', 'Pickles', 'Greek yogurt', 'Peanut butter toast', 'Bagel'].includes(f.name) },
  ];

  catEl.innerHTML = `
    <div style="margin-bottom:14px;padding:14px;background:var(--surface);border-radius:12px;border:1px solid var(--border)">
      <div style="font-weight:700;font-size:0.88rem;margin-bottom:10px">\u{1F550} Pre-ride eating guide</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;gap:10px;align-items:baseline">
          <span style="font-family:var(--font-data);font-weight:700;font-size:0.78rem;color:var(--green);white-space:nowrap;min-width:70px">3-4 hrs</span>
          <span style="font-size:0.82rem;color:var(--text-muted)">Full meal \u2014 pasta, rice, oatmeal, eggs</span>
        </div>
        <div style="display:flex;gap:10px;align-items:baseline">
          <span style="font-family:var(--font-data);font-weight:700;font-size:0.78rem;color:var(--green);white-space:nowrap;min-width:70px">1-2 hrs</span>
          <span style="font-size:0.82rem;color:var(--text-muted)">Light snack \u2014 toast, yogurt, energy bar</span>
        </div>
        <div style="display:flex;gap:10px;align-items:baseline">
          <span style="font-family:var(--font-data);font-weight:700;font-size:0.78rem;color:var(--green);white-space:nowrap;min-width:70px">30-60 min</span>
          <span style="font-size:0.82rem;color:var(--text-muted)">Quick fuel \u2014 banana, coffee, fig bar</span>
        </div>
        <div style="display:flex;gap:10px;align-items:baseline">
          <span style="font-family:var(--font-data);font-weight:700;font-size:0.78rem;color:var(--green);white-space:nowrap;min-width:70px">15-30 min</span>
          <span style="font-size:0.82rem;color:var(--text-muted)">Last boost \u2014 gel, honey, dates</span>
        </div>
      </div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      ${cats.map(c => '<button class="food-cat-pill" data-cat="' + c.id + '">' + c.label + '</button>').join('')}
    </div>
  `;

  function showCategory(catId) {
    const cat = cats.find(c => c.id === catId);
    if (!cat) return;

    catEl.querySelectorAll('.food-cat-pill').forEach(b => b.classList.remove('active'));
    const activeBtn = catEl.querySelector('[data-cat="' + catId + '"]');
    if (activeBtn) activeBtn.classList.add('active');

    // Show/hide pre-ride guide based on category
    const guide = catEl.querySelector('[style*="Pre-ride eating guide"]') || catEl.firstElementChild;
    if (guide) guide.style.display = catId === 'pre' ? '' : 'none';

    const foods = FOOD_DB.filter(cat.filter).sort((a, b) => b.score - a.score);
    if (resultEl) resultEl.innerHTML = '';

    if (chipsEl) {
      chipsEl.innerHTML = foods.map(f => {
        const color = f.score >= 75 ? 'var(--green)' : f.score >= 50 ? '#E9A01A' : '#C1121F';
        return '<button class="food-chip" data-food="' + escHtml(f.name) + '">' +
          '<span class="food-chip-score" style="color:' + color + '">' + f.score + '</span> ' +
          escHtml(f.name) +
          '</button>';
      }).join('');

      chipsEl.querySelectorAll('.food-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          chipsEl.querySelectorAll('.food-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          const food = FOOD_DB.find(f => f.name === chip.dataset.food);
          renderFoodResult(food);
          setTimeout(() => $('foodResult')?.scrollIntoView({ behavior:'smooth', block:'start' }), 50);
        });
      });
    }
  }

  catEl.querySelectorAll('.food-cat-pill').forEach(btn => {
    btn.addEventListener('click', () => showCategory(btn.dataset.cat));
  });

  // Auto-select Pre-ride on open
  showCategory('pre');
}


function renderFoodChips(filterFn) {
  const chipsEl = $('foodChips');
  if (!chipsEl) return;
  
  const foods = FOOD_DB.filter(filterFn).sort((a,b) => b.score - a.score);
  
  chipsEl.innerHTML = foods.map(f => {
    const color = f.score >= 75 ? 'var(--green)' : f.score >= 50 ? '#E9A01A' : '#C1121F';
    return `<button class="food-chip" data-fname="${escHtml(f.name)}">
      <span class="food-chip-score" style="color:${color}">${f.score}</span>
      ${escHtml(f.name)}
    </button>`;
  }).join('');

  chipsEl.querySelectorAll('.food-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chipsEl.querySelectorAll('.food-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      const food = FOOD_DB.find(f => f.name === chip.dataset.fname);
      if (food) renderFoodResult(food);
    });
  });
  
  $('foodResult').innerHTML = '';
}

function closeFoodSheet() {
  const sheet = $('foodSheet');
  if (sheet) {
    sheet.style.animation = 'sheetDown 0.2s ease forwards';
    setTimeout(() => {
      $('foodSheetOverlay').classList.add('hidden');
      sheet.style.animation = '';
    }, 200);
  }
}

// ─── STRAVA INTEGRATION ─────────────────────────────────────
function getStravaTokens() {
  try { return JSON.parse(localStorage.getItem('ridecheck_strava') || 'null'); } catch { return null; }
}

function saveStravaTokens(tokens) {
  localStorage.setItem('ridecheck_strava', JSON.stringify(tokens));
}

function clearStrava() {
  localStorage.removeItem('ridecheck_strava');
  updateStravaUI();
}

async function refreshStravaToken() {
  const tokens = getStravaTokens();
  if (!tokens?.refresh_token) return null;

  try {
    const res = await fetch('/.netlify/functions/strava-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: tokens.refresh_token }),
    });
    if (!res.ok) throw new Error('Token refresh failed');
    const data = await res.json();
    const updated = { ...tokens, ...data };
    saveStravaTokens(updated);
    return updated.access_token;
  } catch (e) {
    console.warn('Strava token refresh failed:', e);
    return null;
  }
}

async function getStravaAccessToken() {
  const tokens = getStravaTokens();
  if (!tokens) return null;

  // Check if token is expired (with 5 min buffer)
  const now = Math.floor(Date.now() / 1000);
  if (tokens.expires_at && now < tokens.expires_at - 300) {
    return tokens.access_token;
  }

  // Token expired, refresh
  return refreshStravaToken();
}

async function fetchStravaActivities(page = 1, perPage = 30) {
  const token = await getStravaAccessToken();
  if (!token) { showToast('Strava not connected'); return []; }

  try {
    const res = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?page=${page}&per_page=${perPage}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.status === 401) {
      // Try one refresh
      const newToken = await refreshStravaToken();
      if (!newToken) { showToast('Strava session expired'); clearStrava(); return []; }
      const retry = await fetch(
        `https://www.strava.com/api/v3/athlete/activities?page=${page}&per_page=${perPage}`,
        { headers: { Authorization: `Bearer ${newToken}` } }
      );
      if (!retry.ok) return [];
      return retry.json();
    }
    if (!res.ok) return [];
    return res.json();
  } catch (e) {
    console.warn('Strava fetch error:', e);
    return [];
  }
}

function stravaActivityToLogEntry(activity) {
  const distMi = (activity.distance || 0) * 0.000621371;
  const durationMins = Math.round((activity.moving_time || 0) / 60);
  // Strava's start_date_local is wall-clock time with a misleading 'Z'; store it as a
  // local-naive string (no Z) to match manual entries, so new Date(e.date) reads it back correctly.
  const date = (activity.start_date_local || activity.start_date || '').replace('Z', '').slice(0, 19);

  return {
    // Integer id (Strava's stable activity id) so parseInt() in the delete/edit handlers matches.
    id: activity.id || Math.floor(Date.now() + Math.random() * 100000),
    date: date,
    distanceVal: Math.round(distMi * 10) / 10,
    distanceUnit: 'mi',
    distanceMi: distMi,
    durationMins: durationMins,
    feel: null, // User can edit later
    bike: activity.gear_id ? null : null,
    rideType: activity.type === 'Ride' ? 'road' : activity.type === 'MountainBikeRide' ? 'mtb' : activity.type === 'GravelRide' ? 'gravel' : 'road',
    notes: activity.name || null,
    location: null,
    weatherIcon: '🔄',
    stravaId: activity.id, // Track to prevent duplicates
    source: 'strava',
  };
}

async function syncStrava() {
  const btn = $('btnStravaSync');
  if (btn) { btn.textContent = 'Syncing…'; btn.disabled = true; }

  try {
    const activities = await fetchStravaActivities(1, 30);
    if (!activities.length) {
      showToast('No recent Strava rides found');
      return;
    }

    // Filter to cycling activities only
    const rides = activities.filter(a =>
      ['Ride', 'MountainBikeRide', 'GravelRide', 'EBikeRide', 'VirtualRide'].includes(a.type)
    );

    if (!rides.length) {
      showToast('No cycling activities found');
      return;
    }

    // Convert and merge, avoiding duplicates
    const log = getRideLog();
    const existingStravaIds = new Set(log.filter(e => e.stravaId).map(e => e.stravaId));
    let added = 0;

    rides.forEach(activity => {
      if (!existingStravaIds.has(activity.id)) {
        log.push(stravaActivityToLogEntry(activity));
        added++;
      }
    });

    if (added > 0) {
      // Sort by date, newest first
      log.sort((a, b) => new Date(b.date) - new Date(a.date));
      saveRideLog(log);
      renderLogEntries();
      updateLogSubtitle();
      renderWeeklyGoal();
    }

    showToast(added > 0 ? `${added} ride${added > 1 ? 's' : ''} synced from Strava` : 'Already up to date');
    if (navigator.vibrate) navigator.vibrate(40);

  } catch (e) {
    console.warn('Strava sync error:', e);
    showToast('Strava sync failed');
  } finally {
    if (btn) { btn.textContent = '🔄 Sync Strava'; btn.disabled = false; }
  }
}

function updateStravaUI() {
  const tokens = getStravaTokens();
  const connected = !!tokens?.access_token;

  const syncBtn = $('btnStravaSync');
  if (syncBtn) syncBtn.style.display = connected ? '' : 'none';

  const settingsBtn = $('stravaSettingsStatus');
  if (settingsBtn) {
    settingsBtn.textContent = connected ? 'Connected ✓' : 'Not connected';
    settingsBtn.style.color = connected ? 'var(--green)' : 'var(--text-faint)';
  }
}

function setupDebugStamp() {
  const el = $('debugBuild');
  if (el) el.textContent = 'BUILD: Jun 26 2026 17:10 UTC';
}

function setupStrava() {
  // Sync button on Log tab
  $('btnStravaSync')?.addEventListener('click', syncStrava);

  // Connect button in Settings
  $('stravaConnect')?.addEventListener('click', () => {
    if (getStravaTokens()) {
      if (confirm('Disconnect Strava?')) {
        clearStrava();
        showToast('Strava disconnected');
      }
    } else {
      // Prompt for tokens (manual paste for now)
      const accessToken = prompt('Paste your Strava Access Token:');
      if (!accessToken) return;
      const refreshToken = prompt('Paste your Strava Refresh Token:');
      if (!refreshToken) return;
      const expiresAt = prompt('Token expires_at (or leave blank):', '');

      saveStravaTokens({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt ? parseInt(expiresAt) : 0,
      });
      showToast('Strava connected');
      updateStravaUI();
      syncStrava(); // Auto-sync on connect
    }
  });

  updateStravaUI();
}

// ─── SERVICE WORKER + AUTO-UPDATE ────────────────────────────
(function setupSW() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('/sw.js').then(reg => {
    // Check for updates every time the app becomes visible
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update();
    });

    // New SW installed and waiting — reload silently to activate
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          // New version ready — reload to get it
          worker.postMessage('SKIP_WAITING');
        }
      });
    });
  }).catch(err => console.warn('SW registration failed:', err));

  // When new SW takes control, reload to get fresh HTML
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) { refreshing = true; location.reload(); }
  });
})();


// ─── BOOT ─────────────────────────────────────────────────────
init();

// Check for a newer deploy shortly after load and whenever the app regains focus.
setTimeout(checkForUpdate, 4000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkForUpdate();
});

// ─── CONFIDENCE ───────────────────────────────────────────────
function calcConfidence(current, hourly, daily) {
  if (!current) return { score: 0, factors: [] };

  const fl    = current.apparent_temperature ?? current.temperature_2m ?? 65;
  const wind  = current.wind_speed_10m ?? 0;
  const gusts = current.wind_gusts_10m ?? 0;
  const humid = current.relative_humidity_2m ?? 50;
  const code  = current.weather_code ?? 0;
  const uv    = current.uv_index ?? 0;
  const wmo   = WMO_CODES[code] || {};

  let score = 100;
  const factors = [];

  // ── TEMPERATURE (feels-like) ──
  const airTemp = current.temperature_2m ?? fl;
  // On-bike wind chill below 60°F
  let effectiveFL = fl;
  if (airTemp < 60) {
    const cyclingWind = (wind * 1.60934) + 24; // km/h: wind + ~15mph cycling
    const bikeChill = 13.12 + 0.6215 * airTemp - 11.37 * Math.pow(cyclingWind, 0.16) + 0.3965 * airTemp * Math.pow(cyclingWind, 0.16);
    if (bikeChill < fl - 3) {
      effectiveFL = Math.min(fl, bikeChill);
      factors.push({ text: `Feels ${Math.round(effectiveFL)}°F on the bike`, level: 'warn' });
    }
  }

  if (effectiveFL >= 62 && effectiveFL <= 72)      { /* ideal — no penalty */ }
  else if (effectiveFL > 72 && effectiveFL <= 78)   { score -= 3; }
  else if (effectiveFL >= 55 && effectiveFL < 62)   { score -= 3; }
  else if (effectiveFL > 78 && effectiveFL <= 85)   { score -= 8; factors.push({ text: 'Warm — hydrate extra', level: 'warn' }); }
  else if (effectiveFL >= 45 && effectiveFL < 55)   { score -= 8; factors.push({ text: 'Cool — consider arm warmers', level: 'warn' }); }
  else if (effectiveFL > 85 && effectiveFL <= 90)   { score -= 20; factors.push({ text: 'Hot — ride early or late', level: 'bad' }); }
  else if (effectiveFL >= 32 && effectiveFL < 45)   { score -= 20; factors.push({ text: 'Cold — full layers needed', level: 'bad' }); }
  else if (effectiveFL > 90 && effectiveFL <= 95)   { score -= 32; factors.push({ text: 'Very hot — heat risk', level: 'bad' }); }
  else if (effectiveFL > 95)                        { score -= 45; factors.push({ text: 'Extreme heat — consider skipping', level: 'bad' }); }
  else if (effectiveFL < 32)                        { score -= 40; factors.push({ text: 'Freezing — icy roads likely', level: 'bad' }); }

  // ── HUMIDITY (standalone) ──
  if (humid > 85)      { score -= 12; factors.push({ text: `${humid}% humidity — oppressive`, level: 'bad' }); }
  else if (humid > 75) { score -= 8;  factors.push({ text: `${humid}% humidity — uncomfortable`, level: 'warn' }); }
  else if (humid > 65) { score -= 5;  factors.push({ text: `${humid}% humidity — sticky`, level: 'warn' }); }
  else if (humid > 50) { score -= 2; }

  // ── HUMIDITY x HEAT (additional penalty) ──
  if (effectiveFL > 90 && humid > 50)      { score -= 15; factors.push({ text: 'Dangerous heat + humidity combo', level: 'bad' }); }
  else if (effectiveFL > 85 && humid > 60) { score -= 10; }
  else if (effectiveFL > 80 && humid > 70) { score -= 8; }

  // ── WIND ──
  if (wind < 8)        { /* calm */ }
  else if (wind < 12)  { score -= 3; }
  else if (wind < 16)  { score -= 8;  factors.push({ text: `${Math.round(wind)} mph wind — noticeable`, level: 'warn' }); }
  else if (wind < 20)  { score -= 15; factors.push({ text: `${Math.round(wind)} mph wind — hard work`, level: 'warn' }); }
  else if (wind < 25)  { score -= 25; factors.push({ text: `${Math.round(wind)} mph wind — exhausting`, level: 'bad' }); }
  else                 { score -= 40; factors.push({ text: `${Math.round(wind)} mph wind — dangerous`, level: 'bad' }); }

  // ── GUSTS ──
  if (gusts > 35)      { score -= 12; factors.push({ text: `Gusts to ${Math.round(gusts)} mph`, level: 'bad' }); }
  else if (gusts > 25) { score -= 5;  factors.push({ text: `Gusts to ${Math.round(gusts)} mph`, level: 'warn' }); }

  // ── PRECIPITATION ──
  if ([95,96,99].includes(code))      { score -= 50; factors.push({ text: 'Thunderstorms — stay inside', level: 'bad' }); }
  else if ([56,57,66,67].includes(code)) { score -= 50; factors.push({ text: 'Freezing rain / ice — do not ride', level: 'bad' }); }
  else if ([65,82].includes(code))    { score -= 35; factors.push({ text: 'Heavy rain', level: 'bad' }); }
  else if ([63,81].includes(code))    { score -= 25; factors.push({ text: 'Rain', level: 'bad' }); }
  else if ([55].includes(code))       { score -= 18; factors.push({ text: 'Heavy drizzle', level: 'warn' }); }
  else if ([51,53,61,80].includes(code)) { score -= 12; factors.push({ text: 'Light rain/drizzle', level: 'warn' }); }
  else if ([71,73,75].includes(code)) { score -= 45; factors.push({ text: 'Snow', level: 'bad' }); }
  else if ([45,48].includes(code))    { score -= 12; factors.push({ text: 'Fog — reduced visibility', level: 'warn' }); }

  // ── RAIN PROBABILITY (current hour) ──
  if (![51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99,71,73,75].includes(code)) {
    const hour = locationNow().hour;
    const hrIdx = hourly?.time?.findIndex(t => new Date(t).getHours() === hour);
    const pop = hrIdx >= 0 ? (hourly.precipitation_probability?.[hrIdx] ?? 0) : 0;
    if (pop > 70)      { score -= 22; factors.push({ text: `${pop}% rain chance`, level: 'bad' }); }
    else if (pop > 50) { score -= 15; factors.push({ text: `${pop}% rain chance`, level: 'warn' }); }
    else if (pop > 30) { score -= 8;  factors.push({ text: `${pop}% rain chance`, level: 'warn' }); }
    else if (pop > 10) { score -= 3; }
  }

  // ── SKY CONDITIONS ──
  if (code === 0)      { score += 2; } // clear sky — tiny bonus
  else if (code === 3) { score -= 3; factors.push({ text: 'Overcast skies', level: 'warn' }); }

  // ── UV ──
  if (uv >= 8)         { score -= 8; factors.push({ text: `Very high UV (${uv}) — sunscreen essential`, level: 'warn' }); }
  else if (uv >= 6)    { score -= 3; factors.push({ text: `High UV (${uv})`, level: 'warn' }); }

  // ── DAYLIGHT ──
  const hour = locationNow().hourF;
  const sunriseRaw = daily?.sunrise?.[0];
  const sunsetRaw  = daily?.sunset?.[0];
  const sunriseHour = sunriseRaw ? new Date(sunriseRaw).getHours() + new Date(sunriseRaw).getMinutes()/60 : 6;
  const sunsetHour  = sunsetRaw  ? new Date(sunsetRaw).getHours()  + new Date(sunsetRaw).getMinutes()/60 : 20;

  if (hour >= sunsetHour)            { score -= 40; factors.push({ text: 'After sunset — use lights', level: 'bad' }); }
  else if (hour >= sunsetHour - 1)   { score -= 8;  factors.push({ text: 'Near sunset', level: 'warn' }); }
  else if (hour < sunriseHour)       { score -= 35; factors.push({ text: 'Before sunrise — use lights', level: 'bad' }); }

  
  // ── AIR QUALITY ──
  const aqi = appState.airQuality?.current?.us_aqi ?? 0;
  if (aqi > 300)       { score -= 50; factors.push({ text: 'Hazardous air (' + aqi + ' AQI) \u2014 do not ride outdoors', level: 'bad' }); }
  else if (aqi > 200)  { score -= 40; factors.push({ text: 'Very unhealthy air (' + aqi + ' AQI) \u2014 ride indoors', level: 'bad' }); }
  else if (aqi > 150)  { score -= 25; factors.push({ text: 'Unhealthy air (' + aqi + ' AQI) \u2014 shorten your ride', level: 'bad' }); }
  else if (aqi > 100)  { score -= 10; factors.push({ text: 'Air quality unhealthy for sensitive (' + aqi + ' AQI)', level: 'warn' }); }
  else if (aqi > 50)   { score -= 3; }

return { score: Math.max(0, Math.min(100, score)), factors };
}


function renderConfidence(score, factors) {
  let color, verdict, summary;
  if (score >= 75)      { color='#52B788'; verdict='Great day to ride'; summary='Conditions look excellent.'; }
  else if (score >= 55) { color='#E9A01A'; verdict='Rideable with prep'; summary='Decent conditions with a few caveats.'; }
  else if (score >= 35) { color='#E9A01A'; verdict='Challenging ride'; summary='Experienced riders may manage.'; }
  else                  { color='#C1121F'; verdict='Not recommended'; summary='Best to ride indoors or wait.'; }

  const scoreEl   = $('meterScore');
  const verdictEl = $('meterVerdict');
  if (scoreEl)   { scoreEl.textContent = score; scoreEl.style.color = color; }
  if (verdictEl) {
    const code = appState.weather?.current?.weather_code;
    verdictEl.innerHTML = (code != null ? weatherSvg(code, 16) + ' ' : '') + verdict.toUpperCase();
    verdictEl.style.color = color;
  }
  if ($('confidenceSummary')) $('confidenceSummary').textContent = summary;

  // Animate score bar
  const bar = $('scoreBarFill');
  if (bar) {
    bar.style.width = '0%';
    bar.style.background = color;
    requestAnimationFrame(() => { requestAnimationFrame(() => {
      bar.style.width = score + '%';
    }); });
  }

  // Subtle left accent on score card
  const hero = $('confidenceHero');
  if (hero) hero.style.borderLeft = `4px solid ${color}`;
}

function renderConditionsPills(factors) {
  if (!$('conditionsPills')) return;
  $('conditionsPills').innerHTML = factors.map(f =>
    `<div class="cond-pill ${f.level}">${f.text}</div>`
  ).join('');
}

// Unified current-conditions card — one cohesive card with uniform tiles
// (icon + value + label), replacing the old separate quickStats/sunRow/aqCard.
function renderConditions(current, daily, aq) {
  const el = $('conditions');
  if (!el || !current) return;

  const uv = current.uv_index ?? daily?.uv_index_max?.[0] ?? null;
  const uvLabel = uv == null ? '–' : uv < 3 ? 'Low' : uv < 6 ? 'Mod' : uv < 8 ? 'High' : 'V.High';
  const wd = windDir(current.wind_direction_10m);
  const deg = current.wind_direction_10m ?? 0;
  const arrow = `<svg aria-hidden="true" focusable="false" viewBox="0 0 28 28" width="17" height="17" style="display:inline-block;vertical-align:-3px;transform:rotate(${deg}deg)"><circle cx="14" cy="14" r="12.5" fill="none" stroke="var(--border)" stroke-width="1.2"/><path d="M14 3 L17.5 12 L14 10 L10.5 12 Z" fill="var(--green)" opacity="0.9"/><circle cx="14" cy="14" r="1.8" fill="var(--text-faint)"/></svg>`;
  const windVal = wd ? `${toWindDisplay(current.wind_speed_10m)} ${arrow} ${wd.label}` : toWindDisplay(current.wind_speed_10m);
  const fmtTime = iso => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const tile = (icon, value, label, opts = {}) => `
    <div style="background:var(--bg);border-radius:12px;padding:11px 13px;display:flex;align-items:center;gap:10px;${opts.span ? 'grid-column:1/-1;' : ''}">
      <span style="line-height:0;flex-shrink:0;color:var(--text-muted);">${icon}</span>
      <div style="min-width:0;">
        <div style="font-family:'Space Grotesk',monospace;font-weight:700;font-size:1.02rem;color:${opts.color || 'var(--text)'};line-height:1.15;">${value}</div>
        <div style="font-size:0.64rem;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.04em;margin-top:2px;">${escHtml(label)}</div>
      </div>
    </div>`;

  const tiles = [
    tile(uiIcon('thermometer', 22), `${toDisplay(current.temperature_2m)}${unitLabel()}`, 'Temp'),
    tile(uiIcon('wind', 22), windVal, 'Wind'),
    tile(uiIcon('droplet', 22), `${current.relative_humidity_2m}%`, 'Humidity'),
    tile(uiIcon('sun', 22), escHtml(uvLabel), `UV ${uv == null ? '' : Math.round(uv)}`),
  ];
  if (daily?.sunrise?.[0]) {
    tiles.push(tile(uiIcon('sunrise', 22), escHtml(fmtTime(daily.sunrise[0])), 'Sunrise'));
    tiles.push(tile(uiIcon('sunset', 22), escHtml(fmtTime(daily.sunset[0])), 'Sunset'));
  }
  if (aq?.current) {
    const aqi = aq.current.us_aqi ?? 0;
    const level = AQ_LEVELS.find(l => aqi <= l.max) || AQ_LEVELS[AQ_LEVELS.length - 1];
    const dot = `<svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" style="display:inline-block;vertical-align:middle"><circle cx="8" cy="8" r="6" fill="${level.color}"/></svg>`;
    tiles.push(tile(dot, `${Math.round(aqi)} AQI`, level.label, { span: true, color: level.color }));
  }

  el.setAttribute('style', 'background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:14px 16px;margin-bottom:10px;');
  el.innerHTML = `
    <div style="font-size:0.8rem;font-weight:700;color:var(--text);margin-bottom:10px;">Conditions</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">${tiles.join('')}</div>
  `;
}

function renderHourly(hourly) {
  if (!$('hourlyStrip')) return;
  const now = locationNow().wall; // location wall clock, comparable to new Date(naive forecast string)
  const items = hourly.time
    .map((t,i) => ({ time:new Date(t), temp:(hourly.apparent_temperature?.[i] ?? hourly.temperature_2m[i]), code:hourly.weather_code[i], pop:hourly.precipitation_probability[i] }))
    .filter(h => h.time > now).slice(0,8);
  $('hourlyStrip').innerHTML = items.map(h => {
    const wmo = WMO_CODES[h.code] || { icon:'🌡️' };
    const hr = h.time.getHours();
    const label = hr===0?'12am':hr===12?'12pm':hr<12?`${hr}am`:`${hr-12}pm`;
    return `<div class="hour-card">
      <span class="hour-time">${label}</span>
      <span class="hour-icon" style="color:var(--text-muted)">${weatherSvg(h.code, 22)}</span>
      <span class="hour-temp">${toDisplay(h.temp)}${unitLabel()}</span>
      <span class="hour-pop" style="opacity:${h.pop>15?1:0}">${h.pop>15?`💧${h.pop}%`:'-'}</span>
    </div>`;
  }).join('');
}

function renderWeekForecast(daily) {
  if (!daily?.time) { $('weekForecast').innerHTML = '<div class="empty-state">No forecast available.</div>'; return; }
  const days = daily.time.map((t,i) => {
    const code  = daily.weather_code[i];
    const wmo   = WMO_CODES[code] || { icon:'🌡️', rain:false };
    const maxT  = daily.temperature_2m_max[i];
    const minT  = daily.temperature_2m_min[i];
    // Use feels-like if available, fall back to air temp
    const maxFL = daily.apparent_temperature_max?.[i] ?? maxT;
    const minFL = daily.apparent_temperature_min?.[i] ?? minT;
    const wind  = daily.wind_speed_10m_max[i];
    const precip = daily.precipitation_sum[i];
    // ── HOURLY WINDOW-BASED SCORING ──
    // Score each rideable hour, then use the best 3-hour window
    const hourly = appState.weather?.hourly;
    let score = 0;
    let hourScores = null;      // hoisted out of the if-block so the timing-verdict logic below can read them
    let bestWindowStart = null;

    if (hourly?.time) {
      const dayStr = t;
      hourScores = [];
      
      hourly.time.forEach((ht, hi) => {
        if (!ht.startsWith(dayStr)) return;
        const hour = new Date(ht).getHours();
        if (hour < 5 || hour > 21) return; // skip overnight
        
        const fl = hourly.apparent_temperature?.[hi] ?? hourly.temperature_2m[hi];
        const windH = hourly.wind_speed_10m[hi] ?? 0;
        const codeH = hourly.weather_code[hi] ?? 0;
        const pop = hourly.precipitation_probability[hi] ?? 0;
        const humidH = hourly.relative_humidity_2m?.[hi] ?? 50;
        const uvH = hourly.uv_index?.[hi] ?? 0;
        
        let hs = 100;
        // Shared weather brackets — see src/lib/scoring.js
        hs += weatherPenalty({ fl, humid: humidH, wind: windH, code: codeH, pop, uv: uvH });
        hourScores.push(Math.max(0, Math.min(100, hs)));
      });
      
      // Find best 3-hour window and its position
      let bestWindowScore = 0;
      bestWindowStart = 0; // assign the hoisted outer var
      if (hourScores.length >= 3) {
        for (let i = 0; i <= hourScores.length - 3; i++) {
          const avg = (hourScores[i] + hourScores[i+1] + hourScores[i+2]) / 3;
          if (avg > bestWindowScore) { bestWindowScore = avg; bestWindowStart = i; }
        }
        score = Math.round(bestWindowScore);
      } else if (hourScores.length > 0) {
        score = Math.round(Math.max(...hourScores));
        bestWindowStart = hourScores.indexOf(Math.max(...hourScores));
      }
      
      // Hazard penalties — dangerous conditions anywhere in the day
      let hasStorms = false, hasExtremeHeat = false, hasSnow = false;
      hourly.time.forEach((ht, hi) => {
        if (!ht.startsWith(dayStr)) return;
        const hour = new Date(ht).getHours();
        if (hour < 5 || hour > 21) return;
        const codeH = hourly.weather_code[hi] ?? 0;
        const flH = hourly.apparent_temperature?.[hi] ?? hourly.temperature_2m[hi];
        if ([95,96,99].includes(codeH)) hasStorms = true;
        if ([71,73,75].includes(codeH)) hasSnow = true;
        if (flH > 95) hasExtremeHeat = true;
      });
      
      if (hasStorms) score -= 15;
      if (hasSnow) score -= 15;
      if (hasExtremeHeat && !hasStorms) score -= 10;
      
      // Determine best window timing for verdict
      const windowStartHour = 5 + bestWindowStart; // hours array starts at 5AM
      const isMorning = windowStartHour < 11;
      const isAfternoon = windowStartHour >= 12 && windowStartHour < 17;
      const isEvening = windowStartHour >= 17;
      const isAllDay = hourScores.length > 0 && Math.min(...hourScores) >= 50;
      
      // Store timing hint on the day object for verdict display
      if (isAllDay) {
        // no timing restriction needed
      } else if (hasStorms || hasExtremeHeat || hasSnow) {
        // hazards exist — timing matters
      }
      
    } else {
      // Fallback to daily data if no hourly available
      score = 50;
      if (wmo.rain) score -= 25;
      if (maxFL > 95) score -= 30;
      else if (maxFL > 88) score -= 15;
      if (wind > 20) score -= 15;
    }
    
    score = Math.max(0, Math.min(100, score));
    
    // Store timing info for verdict labels
    const windowHour = bestWindowStart != null ? 5 + bestWindowStart : null;
    const allDayGood = hourScores != null && hourScores.length > 0 && Math.min(...hourScores) >= 50;
    const timingHint = allDayGood ? 'all-day' 
      : windowHour !== null && windowHour < 11 ? 'morning'
      : windowHour !== null && windowHour >= 16 ? 'evening'  
      : windowHour !== null ? 'afternoon' : null;
    const sunsetRaw = daily.sunset?.[i];
    const sunset = sunsetRaw ? new Date(sunsetRaw).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}) : null;
    const sunriseRaw = daily.sunrise?.[i];
    const sunrise = sunriseRaw ? new Date(sunriseRaw).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}) : null;
    return { t, wmo, code, maxT, minT, maxFL, minFL, score: Math.max(0, Math.min(100, score)), sunset, sunrise, timingHint: typeof timingHint !== 'undefined' ? timingHint : null };
  });
  const bestScore = Math.max(...days.slice(1).map(d => d.score));
  appState.forecastDays = days;
  $('weekForecast').innerHTML = days.map((d,i) => {
    const date = new Date(d.t + 'T12:00:00');
    const dayName = i===0?'Today':i===1?'Tomorrow':date.toLocaleDateString([],{weekday:'short'});
    const isBest = d.score === bestScore && i > 0;
    const scoreColor = d.score>=70?'#2D6A4F':d.score>=45?'#E9A01A':'#C1121F';
    const timingLabel = d.timingHint === 'morning' ? 'AM' : d.timingHint === 'afternoon' ? 'PM' : d.timingHint === 'evening' ? 'Eve' : '';
    return `<div class="day-card ${isBest?'best-day':''}" data-daydate="${d.t}" style="cursor:pointer">
      <div class="day-name">${dayName}</div>
      <div class="day-icon" style="color:var(--text-muted)">${weatherSvg(d.code ?? 0, 28, d.wmo?.label || 'weather')}</div>
      <div class="day-temps">
        <div class="day-high">${toDisplay(d.maxFL)}${unitLabel()}</div>
        <div class="day-low">${toDisplay(d.minFL)}${unitLabel()}</div>
        <div style="font-size:0.68rem;color:var(--text-faint);margin-top:1px;">feels like</div>
        ${d.sunset ? `<div style="font-size:0.7rem;color:var(--text-faint);margin-top:3px;">${uiIcon('sunset', 12)} ${d.sunset}</div>` : ''}
      </div>
      <div class="day-score-wrap">
        ${isBest?'<span class="best-day-badge">Best day</span>':''}
        <div class="day-score-num" style="color:${scoreColor}">${d.score}</div>
        <div class="day-score-label" style="color:${scoreColor}">${timingLabel ? timingLabel + ' ride' : 'Ride score'}</div>
      </div>
    </div>`;
  }).join('');

  // Click handler wired via delegation in setupForecastDetail
}


  

// ── FOOD TAB ──
function renderFoodTab() {
  const catEl = $('foodTabCategories');
  const chipsEl = $('foodTabChips');
  const resultEl = $('foodTabResult');
  if (!catEl) return;

  // Free-text food search (wired once; the input persists across re-renders).
  const searchEl = $('foodTabSearch');
  const searchResultEl = $('foodTabSearchResult');
  if (searchEl && !searchEl._wired) {
    searchEl._wired = true;
    searchEl.addEventListener('input', () => {
      const q = searchEl.value.trim();
      if (!q) { if (searchResultEl) searchResultEl.innerHTML = ''; return; }
      const curated = matchFood(q);
      if (curated) renderFoodResult(curated, searchResultEl);
      else renderNoFoodMatch(searchResultEl); // honest: not on our list + a timing rule of thumb
    });
  }
  // Always recalculate smart picks (context changes with time/rides)
  const alreadyWired = catEl._wired;

  // ── SMART PICKS based on context ──
  const hour = locationNow().hour; // location wall-clock, not the device's
  const fl = appState.weather?.current?.apparent_temperature ?? appState.weather?.current?.temperature_2m ?? 70;
  const isHot = fl >= 85;
  const isCold = fl < 45;

  // Check if rider recently logged a ride (within 3 hours)
  const log = getRideLog();
  const recentRide = log.length && (Date.now() - new Date(log[0].date).getTime()) < 3 * 3600000;

  appState._recoveryPlan = '';
  let smartTitle = '';
  let smartPicks = [];

  if (recentRide) {
    const lastRide = log[0];
    const rideDist = lastRide.distanceMi ? Math.round(lastRide.distanceMi) : 0;
    const rideUnit = lastRide.distanceUnit || 'mi';
    const rideFeel = lastRide.feel || 'good';
    const rideDistDisplay = rideUnit === 'km' ? Math.round(rideDist * 1.60934) + ' km' : rideDist + ' mi';

    const isLong = rideDist >= 30;
    const isShort = rideDist < 10;

    if (isShort) {
      smartTitle = '\u{1F3C1} Quick ' + rideDistDisplay + ' ride \u2014 light refuel';
      smartPicks = ['Banana','Greek yogurt','Water','Berries','Dates','Dark chocolate'];
    } else if (isLong) {
      smartTitle = '\u{1F3C1} ' + rideDistDisplay + ' done! Recovery is critical';
      smartPicks = ['Chocolate milk','Protein smoothie','Rice bowl','Pasta','Chicken breast','Sweet potato'];
    } else {
      smartTitle = '\u{1F3C1} ' + rideDistDisplay + ' ride \u2014 recover right';
      smartPicks = ['Chocolate milk','Protein smoothie','Rice bowl','Chicken breast','Greek yogurt','Berries'];
    }

    // Simple recovery advice
    const recoveryTip = isShort ? '' : isLong 
      ? 'Eat within 30 min \u2014 protein + carbs + a full bottle of water' + (isHot ? ' + electrolytes' : '')
      : 'Grab a snack with protein within 30 min' + (isHot ? ' and rehydrate' : '');
    const recoveryPlan = recoveryTip ? '<div style="margin-top:8px;font-size:0.85rem;color:var(--text-muted)">' + recoveryTip + '</div>' : '';

    smartTitle = smartTitle;
    // Store recovery plan to inject after smart picks
    appState._recoveryPlan = recoveryPlan;
  } else if (hour < 9) {
    smartTitle = '\u{2600}\uFE0F Morning ride? Fuel up';
    smartPicks = ['Oatmeal','Banana','Peanut butter toast','Coffee','Eggs','Greek yogurt'];
    if (isHot) smartPicks = ['Banana','Smoothie','Coffee','Greek yogurt','Watermelon','Water'];
  } else if (hour < 12) {
    smartTitle = '\u{1F6B4} Heading out? Quick fuel';
    smartPicks = ['Banana','Energy bar','Fig bar','Coffee','Dates','Peanut butter toast'];
    if (isHot) smartPicks = ['Banana','Watermelon','Coconut water','Energy gel','Electrolyte tablets','Water'];
  } else if (hour < 15) {
    smartTitle = '\u{1F34C} Afternoon ride picks';
    smartPicks = ['Energy bar','Banana','Trail mix','Fig bar','Stroopwafel','Water'];
    if (isHot) smartPicks = ['Watermelon','Coconut water','Electrolyte tablets','Energy gel','Banana','Water'];
  } else if (hour < 19) {
    smartTitle = '\u{1F37D}\uFE0F Post-ride? Refuel';
    smartPicks = ['Chicken breast','Rice bowl','Pasta','Chocolate milk','Sweet potato','Protein smoothie'];
  } else {
    smartTitle = '\u{1F319} Evening recovery';
    smartPicks = ['Cottage cheese','Greek yogurt','Berries','Dark chocolate','Tuna','Soup'];
  }

  if (isCold && !recentRide) {
    smartTitle = '\u{2744}\uFE0F Cold day picks';
    smartPicks = ['Oatmeal','Soup','Coffee','Pasta','Sweet potato','Pancakes'];
  }

  const smartCards = smartPicks.map(name => {
    const f = FOOD_DB.find(fd => fd.name === name);
    if (!f) return '';
    const color = f.score >= 75 ? 'var(--green)' : f.score >= 50 ? '#E9A01A' : '#C1121F';
    return '<button class="smart-pick" data-food="' + escHtml(f.name) + '" style="flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-radius:12px;cursor:pointer;-webkit-appearance:none;min-width:80px;font-family:inherit">' +
      '<span style="font-family:var(--font-data);font-weight:700;font-size:1rem;color:' + color + '">' + f.score + '</span>' +
      '<span style="font-size:0.78rem;font-weight:600;color:var(--text)">' + escHtml(f.name) + '</span>' +
      '<span style="font-size:0.65rem;color:var(--text-faint)">' + (f.preTiming || f.when.split(",")[0]) + '</span>' +
      '</button>';
  }).join('');

  // ── CATEGORIES ──
  const cats = [
    { id:'pre',    label:'\u{1F550} Pre-ride',  filter: f => f.when.includes('pre') },
    { id:'during', label:'\u{1F6B4} During',     filter: f => f.when.includes('during') },
    { id:'post',   label:'\u{1F3C1} Recovery',   filter: f => f.when.includes('post') },
    { id:'snacks', label:'\u{1F34C} Snacks',     filter: f => ['Banana','Nuts','Trail mix','Dates','Granola','Fig bar','Energy bar','Peanut butter','Gummy bears','Chocolate chip cookie','Jerky','Stroopwafel','Clif Bloks','Protein bar','Pickles','Greek yogurt','Peanut butter toast','Bagel'].includes(f.name) },
    { id:'avoid',  label:'\u26A0\uFE0F Avoid',  filter: f => f.when === 'avoid' },
  ];

  catEl.innerHTML = `
    <div style="margin-bottom:16px">
      <div style="font-weight:700;font-size:0.92rem;margin-bottom:10px">${smartTitle}</div>
      <div style="display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding-bottom:4px">
        ${smartCards}
      </div>
      ${appState._recoveryPlan || ''}
    </div>
    <div style="height:1px;background:var(--border);margin-bottom:14px"></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      ${cats.map(c => '<button class="food-cat-pill" data-fcat="' + c.id + '">' + c.label + '</button>').join('')}
    </div>
  `;

  catEl._wired = true;

  // Wire smart pick taps
  catEl.querySelectorAll('.smart-pick').forEach(btn => {
    btn.addEventListener('click', () => {
      const food = FOOD_DB.find(f => f.name === btn.dataset.food);
      if (food) {
        renderFoodResult(food, resultEl);
        setTimeout(() => resultEl?.scrollIntoView({ behavior:'smooth', block:'start' }), 50);
      }
    });
  });

  function showCat(catId) {
    const cat = cats.find(c => c.id === catId);
    if (!cat) return;
    catEl.querySelectorAll('.food-cat-pill').forEach(b => b.classList.remove('active'));
    const btn = catEl.querySelector('[data-fcat="' + catId + '"]');
    if (btn) btn.classList.add('active');

    const foods = FOOD_DB.filter(cat.filter).sort((a,b) => b.score - a.score);
    if (resultEl) resultEl.innerHTML = '';
    if (chipsEl) {
      chipsEl.innerHTML = foods.map(f => {
        const color = f.score >= 75 ? 'var(--green)' : f.score >= 50 ? '#E9A01A' : '#C1121F';
        return '<button class="food-chip" data-food="' + escHtml(f.name) + '"><span class="food-chip-score" style="color:' + color + '">' + f.score + '</span> ' + escHtml(f.name) + '</button>';
      }).join('');
      chipsEl.querySelectorAll('.food-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          chipsEl.querySelectorAll('.food-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          const food = FOOD_DB.find(f => f.name === chip.dataset.food);
          renderFoodResult(food, resultEl);
          setTimeout(() => resultEl?.scrollIntoView({ behavior:'smooth', block:'start' }), 50);
        });
      });
    }
  }

  catEl.querySelectorAll('.food-cat-pill').forEach(btn => {
    btn.addEventListener('click', () => showCat(btn.dataset.fcat));
  });

  // Clear chips/result when smart picks refresh
  if (chipsEl) chipsEl.innerHTML = '';
  if (resultEl) resultEl.innerHTML = '';
}




// ── POST-RIDE RECOVERY CARD ON LOG TAB ──
function renderRecoveryCard(entry) {
  const el = $('logRecoveryCard');
  if (!el) return;

  const dist = entry.distanceMi ? Math.round(entry.distanceMi) : 0;
  const unit = entry.distanceUnit || 'mi';
  const distDisplay = unit === 'km' ? Math.round(dist * 1.60934) + ' km' : dist + ' mi';
  const isLong = dist >= 30;
  const isShort = dist < 10;
  const isHot = (appState.weather?.current?.apparent_temperature ?? 70) >= 85;

  const tip = isShort ? 'A light snack will do' 
    : isLong ? 'Eat within 30 min \u2014 protein + carbs + a full bottle of water' + (isHot ? ' + electrolytes' : '')
    : 'Grab a snack with protein within 30 min' + (isHot ? ' and rehydrate' : '');

  const picks = isShort 
    ? ['Banana','Greek yogurt','Water']
    : isLong 
    ? ['Chocolate milk','Protein smoothie','Rice bowl','Pasta']
    : ['Chocolate milk','Banana','Greek yogurt','Rice bowl'];

  const pickCards = picks.map(name => {
    const f = FOOD_DB.find(fd => fd.name === name);
    if (!f) return '';
    const color = f.score >= 75 ? 'var(--green)' : f.score >= 50 ? '#E9A01A' : '#C1121F';
    return '<button class="recovery-pick" data-food="' + escHtml(f.name) + '" style="flex:0 0 auto;display:flex;align-items:center;gap:6px;padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;cursor:pointer;-webkit-appearance:none;font-family:inherit">' +
      '<span style="font-family:var(--font-data);font-weight:700;font-size:0.85rem;color:' + color + '">' + f.score + '</span>' +
      '<span style="font-size:0.82rem;font-weight:600;color:var(--text)">' + escHtml(f.name) + '</span></button>';
  }).join('');

  el.style.display = '';
  el.innerHTML = '<div style="padding:14px;background:var(--surface);border:1px solid var(--border);border-radius:12px;margin-bottom:14px">' +
    '<div style="font-weight:700;font-size:0.92rem;margin-bottom:4px">\u{1F3C1} ' + distDisplay + ' logged</div>' +
    '<div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:10px">' + tip + '</div>' +
    '<div style="display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding-bottom:4px">' + pickCards + '</div>' +
    '<button id="seeAllRecovery" style="margin-top:10px;background:none;border:none;font-family:inherit;font-size:0.82rem;font-weight:600;color:var(--green);cursor:pointer;-webkit-appearance:none;padding:0">See all recovery picks \u2192</button>' +
    '</div>';

  // Wire food detail taps
  el.querySelectorAll('.recovery-pick').forEach(btn => {
    btn.addEventListener('click', () => {
      const food = FOOD_DB.find(f => f.name === btn.dataset.food);
      if (food) {
        // Switch to Food tab and show this food
        document.querySelectorAll('.nav-item').forEach(n => { n.classList.remove('active'); n.removeAttribute('aria-current'); });
        document.querySelectorAll('.tab-pane').forEach(p => { p.classList.remove('active'); p.scrollTop = 0; });
        document.querySelector('.nav-item[data-tab="tabFood"]')?.classList.add('active'); document.querySelector('.nav-item[data-tab="tabFood"]')?.setAttribute('aria-current','page');
        $('tabFood')?.classList.add('active');
        renderFoodTab();
        const resultEl = $('foodTabResult');
        renderFoodResult(food, resultEl);
        setTimeout(() => resultEl?.scrollIntoView({ behavior:'smooth', block:'start' }), 100);
      }
    });
  });

  // Wire "See all" link
  $('seeAllRecovery')?.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(n => { n.classList.remove('active'); n.removeAttribute('aria-current'); });
    document.querySelectorAll('.tab-pane').forEach(p => { p.classList.remove('active'); p.scrollTop = 0; });
    document.querySelector('.nav-item[data-tab="tabFood"]')?.classList.add('active'); document.querySelector('.nav-item[data-tab="tabFood"]')?.setAttribute('aria-current','page');
    $('tabFood')?.classList.add('active');
    renderFoodTab();
  });

  // Auto-hide after 3 hours
  setTimeout(() => { el.style.display = 'none'; }, 3 * 3600000);
}

// ── TRAIL LINKS IN PREP ──
document.addEventListener('click', e => {
  if (e.target.closest('#trailsToggle')) {
    const panel = $('trailLinksPrep');
    const arrow = $('trailsArrow');
    if (!panel) return;
    panel.classList.toggle('hidden');
    if (arrow) arrow.textContent = panel.classList.contains('hidden') ? '\u2193' : '\u2191';
    // Render trail links if empty
    if (!panel.innerHTML.trim()) {
      panel.innerHTML = [
        {name:'Komoot', url:'https://www.komoot.com/discover', icon:'\u{1F6B5}', desc:'Routes & navigation'},
        {name:'Strava Heatmap', url:'https://www.strava.com/heatmap', icon:'\u{1F525}', desc:'Popular cycling routes'},
        {name:'RideWithGPS', url:'https://ridewithgps.com/find', icon:'\u{1F4CD}', desc:'Route planning'},
        {name:'OpenCycleMap', url:'https://www.opencyclemap.org/', icon:'\u{1F5FA}', desc:'Cycling-specific maps'},
        {name:'Trailforks', url:'https://www.trailforks.com/', icon:'\u{1F332}', desc:'MTB & gravel trails'},
        {name:'Google Maps Bike Shops', url:'https://www.google.com/maps/search/bike+shops+near+me', icon:'\u{1F6E0}', desc:'Nearby shops & repair'},
      ].map(l => '<a href="' + l.url + '" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--surface);border:1px solid var(--border);border-radius:10px;text-decoration:none;color:var(--text)"><span style="font-size:1.2rem">' + l.icon + '</span><div><div style="font-weight:600;font-size:0.88rem">' + l.name + '</div><div style="font-size:0.78rem;color:var(--text-muted)">' + l.desc + '</div></div></a>').join('');
    }
  }
});

