import initDebug from './dist/debug.js';
import initLocale from './src/locale.js';
import initLocalizeMeReady from './src/localize-me-ready-module.js';
import initJsonPatches from './src/json-patches.js';

if (sc.ru == null) sc.ru = {};

initDebug();
initLocale();
initLocalizeMeReady();
initJsonPatches();
