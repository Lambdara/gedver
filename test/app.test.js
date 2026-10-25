const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Small DOM adapter exercises the app's event handlers without a browser dependency.
class Element {
  constructor() {
    this.children = [];
    this.listeners = {};
    this.attributes = {};
    this.style = {};
    this.value = '';
    this.checked = true;
    this.classList = { add() {}, toggle() {} };
  }
  set innerHTML(value) { this.children = []; this.html = value; }
  get innerHTML() { return this.html; }
  append(...children) { this.children.push(...children); }
  getAttribute(key) { return this.attributes[key]; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  dispatch(type, extra = {}) { this.listeners[type]?.({ target: this, preventDefault() {}, ...extra }); }
  getBoundingClientRect() { return { width: 800, height: 600 }; }
}
const nodes = new Map();
const node = (id) => {
  if (!nodes.has(id)) nodes.set(id, new Element());
  return nodes.get(id);
};
const stored = { 'gedver.locations.v1': JSON.stringify({ Tolbert: { lat: 53.16, lng: 6.36 }, Amsterdam: { lat: 52.37, lng: 4.9 } }) };
// Include static translation targets from the real template.
const staticNodes = [...fs.readFileSync(require.resolve('../src/index.template.html'), 'utf8')
  .matchAll(/<[^>]+data-i18n[^>]*>/g)].map(([tag]) => {
    const id = tag.match(/\bid="([^"]+)"/);
    const element = id ? node(id[1]) : new Element();
    for (const [, key, value] of tag.matchAll(/([\w-]+)="([^"]*)"/g)) element.setAttribute(key, value);
    return element;
  });
const context = {
  document: { documentElement: {}, getElementById: node, createElement: () => new Element(), createElementNS: () => new Element(), querySelectorAll: (selector) => selector.startsWith("[data-i18n") ? staticNodes.filter((element) => element.getAttribute(selector.slice(1, -1))) : [] },
  localStorage: { getItem: (key) => stored[key], setItem: (key, value) => { stored[key] = value; } },
  FileReader: class { readAsText(file) { this.result = file.text; this.onload(); } },
  Option: class extends Element { constructor(text, value) { super(); this.textContent = text; this.value = value; } },
};
context.window = { GedverCore: require('../src/gedver-core'), addEventListener() {} };
vm.runInNewContext(fs.readFileSync(require.resolve('../src/app.js'), 'utf8'), context);
node('gedcomFile').files = [{ name: 'fixture.ged', text: `0 @I1@ INDI
1 NAME Hendrik/Hindrik /van der Molen/
1 BIRT
2 DATE 1793
2 PLAC Tolbert
1 BAPM
2 DATE 1794
2 PLAC Tolbert
1 DEAT
2 DATE 1870
2 PLAC Amsterdam` }];
node('gedcomFile').dispatch('change');
assert.equal(node('mappedCount').textContent, '3', 'saved coordinates load successfully');
const marker = (place) => node('markerLayer').children.find((m) => m.attributes['aria-label'].startsWith(place + ','));
marker('Tolbert').dispatch('click');
assert.equal(node('selectedPlaceTitle').textContent, 'Tolbert');
assert.equal(node('eventList').children.length, 1, 'person is listed once');
const facts = node('eventList').children[0].children.slice(2);
assert.equal(facts.length, 3, 'all facts are shown');
assert.match(facts[0].className, /is-local/);
assert.match(facts[2].className, /is-elsewhere/);
assert.equal(facts[0].textContent, "Birth · 1793 · Tolbert");
assert.match(facts[1].className, /is-local/);
marker('Amsterdam').dispatch('mouseenter');
assert.equal(node('selectedPlaceTitle').textContent, 'Tolbert', 'hover preserves selected place');
const form = node('selectedCoordinates').children[0];
assert.equal(form.children[0].children[0].value, 53.16);
form.children[0].children[0].value = '53.17';
form.dispatch('submit');
assert.equal(JSON.parse(stored['gedver.locations.v1']).Tolbert.lat, 53.17);
assert.equal(node('selectedPlaceTitle').textContent, 'Tolbert');
node('locationFile').files = [{ name: 'coordinates.json', text: JSON.stringify({ Tolbert: { lat: 53.18, lng: 6.37 } }) }];
node('locationFile').dispatch('change');
assert.equal(JSON.parse(stored['gedver.locations.v1']).Tolbert.lat, 53.18, 'coordinate import still works');
marker('Amsterdam').dispatch('keydown', { key: 'Enter' });
assert.equal(node('selectedPlaceTitle').textContent, 'Amsterdam');
console.log('ok - app selection, grouped facts, saved coordinates, submit and import');

