import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { topicList, findCity, cityPoint, defaultPrefs, isLocale, setLocale, t, BRAND } from '@agora/core';
import { geocode } from '@agora/server/geocode';
import { c, heading } from './ui.js';
import { savePrefs, PREFS_PATH } from './prefs.js';

/** Interactive first-run setup. Saves ~/.agora.json. */
export async function runWizard(cities, existing, lang = 'en') {
  const rl = readline.createInterface({ input, output });
  const ask = async (q, def = '') => {
    const answer = (await rl.question(`${q}${def ? c.gray(` [${def}]`) : ''} `)).trim();
    return answer || def;
  };
  const yesNo = async (q, def = true) => {
    const a = (await ask(`${q} (y/n)`, def ? 'y' : 'n')).toLowerCase();
    return a.startsWith('y');
  };
  const cmd = BRAND.cliCommand;

  try {
    const prefs = { ...defaultPrefs(), ...(existing || {}) };
    const chosen = await ask(t('cli.wizard.language'), lang);
    prefs.lang = isLocale(chosen) ? chosen : lang;
    setLocale(prefs.lang);

    console.log(heading(t('cli.wizard.heading')));
    console.log(c.dim(`${t('cli.wizard.intro', { cmd })}\n`));

    console.log(c.bold(t('cli.wizard.q1')));
    const pickable = topicList().filter((x) => x.id !== 'other');
    pickable.forEach((x, i) => console.log(`   ${String(i + 1).padStart(2)}. ${x.label}`));
    const current = prefs.interests.map((id) => pickable.findIndex((x) => x.id === id) + 1).filter((n) => n > 0);
    const picks = await ask(t('cli.wizard.pickNumbers'), current.join(',') || '1,2,4');
    prefs.interests = [...new Set(picks.split(/[,\s]+/).map((n) => pickable[Number(n) - 1]).filter(Boolean).map((x) => x.id))];

    console.log(`\n${c.bold(t('cli.wizard.q2'))}`);
    prefs.availability = {
      evenings: await yesNo(t('cli.wizard.evenings'), prefs.availability.evenings),
      daytime: await yesNo(t('cli.wizard.daytime'), prefs.availability.daytime),
      weekends: await yesNo(t('cli.wizard.weekends'), prefs.availability.weekends),
    };
    prefs.student = await yesNo(t('cli.wizard.student'), prefs.student);

    console.log(`\n${c.bold(t('cli.wizard.q3'))}`);
    let city = null;
    while (!city) {
      const name = await ask(t('cli.wizard.cityPrompt'), prefs.homeCityId ? (findCity(cities, prefs.homeCityId) || {}).name : '');
      city = findCity(cities, name);
      if (!city) console.log(c.yellow(t('cli.wizard.cityNotFound', { name, n: cities.length })));
    }
    prefs.homeCityId = city.cityId;
    const where = await ask(t('cli.wizard.zipPrompt'), prefs.locationLabel || '');
    if (where) {
      try {
        const g = await geocode(where, cities);
        if (g) {
          prefs.location = { lat: g.lat, lng: g.lng };
          prefs.locationLabel = g.label;
          console.log(c.green(t('cli.wizard.found', { label: g.label })));
        } else console.log(c.yellow(t('cli.wizard.noMatch')));
      } catch {
        console.log(c.yellow(t('cli.wizard.geoDown')));
      }
    }
    if (!prefs.location) {
      prefs.location = cityPoint(city);
      prefs.locationLabel = t('common.cityHallOf', { city: city.name });
    }
    prefs.maxMiles = Number(await ask(t('cli.wizard.howFar'), String(prefs.maxMiles))) || 15;

    console.log(`\n${c.bold(t('cli.wizard.q4'))}`);
    prefs.canSpeakOnly = await yesNo(t('cli.wizard.speakOnly'), prefs.canSpeakOnly);
    prefs.virtualOk = await yesNo(t('cli.wizard.remoteOk'), prefs.virtualOk);

    const file = savePrefs(prefs);
    console.log(`\n${c.green(t('cli.wizard.saved'))} ${c.dim(file)}`);
    console.log(t('cli.wizard.runNext', { match: c.cyan(`${cmd} match`), map: c.cyan(`${cmd} map`) }));
    return prefs;
  } finally {
    rl.close();
  }
}

export { PREFS_PATH };
