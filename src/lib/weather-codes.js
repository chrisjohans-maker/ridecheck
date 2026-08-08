// Weather-code tables + NWS text->WMO mapping (pure).
export const WMO_CODES = {
  0:  { label:"Clear sky",           icon:"☀️",  rain:false },
  1:  { label:"Mainly clear",        icon:"🌤️", rain:false },
  2:  { label:"Partly cloudy",       icon:"⛅",  rain:false },
  3:  { label:"Overcast",            icon:"☁️",  rain:false },
  45: { label:"Foggy",               icon:"🌫️", rain:false },
  48: { label:"Icy fog",             icon:"🌫️", rain:false },
  51: { label:"Light drizzle",       icon:"🌦️", rain:true  },
  53: { label:"Drizzle",             icon:"🌦️", rain:true  },
  55: { label:"Heavy drizzle",       icon:"🌧️", rain:true  },
  61: { label:"Light rain",          icon:"🌧️", rain:true  },
  63: { label:"Rain",                icon:"🌧️", rain:true  },
  65: { label:"Heavy rain",          icon:"🌧️", rain:true  },
  56: { label:"Freezing drizzle",    icon:"🧊",  rain:true  },
  57: { label:"Freezing drizzle",    icon:"🧊",  rain:true  },
  66: { label:"Freezing rain",       icon:"🧊",  rain:true  },
  67: { label:"Freezing rain",       icon:"🧊",  rain:true  },
  71: { label:"Light snow",          icon:"🌨️", rain:false },
  73: { label:"Snow",                icon:"❄️",  rain:false },
  75: { label:"Heavy snow",          icon:"❄️",  rain:false },
  80: { label:"Rain showers",        icon:"🌦️", rain:true  },
  81: { label:"Heavy showers",       icon:"🌧️", rain:true  },
  82: { label:"Violent showers",     icon:"⛈️",  rain:true  },
  95: { label:"Thunderstorm",        icon:"⛈️",  rain:true  },
  99: { label:"Severe thunderstorm", icon:"⛈️",  rain:true  },
};

export const WMO_SHORT = {
  51:'Drizzle', 53:'Drizzle', 55:'Heavy drizzle',
  61:'Light rain', 63:'Rain', 65:'Heavy rain',
  80:'Rain showers', 81:'Heavy showers', 82:'Violent showers',
  95:'Thunderstorm', 99:'Severe storm',
};

export function nwsTextToWMO(text) {
  const t = (text || '').toLowerCase();
  if (/(?:^|\s)thunderstorm/.test(t) && !/slight chance|isolated|chance/.test(t)) return 95;
  if (/thunder/.test(t) && /slight chance|isolated/.test(t)) return 2;
  if (/thunder/.test(t) && /chance|likely/.test(t)) return 80;
  // Freezing/ice must be checked BEFORE plain rain — "Freezing Rain" contains "rain"
  if (/freezing|sleet|ice pellets|wintry mix/.test(t)) return 66;
  if (/heavy.*rain|heavy.*shower/.test(t)) return 65;
  if (/(?:rain|shower)/.test(t) && /slight chance|isolated/.test(t)) return 2;
  if (/(?:rain|shower)/.test(t) && /chance/.test(t)) return 61;
  if (/(?:rain|shower)/.test(t) && /light/.test(t)) return 61;
  if (/rain|shower/.test(t)) return 63;
  if (/drizzle/.test(t)) return 51;
  if (/heavy.*snow|blizzard/.test(t)) return 75;
  if (/snow/.test(t)) return 71;
  if (/fog|mist|haze/.test(t)) return 45;
  if (/mostly cloudy/.test(t)) return 3;
  if (/overcast|cloudy/.test(t)) return 3;
  if (/partly/.test(t)) return 2;
  if (/mostly clear|mostly sunny/.test(t)) return 1;
  if (/clear|sunny/.test(t)) return 0;
  return 2;
}
export function nwsWind(s) { if (!s) return 0; const n = s.match(/\d+/g); return n ? (n.length > 1 ? parseInt(n[1]) : parseInt(n[0])) : 0; }
export function nwsDir(d) { return {N:0,NNE:22,NE:45,ENE:67,E:90,ESE:112,SE:135,SSE:157,S:180,SSW:202,SW:225,WSW:247,W:270,WNW:292,NW:315,NNW:337}[d] ?? 0; }
