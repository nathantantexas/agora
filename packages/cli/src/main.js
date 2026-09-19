import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BRAND,
  topicList,
  getTopic,
  todayStr,
  upcomingMeetings,
  expandCityMeetings,
  addDays,
  nextMeetingFor,
  buildPlan,
  matchYouthPrograms,
  computeStats,
  findCity,
  cityPoint,
  formatDate,
  formatTime,
  relativeDays,
  milesText,
  describeRecurrence,
  weekdayShortNames,
  glossary,
  checklist,
  speakingTips,
  buildComment,
  estimateSpeakingSeconds,
  timeOfDayFor,
  setLocale,
  isLocale,
  localizeCities,
  t,
  tList,
} from '@agora/core';
import { loadCities, loadNews, loadTranslations, REPO_ROOT } from '@agora/core/node';
import { fetchNews } from '@agora/server/news';
import { geocode } from '@agora/server/geocode';
import { explainAgendaItem, aiAvailable } from '@agora/server/ai';
import { c, heading, label, bullet, table, bar, wrapText } from './ui.js';
import { loadPrefs, PREFS_PATH } from './prefs.js';
import { renderAsciiMap } from './asciimap.js';
import { runWizard } from './wizard.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const CMD = BRAND.cliCommand;

/** Flags that never take a value, so `--evening Plano` leaves "Plano" as a positional. */
const BOOLEAN_FLAGS = new Set(['evening', 'daytime', 'weekends', 'speak', 'json', 'all', 'help', 'version']);

/** Parse `cmd --flag value --bool positional` into {cmd, flags, args}. */
export function parseArgs(argv) {
  const flags = {};
  const args = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const k = eq === -1 ? a.slice(2) : a.slice(2, eq);
      const inline = eq === -1 ? undefined : a.slice(eq + 1);
      const next = argv[i + 1];
      if (inline !== undefined) flags[k] = inline;
      else if (BOOLEAN_FLAGS.has(k)) flags[k] = true;
      else if (next !== undefined && !next.startsWith('--')) {
        flags[k] = next;
        i += 1;
      } else flags[k] = true;
    } else args.push(a);
  }
  const cmd = args.shift() || 'help';
  return { cmd, flags, args };
}

/** Flags used as text: a bare `--name` (no value) becomes undefined instead of `true`. */
const text = (v) => (typeof v === 'string' ? v : undefined);

const COMMAND_NAMES = ['help', 'setup', 'prefs', 'match', 'meetings', 'cities', 'city', 'speak', 'agenda', 'youth', 'map', 'stats', 'news', 'explain', 'comment', 'learn', 'topics', 'serve', 'demo'];