node('locationFile').files = [{ name: 'aliases.json', text: JSON.stringify({
  Tolbert: { lat: 53.18, lng: 6.37 },
  'Old Tolbert': { lat: 53.18, lng: 6.37 },
  'Historic Tolbert': { lat: '53.180', lng: '6.370' },
}) }];
node('locationFile').dispatch('change');
node('gedcomFile').files = [{ name: 'aliases.ged', text: `0 @I1@ INDI
1 NAME First /Person/
1 BIRT
2 DATE 1793
2 PLAC Old Tolbert
1 BAPM
2 DATE 1794
2 PLAC Historic Tolbert
1 DEAT
2 DATE 1870
2 PLAC Tolbert` }];
node('gedcomFile').dispatch('change');
assert.equal(node('markerLayer').children.length, 1, 'identical coordinates produce one marker');
marker('Historic Tolbert/Old Tolbert/Tolbert').dispatch('click');
assert.equal(node('selectedPlaceTitle').textContent, 'Historic Tolbert/Old Tolbert/Tolbert');
assert.equal(node('selectedPlaceMeta').textContent, '3 events');
assert.equal(node('eventList').children.length, 1, 'aliases share a single person card');
const aliasFacts = node('eventList').children[0].children.slice(2);
assert.deepEqual(aliasFacts.map((fact) => fact.textContent), ['Birth · 1793 · Old Tolbert', 'Baptism · 1794 · Historic Tolbert', 'Death · 1870 · Tolbert']);
assert.ok(aliasFacts.every((fact) => fact.className.includes('is-local')), 'all aliases count as local');
const aliasForm = node('selectedCoordinates').children[0];
aliasForm.children[0].children[0].value = '53.18001';
aliasForm.dispatch('submit');
const updated = JSON.parse(stored['gedver.locations.v1']);
for (const name of ['Tolbert', 'Old Tolbert', 'Historic Tolbert']) assert.equal(updated[name].lat, 53.18001);
assert.equal(updated['Historic Tolbert/Old Tolbert/Tolbert'], undefined, 'combined title is never stored as a place');
assert.equal(node('markerLayer').children.length, 1);
node('filterOther').checked = false;
node('filterOther').dispatch('change');
assert.equal(node('selectedPlaceTitle').textContent, 'Old Tolbert/Tolbert', 'selection survives an alias being filtered out');
assert.ok(node('eventList').children[0].children.slice(2).every((fact) => fact.className.includes('is-local')), 'filtered aliases remain local in the full fact list');
console.log('ok - merged location marker, title, original facts, coordinate edits and selection');

