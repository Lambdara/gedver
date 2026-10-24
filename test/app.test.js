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
const context = {
  document: { getElementById: node, createElement: () => new Element(), createElementNS: () => new Element(), querySelectorAll: () => [] },
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
assert.match(facts[0].className, /is-elsewhere/);
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
