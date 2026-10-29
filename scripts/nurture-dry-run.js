#!/usr/bin/env node
// Show which teaching tips would go to which subscribers on a UK date.
// Does not read the live list and does not send.
//
//   node scripts/nurture-dry-run.js --date 2026-10-29
//   node scripts/nurture-dry-run.js --date 2026-10-29 --fixtures scripts/nurture-fixtures.json

const fs = require('fs');
const path = require('path');
const { planPeople, formatPlan, LIMITS } = require('../netlify/functions/lib/nurture');

function arg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return '';
  return process.argv[index + 1] || '';
}

const date = arg('--date');
if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error('--date must be YYYY-MM-DD');
  process.exit(1);
}

const fixturesArg = arg('--fixtures');
const fixturesPath = fixturesArg
  ? path.resolve(fixturesArg)
  : path.join(__dirname, 'nurture-fixtures.json');

let people;
try {
  people = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
} catch (e) {
  console.error('Could not read fixtures: ' + e.message);
  process.exit(1);
}
if (!Array.isArray(people)) {
  console.error('Fixtures must be a JSON array of subscribers');
  process.exit(1);
}

const today = date || new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

const plan = planPeople(people, today);
const header = [
  formatPlan(plan).replace(/\n$/, ''),
  '',
  'Subscribers loaded from ' + fixturesPath + (fixturesArg ? '.' : ' (sample, not the live list).'),
  'The live job sends at most ' + LIMITS.maxSends + ' of the due rows per run, and at most one tip per person per UK day.',
  'NURTURE_ENABLED defaults to off, so deploying this does not send anything.',
  '',
].join('\n');
process.stdout.write(header);