node('ancestryOnly').checked = false;
node('ancestryOnly').dispatch('change');
node('filterOther').checked = true;
node('filterOther').dispatch('change');
node('gedcomFile').files = [{ name: 'relationships.ged', text: `0 @I1@ INDI
1 NAME First /Person/
1 BIRT
2 DATE 1900
2 PLAC Amsterdam
1 OCCU Molenmaker
1 OCCU bakker
2 DATE FROM BEF 13 JAN 1890 TO AFT 29 APR 1898
2 PLAC Amsterdam
2 NOTE Een opmerking
1 EVEN
2 TYPE Uitstrooien
2 DATE 1980
2 PLAC Amsterdam
1 EVEN
2 TYPE Ondertrouw
1 EVEN
2 TYPE Handlichting
1 EVEN
2 TYPE Crematie
1 EVEN
2 TYPE Custom description
0 @I2@ INDI
1 NAME Second /Person/
1 BIRT
2 DATE 1910
2 PLAC Amsterdam
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 EVEN
2 TYPE MYHERITAGE:REL_PARTNERS
1 DIV
2 DATE 1950
2 PLAC Amsterdam` }];
node('gedcomFile').dispatch('change');
marker('Amsterdam').dispatch('click');
const firstPersonFacts = () => node('eventList').children.find((row) => row.children[0].textContent === 'First PERSON').children.slice(2);
assert.equal(node('eventList').children[0].children[0].textContent, 'Second PERSON', 'newest birthday first');
assert.ok(firstPersonFacts().some((fact) => fact.textContent === 'Occupation: Molenmaker'));
assert.ok(firstPersonFacts().some((fact) => fact.textContent === 'Partnership · Second PERSON'));
assert.ok(firstPersonFacts().some((fact) => fact.textContent === 'Divorce · 1950 · Amsterdam · Second PERSON'));
assert.ok(firstPersonFacts().some((fact) => fact.textContent === 'Scattering of ashes · 1980 · Amsterdam'));
assert.ok(firstPersonFacts().some((fact) => fact.textContent === 'Marriage banns'));
assert.ok(firstPersonFacts().some((fact) => fact.textContent === 'Emancipation'));
assert.ok(firstPersonFacts().some((fact) => fact.textContent === 'Cremation'));
assert.ok(firstPersonFacts().some((fact) => fact.textContent === 'Custom description'));
assert.ok(firstPersonFacts().every((fact) => !/No date|Place unknown|●/.test(fact.textContent)));
assert.equal(firstPersonFacts()[0].textContent, 'Occupation · 13-01-1890 to 29-04-1898 · Amsterdam · bakker · Een opmerking');
assert.equal(firstPersonFacts()[0].title, 'FROM BEF 13 JAN 1890 TO AFT 29 APR 1898');
node('languageSelect').value = 'nl';
node('languageSelect').dispatch('change');
assert.equal(stored['gedver.language.v1'], 'nl');
assert.equal(context.document.documentElement.lang, 'nl');
assert.equal(node('selectedPlaceTitle').textContent, 'Amsterdam', 'language change preserves selection');
assert.equal(node('exportLocations').textContent, 'Coördinaten exporteren');
assert.equal(node('zoomIn').attributes['aria-label'], 'Inzoomen');
assert.match(node('selectedPlaceMeta').textContent, /feiten$/);
assert.match(node('eventBreakdown').textContent, /Geboorten/);
assert.equal(firstPersonFacts()[0].textContent, 'Beroep · 13-01-1890 tot 29-04-1898 · Amsterdam · bakker · Een opmerking');
assert.ok(firstPersonFacts().some((fact) => fact.textContent === 'Partnerschap · Second PERSON'));
assert.ok(firstPersonFacts().some((fact) => fact.textContent === 'Scheiding · 1950 · Amsterdam · Second PERSON'));
node('languageSelect').value = 'en';
node('languageSelect').dispatch('change');
assert.equal(node('exportLocations').textContent, 'Export coordinates');
assert.ok(firstPersonFacts().some((fact) => fact.textContent === 'Occupation: Molenmaker'));
// Reload the app to verify the saved language is applied at startup.
stored['gedver.language.v1'] = 'nl';
vm.runInNewContext(fs.readFileSync(require.resolve('../src/app.js'), 'utf8'), context);
assert.equal(node('languageSelect').value, 'nl');
assert.equal(node('statusLine').textContent, 'Geen GEDCOM geladen');
assert.equal(node('exportLocations').textContent, 'Coördinaten exporteren');
console.log('ok - chronological facts, compact missing values, relationships, date ranges and persisted language');