export async function run(argv, io = console) {
  const { cmd, flags, args } = parseArgs(argv);
  const json = flags.json === true || flags.json === 'true';
  const today = flags.today && /^\d{4}-\d{2}-\d{2}$/.test(flags.today) ? flags.today : todayStr();
  const out = (s) => io.log(s);

  const saved = loadPrefs();
  const lang = [text(flags.lang), process.env.AGORA_LANG, saved.prefs.lang].find(isLocale) || 'en';
  setLocale(lang);

  if (cmd === 'help' || flags.help) {
    out(help());
    return 0;
  }
  if (cmd === 'serve') return serve(flags);

  let cities;
  try {
    cities = localizeCities(loadCities(), loadTranslations(lang));
  } catch (e) {
    io.error(c.red(e.message));
    return 1;
  }

  const emit = (data, render) => {
    if (json) out(JSON.stringify(data, null, 2));
    else out(render());
  };

  switch (cmd) {
    case 'topics': {
      const topics = topicList();
      emit({ topics }, () => [heading(t('cli.topicsHeading')), table(topics.map((x) => ({ id: c.cyan(x.id), label: x.label, why: x.youthAngle })), [{ key: 'id', title: t('cli.colId') }, { key: 'label', title: t('cli.colTopic') }, { key: 'why', title: t('cli.colWhy'), width: 60 }])].join('\n'));
      return 0;
    }

    case 'cities': {
      let list = cities;
      if (text(flags.county)) list = list.filter((x) => x.county.toLowerCase() === flags.county.toLowerCase());
      const rows = list.map((city) => {
        const next = nextMeetingFor(city, today);
        return {
          name: c.bold(city.name),
          county: city.county,
          when: next ? `${formatDate(next.date)} ${formatTime(next.time)}` : c.dim(t('cli.noneFound')),
          rel: next ? relativeDays(next.date, today) : '',
          speak: city.publicComment && city.publicComment.virtualAllowed ? t('cli.inPersonOrRemote') : t('cli.inPerson'),
          youth: (city.youthPrograms || []).length ? c.green(t('cli.yes')) : c.dim(t('cli.no')),
          id: c.gray(city.cityId),
        };
      });
      emit({ cities: list.map((x) => ({ cityId: x.cityId, name: x.name, county: x.county, nextMeeting: nextMeetingFor(x, today) })) }, () =>
        [
          heading(t('cli.citiesHeading', { app: BRAND.name, n: list.length, region: BRAND.region })),
          table(rows, [{ key: 'name', title: t('cli.colCity') }, { key: 'county', title: t('cli.colCounty') }, { key: 'when', title: t('cli.colNext') }, { key: 'rel', title: '' }, { key: 'speak', title: t('cli.colPublicComment') }, { key: 'youth', title: t('cli.colYouth') }, { key: 'id', title: t('cli.colId') }]),
          '',
          c.dim(t('cli.tip', { cmd: CMD })),
        ].join('\n'),
      );
      return 0;
    }

    case 'city': {
      const city = requireCity(cities, args.join(' ') || text(flags.city), io);
      if (!city) return 1;
      const upcoming = expandCityMeetings(city, today, addDays(today, 60));
      emit({ city, upcoming }, () => renderCity(city, upcoming, today));
      return 0;
    }

    case 'speak': {
      const city = requireCity(cities, args.join(' ') || text(flags.city), io);
      if (!city) return 1;
      const next = nextMeetingFor(city, today, { publicCommentOnly: true });
      emit({ cityId: city.cityId, publicComment: city.publicComment, nextSpeakableMeeting: next }, () => renderSpeak(city, next, today));
      return 0;
    }

    case 'meetings': {
      const days = Number(flags.days) || 30;
      let list = upcomingMeetings(cities, { from: today, days, includeCancelled: !!flags.all });
      if (text(flags.city)) {
        const city = requireCity(cities, flags.city, io);
        if (!city) return 1;
        list = list.filter((m) => m.cityId === city.cityId);
      }
      if (flags.evening) list = list.filter((m) => m.isEvening);
      if (flags.speak) list = list.filter((m) => m.openToPublicComment);
      if (text(flags.topic)) list = list.filter((m) => m.agendaItems.some((a) => a.topics.includes(flags.topic)));
      emit({ from: today, days, meetings: list }, () => [heading(t('cli.meetingsHeading', { days, n: list.length })), meetingsTable(list, today)].join('\n'));
      return 0;
    }

    case 'agenda': {
      let items = [];
      for (const city of cities) for (const a of city.agendaItems || []) items.push({ ...a, cityId: city.cityId, cityName: city.name });
      if (text(flags.city)) {
        const city = requireCity(cities, flags.city, io);
        if (!city) return 1;
        items = items.filter((a) => a.cityId === city.cityId);
      }
      if (text(flags.topic)) items = items.filter((a) => a.topics.includes(flags.topic));
      items = items.filter((a) => !a.meetingDate || a.meetingDate >= today).sort((a, b) => String(a.meetingDate || '9').localeCompare(String(b.meetingDate || '9')));
      emit({ items }, () =>
        [heading(t('cli.agendaHeading', { n: items.length })), ...items.slice(0, 40).map((a) => `${c.bold(a.cityName)} ${c.gray(a.meetingDate ? formatDate(a.meetingDate) : t('cli.dateTbd'))}  ${a.topics.map((id) => c.cyan(getTopic(id).short)).join(', ')}\n${wrapText(a.title, 78, 2)}${a.summary ? `\n${c.dim(wrapText(a.summary, 78, 2))}` : ''}${a.url ? `\n  ${c.gray(a.url)}` : ''}\n`)].join('\n'),
      );
      return 0;
    }

    case 'youth': {
      let programs = matchYouthPrograms(cities, saved.prefs);
      if (text(flags.city)) {
        const city = requireCity(cities, flags.city, io);
        if (!city) return 1;
        programs = programs.filter((p) => p.cityId === city.cityId);
      }
      emit({ programs }, () =>
        [heading(t('cli.youthHeading', { n: programs.length })), ...programs.map((p) => `${c.bold(p.cityName)}: ${p.name}${p.ages ? c.gray(` (${p.ages})`) : ''}${p.description ? `\n${wrapText(p.description, 78, 2)}` : ''}${p.applyWindow ? `\n  ${c.yellow(t('cli.applyLabel'))} ${p.applyWindow}` : ''}${p.url ? `\n  ${c.gray(p.url)}` : ''}\n`)].join('\n'),
      );
      return 0;
    }

    case 'prefs': {
      emit({ prefs: saved.prefs, saved: saved.saved, path: PREFS_PATH }, () => [heading(t('cli.prefsHeading')), saved.saved ? c.dim(PREFS_PATH) : c.yellow(t('cli.nothingSaved', { cmd: CMD })), renderPrefs(saved.prefs, cities)].join('\n'));
      return 0;
    }

    case 'setup': {
      await runWizard(cities, saved.prefs, lang);
      return 0;
    }

    case 'match': {
      const prefs = await prefsFromFlags(flags, cities, saved.prefs, io);
      if (!prefs) return 1;
      const plan = buildPlan(cities, prefs, { today, days: Number(flags.days) || 45 });
      emit(plan, () => renderPlan(plan, today));
      return 0;
    }

    case 'map': {
      let you = null;
      if (text(flags.near)) you = await resolveLocation(flags.near, cities, io);
      else you = saved.prefs.location;
      emit({ note: t('cli.mapUseWithoutJson') }, () => [heading(t('cli.mapHeading', { region: BRAND.region })), renderAsciiMap(cities, { today, you })].join('\n'));
      return 0;
    }

    case 'stats': {
      const s = computeStats(cities, { today, days: Number(flags.days) || 30 });
      emit(s, () => renderStats(s));
      return 0;
    }

    case 'news': {
      const news = loadNews();
      let result;
      try {
        result = await fetchNews(news, { topic: text(flags.topic), city: text(flags.city), limit: Number(flags.limit) || 15 });
      } catch (e) {
        io.error(c.red(t('cli.couldNotFetchNews', { error: e.message })));
        return 1;
      }
      emit(result, () =>
        [
          heading(t('cli.newsHeading', { topic: text(flags.topic) ? t('cli.newsOn', { topic: getTopic(flags.topic).short }) : '', city: text(flags.city) ? t('cli.newsMentioning', { city: flags.city }) : '' })),
          c.dim(t('cli.feedsResponded', { n: result.fetchedFeeds, total: result.totalFeeds })),
          ...result.items.map((i) => `${c.bold(i.title)}\n  ${c.gray(`${i.sourceName}${i.publishedAt ? ` (${i.publishedAt.slice(0, 10)})` : ''}`)}  ${i.topics.map((id) => c.cyan(getTopic(id).short)).join(', ')}\n  ${c.gray(i.link)}\n`),
          result.items.length ? '' : c.yellow(t('cli.noStories')),
          result.topicLinks.length ? heading(t('cli.whereToRead')) : '',
          ...result.topicLinks.slice(0, 12).map((l) => bullet(`${l.label} ${c.gray(`(${l.sourceName})`)}\n    ${c.gray(l.url)}`)),
        ].join('\n'),
      );
      return 0;
    }

    case 'explain': {
      const title = args.join(' ') || text(flags.title);
      if (!title) {
        io.error(c.red(t('cli.explainUsage', { cmd: CMD })));
        return 1;
      }
      const city = text(flags.city) ? findCity(cities, flags.city) : null;
      let result;
      try {
        result = await explainAgendaItem({ title, summary: text(flags.summary), city });
      } catch (e) {
        io.error(c.red(t('cli.couldNotExplain', { error: e.message })));
        return 1;
      }
      emit(result, () => [heading(title), c.dim(result.source === 'claude' ? t('cli.explainedBy', { model: result.model }) : t('cli.templateExplanation', { reason: result.fallbackReason ? t('cli.aiUnavailable', { reason: result.fallbackReason }) : t('cli.setKeyHint') })), '', wrapText(result.text.replace(/\n\n/g, '\n \n'), 78)].join('\n'));
      return 0;
    }

    case 'comment': {
      const city = text(flags.city) ? findCity(cities, flags.city) : null;
      const firstTime = city && city.meetings && city.meetings[0] ? city.meetings[0].recurrence.time : '18:00';
      const input = { name: text(flags.name), school: text(flags.school), cityName: city ? city.name : text(flags.city), topicId: text(flags.topic), itemTitle: text(flags.item), position: text(flags.position), story: text(flags.story), ask: text(flags.ask), timeOfDay: timeOfDayFor(firstTime) };
      const draft = buildComment(input);
      const seconds = estimateSpeakingSeconds(draft);
      emit({ draft, seconds }, () => [heading(t('cli.draftHeading')), draft, '', c.dim(t('cli.spokenSeconds', { n: seconds })), city && city.publicComment ? c.dim(t('cli.howToSignUp', { city: city.name, how: city.publicComment.howToRegister })) : ''].join('\n'));
      return 0;
    }

    case 'learn': {
      const which = args[0] || 'all';
      const parts = [];
      if (which === 'all' || which === 'glossary') parts.push(heading(t('cli.glossaryHeading')), ...glossary().map((g) => `${c.bold(g.term)}\n${wrapText(g.definition, 78, 2)}`));
      if (which === 'all' || which === 'checklist') parts.push(heading(t('cli.checklistHeading')), ...checklist().map((s, i) => `${c.cyan(String(i + 1).padStart(2))}. ${s}`));
      if (which === 'all' || which === 'tips') parts.push(heading(t('cli.tipsHeading')), ...speakingTips().map((s) => bullet(s)));
      emit({ glossary: glossary(), checklist: checklist(), tips: speakingTips() }, () => parts.join('\n'));
      return 0;
    }

    case 'demo': {
      await demo(cities, today, lang, out);
      return 0;
    }

    default:
      io.error(c.red(t('cli.unknownCommand', { cmd })));
      out(help());
      return 1;
  }
}

function help() {
  const lines = [heading(`${BRAND.name}: ${BRAND.tagline}`), wrapText(BRAND.shortDescription, 78), '', c.bold(t('cli.usage')), `  ${CMD} <command> [options]`, '', c.bold(t('cli.commandsHeading'))];
  for (const name of COMMAND_NAMES) lines.push(`  ${c.cyan(name.padEnd(9))} ${t(`cli.commands.${name}`, { cmd: CMD })}`);
  lines.push('', c.bold(t('cli.globalOptions')), `  ${c.cyan('--json')}       ${t('cli.jsonOpt')}`, `  ${c.cyan('--today')}      ${t('cli.todayOpt')}`, `  ${c.cyan('--lang')}       ${t('cli.langOpt')}`, `  ${c.cyan('--no-color')}   ${t('cli.noColorOpt')}`, '', c.dim(BRAND.nonpartisanNote));
  return lines.join('\n');
}

function requireCity(cities, query, io) {
  if (!query) {
    io.error(c.red(t('cli.whichCity', { cmd: CMD })));
    return null;
  }
  const city = findCity(cities, query);
  if (!city) io.error(c.red(t('cli.noCity', { query, cmd: CMD })));
  return city;
}

async function resolveLocation(query, cities, io) {
  const city = findCity(cities, query);
  if (city && city.name.toLowerCase() === String(query).toLowerCase()) return cityPoint(city);
  try {
    const g = await geocode(query, cities);
    if (g) return { lat: g.lat, lng: g.lng, label: g.label };
    io.error(c.yellow(t('cli.couldNotPlace', { query })));
  } catch (e) {
    io.error(c.yellow(t('cli.geocoderUnreachable', { error: e.message })));
  }
  return city ? cityPoint(city) : null;
}

async function prefsFromFlags(flags, cities, savedPrefs, io) {
  const p = { ...savedPrefs };
  if (text(flags.interests)) p.interests = flags.interests.split(',').map((s) => s.trim()).filter(Boolean);
  if (text(flags.city)) {
    const city = requireCity(cities, flags.city, io);
    if (!city) return null;
    p.homeCityId = city.cityId;
    if (!text(flags.near) && !savedPrefs.location) p.location = cityPoint(city);
  }
  if (text(flags.near)) {
    const loc = await resolveLocation(flags.near, cities, io);
    if (loc) {
      p.location = { lat: loc.lat, lng: loc.lng };
      p.locationLabel = loc.label || flags.near;
    }
  }
  if (flags.evening || flags.daytime || flags.weekends) p.availability = { evenings: !!flags.evening, daytime: !!flags.daytime, weekends: !!flags.weekends };
  if (flags.speak) p.canSpeakOnly = true;
  if (flags.miles) p.maxMiles = Number(flags.miles);
  return p;
}

function meetingsTable(list, today) {
  return table(
    list.map((m) => ({
      when: `${formatDate(m.date)} ${formatTime(m.time)}`,
      rel: c.gray(relativeDays(m.date, today)),
      city: c.bold(m.cityName),
      what: m.label,
      flags: [m.isEvening ? c.green(t('cli.evening')) : c.dim(t('cli.daytime')), m.openToPublicComment ? t('cli.speak') : c.dim(t('cli.watchOnly')), m.status !== 'scheduled' ? c.yellow(m.status) : '', m.agendaItems.length ? c.cyan(t('cli.itemsTag', { n: m.agendaItems.length })) : ''].filter(Boolean).join(' '),
    })),
    [{ key: 'when', title: t('cli.colWhen') }, { key: 'rel', title: '' }, { key: 'city', title: t('cli.colCity') }, { key: 'what', title: t('cli.colMeeting'), width: 34 }, { key: 'flags', title: t('cli.colNotes') }],
  );
}

function renderCity(city, upcoming, today) {
  const lines = [heading(t('cli.cityHeading', { city: city.name })), label(t('cli.county'), city.county), label(t('cli.cityHall'), `${city.cityHall.name ? `${city.cityHall.name}, ` : ''}${city.cityHall.address}`), label(t('cli.website'), c.gray(city.website))];
  if (city.council && (city.council.structure || city.council.size)) lines.push(label(t('cli.council'), `${city.council.size ? t('cli.membersCount', { n: city.council.size }) : ''}${city.council.structure || ''}${city.council.mayorName ? t('cli.mayor', { name: city.council.mayorName }) : ''}`));
  if (city.council && city.council.findMyDistrictUrl) lines.push(label(t('cli.yourDistrict'), c.gray(city.council.findMyDistrictUrl)));
  lines.push('', c.bold(t('cli.schedule')));
  for (const m of city.meetings) lines.push(bullet(`${m.label}: ${describeRecurrence(m.recurrence)}${m.openToPublicComment === false ? c.dim(t('cli.noPublicComment')) : ''}${m.location ? `\n    ${c.gray(m.location)}` : ''}`));
  if (city.agendaPortal && city.agendaPortal.url) lines.push(label(t('cli.agendasLabel'), c.gray(city.agendaPortal.url)));
  if (city.liveStream && city.liveStream.url) lines.push(label(t('cli.watchLive'), c.gray(city.liveStream.url)));
  lines.push('', c.bold(t('cli.next60')), meetingsTable(upcoming.filter((m) => m.status !== 'cancelled'), today));
  const cancelled = upcoming.filter((m) => m.status === 'cancelled');
  if (cancelled.length) lines.push(c.dim(t('cli.cancelledList', { list: cancelled.map((m) => `${formatDate(m.date)}${m.note ? ` (${m.note})` : ''}`).join(', ') })));
  lines.push('', c.bold(t('cli.speakingUp')), wrapText(city.publicComment.summary, 78, 2));
  if ((city.youthPrograms || []).length) {
    lines.push('', c.bold(t('cli.youthProgramsHeading')));
    for (const p of city.youthPrograms) lines.push(bullet(`${p.name}${p.ages ? c.gray(` (${p.ages})`) : ''}${p.url ? `\n    ${c.gray(p.url)}` : ''}`));
  }
  if ((city.agendaItems || []).length) {
    lines.push('', c.bold(t('cli.onTheAgenda', { n: city.agendaItems.length })));
    for (const a of city.agendaItems.slice(0, 8)) lines.push(bullet(`${a.title} ${a.topics.map((id) => c.cyan(getTopic(id).short)).join(', ')}${a.meetingDate ? c.gray(` (${formatDate(a.meetingDate)})`) : ''}`));
  }
  lines.push('', c.dim(t('cli.dataConfidence', { level: city.confidence, verified: city.lastVerified ? t('cli.verifiedOn', { date: city.lastVerified }) : '' })));
  return lines.join('\n');
}

function renderSpeak(city, next, today) {
  const pc = city.publicComment || {};
  const lines = [heading(t('cli.speakHeading', { city: city.name })), wrapText(pc.summary || '', 78), '', c.bold(t('cli.steps')), wrapText(pc.howToRegister || '', 78, 2)];
  if (pc.registrationUrl) lines.push(label(t('cli.signUp'), c.gray(pc.registrationUrl)));
  if (pc.deadline) lines.push(label(t('cli.deadline'), pc.deadline));
  if (pc.timeLimitMinutes) lines.push(label(t('cli.timeLimit'), `${pc.timeLimitMinutes} min`));
  lines.push(label(t('cli.remote'), pc.virtualAllowed === true ? c.green(t('cli.remoteYes')) : pc.virtualAllowed === false ? t('cli.remoteNo') : c.dim(t('cli.remoteUnknown'))));
  if (pc.writtenCommentMethod) lines.push(label(t('cli.written'), pc.writtenCommentMethod));
  if (pc.notes) lines.push('', c.dim(wrapText(pc.notes, 78)));
  lines.push('', c.bold(t('cli.nextChance')));
  lines.push(next ? bullet(`${formatDate(next.date, { withYear: true })}, ${formatTime(next.time)} (${relativeDays(next.date, today).toLowerCase()}): ${next.label}\n    ${c.gray(next.location)}`) : c.dim(t('cli.noSpeakMeeting')));
  lines.push('', c.bold(t('cli.beforeYouGo')), ...speakingTips().slice(0, 3).map((tip) => bullet(tip)));
  lines.push('', c.dim(t('cli.draftHint', { cmd: CMD, city: city.name })));
  return lines.join('\n');
}

function renderPrefs(prefs, cities) {
  const city = prefs.homeCityId ? findCity(cities, prefs.homeCityId) : null;
  return [
    label(t('cli.interests'), prefs.interests.length ? prefs.interests.map((id) => getTopic(id).label).join(', ') : c.dim(t('cli.noneYet'))),
    label(t('cli.available'), Object.entries(prefs.availability).filter(([, v]) => v).map(([k]) => k).join(', ') || c.dim(t('cli.notSet'))),
    label(t('cli.homeCity'), city ? city.name : c.dim(t('cli.notSet'))),
    label(t('cli.location'), prefs.location ? `${prefs.locationLabel || ''} (${prefs.location.lat.toFixed(3)}, ${prefs.location.lng.toFixed(3)})` : c.dim(t('cli.notSet'))),
    label(t('cli.maxDistance'), t('cli.milesValue', { n: prefs.maxMiles })),
    label(t('cli.speakOnly'), prefs.canSpeakOnly ? t('cli.yes') : t('cli.no')),
  ].join('\n');
}

function renderPlan(plan, today) {
  const lines = [heading(t('cli.matchesHeading')), wrapText(plan.summary, 78), ''];
  if (!plan.prefs.interests.length) lines.push(c.yellow(t('cli.matchTip', { cmd: CMD })), '');
  plan.meetings.forEach((m, i) => {
    const pos = m.reasons.filter((r) => r.points > 0).map((r) => c.green(r.text));
    const neg = m.reasons.filter((r) => r.points < 0).map((r) => c.yellow(r.text));
    lines.push(`${c.bold(String(i + 1).padStart(2))}. ${c.bold(m.cityName)}: ${m.label}`);
    lines.push(`    ${formatDate(m.date, { withYear: true })}, ${formatTime(m.time)} ${c.gray(`(${relativeDays(m.date, today).toLowerCase()})`)}${m.distanceMiles != null ? c.gray(`, ${milesText(m.distanceMiles)}`) : ''}`);
    lines.push(`    ${c.gray(m.location)}`);
    if (pos.length) lines.push(`    ${pos.join(c.gray(' | '))}`);
    if (neg.length) lines.push(`    ${neg.join(c.gray(' | '))}`);
    for (const a of m.matchedItems.slice(0, 3)) lines.push(`    ${c.cyan('>')} ${a.title}`);
    lines.push('');
  });
  if (plan.agendaItems.length) {
    lines.push(c.bold(t('cli.agendaItemsOnTopics')));
    for (const a of plan.agendaItems.slice(0, 8)) lines.push(bullet(`${c.bold(a.cityName)}${a.meetingDate ? c.gray(` (${formatDate(a.meetingDate)})`) : ''}: ${a.title} ${a.matchedTopics.map((id) => c.cyan(getTopic(id).short)).join(', ')}`));
    lines.push('');
  }
  if (plan.youthPrograms.length) {
    lines.push(c.bold(t('cli.youthNearYou')));
    for (const p of plan.youthPrograms.slice(0, 5)) lines.push(bullet(`${c.bold(p.cityName)}: ${p.name}${p.distanceMiles != null ? c.gray(` (${milesText(p.distanceMiles)})`) : ''}`));
    lines.push('');
  }
  lines.push(c.dim(t('cli.nextSpeak', { cmd: CMD })));
  return lines.join('\n');
}

function renderStats(s) {
  const lines = [heading(t('cli.statsHeading', { region: BRAND.region, days: s.windowDays }))];
  lines.push(label(t('cli.cities'), String(s.totals.cities)), label(t('cli.meetings'), String(s.totals.meetings)), label(t('cli.after5'), `${Math.round(s.totals.eveningShare * 100)}%`), label(t('cli.openToSpeak'), `${Math.round(s.totals.speakableShare * 100)}%`), label(t('cli.youthProgramsLabel'), t('cli.citiesCount', { n: s.totals.citiesWithYouthPrograms })), label(t('cli.remoteComment'), t('cli.citiesCount', { n: s.totals.citiesWithVirtualComment })));
  lines.push('', c.bold(t('cli.byWeekday')));
  const days = weekdayShortNames();
  const byDay = s.byWeekdayHour.map((row) => row.reduce((a, b) => a + b, 0));
  const max = Math.max(...byDay, 1);
  byDay.forEach((n, i) => lines.push(`  ${days[i].padEnd(4)} ${bar(n, max)} ${n}`));
  lines.push('', c.bold(t('cli.startTimes')));
  const byHour = Array(24).fill(0);
  s.byWeekdayHour.forEach((row) => row.forEach((n, h) => (byHour[h] += n)));
  const hmax = Math.max(...byHour, 1);
  byHour.forEach((n, h) => {
    if (n) lines.push(`  ${formatTime(`${String(h).padStart(2, '0')}:00`).padStart(8)}  ${bar(n, hmax)} ${n}`);
  });
  lines.push('', c.bold(t('cli.studentFriendly')));
  for (const city of s.perCity.slice(0, 10)) lines.push(`  ${city.name.padEnd(22)} ${bar(city.evening, Math.max(...s.perCity.map((x) => x.evening), 1), 16)} ${city.evening}${city.virtualComment ? c.green(t('cli.remoteTag')) : ''}${city.youthPrograms ? c.cyan(t('cli.youthTag')) : ''}`);
  if (s.topicCounts.length) {
    lines.push('', c.bold(t('cli.topicsOnAgendas')));
    const tmax = s.topicCounts[0].count;
    for (const x of s.topicCounts.slice(0, 10)) lines.push(`  ${getTopic(x.topicId).label.padEnd(30)} ${bar(x.count, tmax, 16)} ${x.count}`);
  }
  return lines.join('\n');
}

async function demo(cities, today, lang, out) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const step = async (title, argv) => {
    out(`\n${c.bgBlue(c.bold(` ${title} `))} ${c.gray(`$ ${CMD} ${argv.join(' ')}`)}`);
    await sleep(250);
    await run([...argv, '--today', today, '--lang', lang]);
  };
  out(heading(t('cli.demoHeading', { app: BRAND.name })));
  out(wrapText(`${BRAND.shortDescription} ${BRAND.nonpartisanNote}`, 78));
  await step(t('cli.demo1'), ['cities']);
  const plano = findCity(cities, 'plano') || cities[0];
  await step(t('cli.demo2'), ['match', '--interests', 'housing,transit,parks-recreation', '--city', plano.name, '--evening', '--weekends']);
  await step(t('cli.demo3'), ['speak', plano.name]);
  await step(t('cli.demo4'), ['map', '--near', plano.name]);
  await step(t('cli.demo5'), ['comment', '--name', 'Jordan', '--school', t('cli.demoSchool', { city: plano.name }), '--city', plano.name, '--topic', 'parks-recreation', '--ask', t('cli.demoAsk')]);
  out(`\n${c.green(t('cli.demoDone'))} ${t('cli.demoSetup', { cmd: c.cyan(`${CMD} setup`) })}`);
}

function serve(flags) {
  const env = { ...process.env };
  if (flags.port) env.PORT = String(flags.port);
  const child = spawn(process.execPath, [path.join(REPO_ROOT, 'packages', 'server', 'src', 'index.js')], { stdio: 'inherit', env });
  return new Promise((resolve) => child.on('exit', (code) => resolve(code || 0)));
}

export { COMMAND_NAMES, here, aiAvailable, tList };
