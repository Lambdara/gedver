const assert = require("assert").strict;
const Core = require("../src/gedver-core.js");

const GEDCOM = `0 HEAD
1 GEDC
2 VERS 5.5.1
1 SUBM @U1@
0 @U1@ SUBM
1 NAME File Owner
0 @I1@ INDI
1 NAME Child /Example/
1 BIRT
2 DATE 01-01-2000
2 PLAC Childtown
1 FAMC @F1@
0 @I2@ INDI
1 NAME Father /Example/
1 BIRT
2 DATE 02-02-1970
2 PLAC Fatherville
1 DEAT
2 DATE BEF 03 MAR 2020
2 PLAC Fatherville
0 @I3@ INDI
1 NAME Mother /Sample/
1 BIRT
2 DATE ABT 1972
2 PLAC Motherton
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I3@
1 CHIL @I1@
1 MARR
2 DATE BET 04 APR 1998 AND 05 MAY 1999
2 PLAC Parenttown
0 TRLR`;

run("parses individuals, families, names, places, and dates", () => {
  const data = Core.parseGedcom(GEDCOM);
  assert.equal(data.individuals.size, 3);
  assert.equal(data.families.size, 1);
  assert.equal(data.submitters.size, 1);
  assert.equal(data.submitters.get("U1").name, "File Owner");
  assert.equal(data.individuals.get("I3").name.display, "Mother SAMPLE");
  assert.equal(data.individuals.get("I2").death.date.display, "03-03-2020");
  assert.equal(data.families.get("F1").marriage.date.display, "between 04-04-1998 and 05-05-1999");
});

run("formats ranges and supports partial dates", () => {
  const uncertain = Core.parseGedcomDate("BET 2 FEB 1900 AND 4 MAR 1902");
  assert.equal(uncertain.display, "between 02-02-1900 and 04-03-1902");
  assert.equal(uncertain.modifier, "BET");
  assert.equal(uncertain.comparable, Core.parseGedcomDate("2 FEB 1900").comparable);
  assert.equal(Core.parseGedcomDate("BET 1900 AND 1902").display, "between 1900 and 1902");
  assert.equal(Core.parseGedcomDate("FROM 2 FEB 1900 TO 4 MAR 1902").display, "02-02-1900 to 04-03-1902");
  assert.equal(Core.parseGedcomDate("ABT 1900").display, "1900");
  assert.equal(Core.parseGedcomDate("03-04-1729").display, "03-04-1729");
});

run("computes proband ancestry and lineage positions", () => {
  const data = Core.parseGedcom(GEDCOM);
  const ancestry = Core.computeAncestry(data, "I1");
  assert.equal(ancestry.get("I1").depth, 0);
  assert.deepEqual(ancestry.get("I1").relations, ["proband"]);
  assert.equal(ancestry.get("I2").depth, 1);
  assert.equal(ancestry.get("I2").x, 0);
  assert.deepEqual(ancestry.get("I2").relations, ["father"]);
  assert.equal(ancestry.get("I3").x, 1);
  assert.deepEqual(ancestry.get("I3").relations, ["mother"]);
});

run("extracts filtered event groups with coordinates", () => {
  const data = Core.parseGedcom(GEDCOM);
  const { events } = Core.extractEvents(data, {
    birth: true,
    marriage: true,
    death: false,
    ancestryOnly: true,
    probandId: "I1",
  });
  assert.equal(events.length, 4);
  assert.equal(events.find((event) => event.id === "birth:I2").relation, "father");
  assert.equal(events.find((event) => event.id === "marriage:F1").relation, "father + mother");

  const groups = Core.groupEventsByLocation(events, {
    Childtown: { lat: 10, lng: 20 },
    Parenttown: { lat: 11, lng: 21 },
  });
  assert.equal(groups.find((group) => group.place === "Childtown").coordinates.lat, 10);
  assert.equal(groups.find((group) => group.place === "Fatherville").coordinates, null);
});

run("uses usable lineage values when coloring grouped locations", () => {
  const group = {
    events: [
      { date: { comparable: 2000 }, lineageX: null, lineageDepth: null },
      { date: { comparable: 1900 }, lineageX: 0, lineageDepth: 2 },
    ],
  };
  assert.equal(Core.colorValueForGroup(group, "lineageX"), 0);
  assert.equal(Core.colorValueForGroup(group, "lineageDepth"), 2);
  assert.equal(Core.colorValueForGroup(group, "time"), 2000);
});

function run(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

run("preserves slash variants and capitalizes surnames", () => {
  const data = Core.parseGedcom(`0 @I1@ INDI
1 NAME Trijntje Pieters /Burema/Buurma/
0 @I2@ INDI
1 NAME Hendrik/Hindrik /van der Molen/
0 @I3@ INDI
1 NAME Hendrik/Hindrik /Molen/
2 GIVN Hendrik/Hindrik
2 SPFX van der
2 SURN Molen`);
  assert.equal(data.individuals.get("I1").name.display, "Trijntje Pieters BUREMA/BUURMA");
  assert.equal(data.individuals.get("I2").name.display, "Hendrik/Hindrik VAN DER MOLEN");
  assert.equal(data.individuals.get("I3").name.display, "Hendrik/Hindrik VAN DER MOLEN");
});

run("shows known date precision without question marks", () => {
  assert.equal(Core.parseGedcomDate("1793").display, "1793");
  assert.equal(Core.parseGedcomDate("MAR 1793").display, "03-1793");
  assert.equal(Core.parseGedcomDate("").display, "");
});

run("groups people by newest birth and facts chronologically", () => {
  const data = Core.parseGedcom(`0 @I1@ INDI
1 NAME Older /Person/
1 BIRT
2 DATE 1800
2 PLAC Tolbert
1 BAPM
2 DATE 1801
2 PLAC Tolbert
1 DEAT
2 DATE 1880
2 PLAC Tolbert
0 @I2@ INDI
1 NAME Newer /Person/
1 BIRT
2 DATE 1900
2 PLAC Tolbert
1 DEAT
2 DATE 1980
2 PLAC Amsterdam
1 BURI
2 DATE 1981
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 1850
2 PLAC Elsewhere`);
  const all = Core.extractEvents(data, { includeWithoutPlace: true });
  const mapped = Core.extractEvents(data, {});
  const group = Core.groupEventsByLocation(mapped.events, {}).find((g) => g.place === "Tolbert");
  const people = Core.peopleAtLocation(group, all.events, data, all.ancestry);
  assert.equal(people.length, 2);
  assert.deepEqual(people.map((p) => p.id), ["I2", "I1"]);
  assert.deepEqual(people[0].events.map((e) => e.type), ["marriage", "birth", "death", "burial"]);
  assert.equal(people[1].events.filter((e) => e.place === "Tolbert").length, 3);
  assert.equal(mapped.events.some((e) => e.type === "baptism"), true);
  assert.equal(mapped.events.some((e) => e.type === "burial"), false);
});

run("merges exact coordinates while preserving event names and per-person ordering", () => {
  const data = Core.parseGedcom(`0 @I1@ INDI
1 NAME First /Person/
1 BIRT
2 DATE 1800
2 PLAC Old name
1 DEAT
2 DATE 1900
2 PLAC New name
0 @I2@ INDI
1 NAME Second /Person/
1 BIRT
2 DATE 1850
2 PLAC Other name
1 DEAT
2 DATE 2000
2 PLAC Nearby`);
  const { events, ancestry } = Core.extractEvents(data, {});
  const groups = Core.groupEventsByLocation(events, {
    "Old name": { lat: 53, lng: 6 },
    "New name": { lat: "53.0", lng: "6.000" },
    "Other name": { lat: 53, lng: 6 },
    Nearby: { lat: 53.000001, lng: 6 },
  });
  const merged = Core.mergeLocationGroups(groups);
  assert.equal(groups.length, 4, "coordinate editing retains separate original names");
  assert.equal(merged.length, 2, "nearby coordinates remain separate");
  const shared = merged.find((group) => group.events.length === 3);
  assert.equal(shared.place, "New name/Old name/Other name");
  assert.deepEqual(shared.events.map((event) => event.place).sort(), ["New name", "Old name", "Other name"]);
  assert.equal(Core.eventAtLocation(events.find((event) => event.place === "Old name"), shared), true);
  const people = Core.peopleAtLocation(shared, events, data, ancestry);
  assert.deepEqual(people.map((person) => person.id), ["I2", "I1"], "sort by newest birth, regardless of latest local fact");
  assert.equal(people[1].events.length, 2, "person with two aliases appears once");
  assert.equal(Core.mergeLocationGroups(Core.groupEventsByLocation(events, {})).length, 4, "unmapped places stay separate");
});

run("formats qualified date ranges while preserving source and sort value", () => {
  const date = Core.parseGedcomDate("FROM BEF 13 JAN 1890 TO AFT 29 APR 1898");
  assert.equal(date.display, "13-01-1890 to 29-04-1898");
  assert.equal(date.raw, "FROM BEF 13 JAN 1890 TO AFT 29 APR 1898");
  assert.equal(date.comparable, Core.parseGedcomDate("13 JAN 1890").comparable);
  assert.equal(Core.parseGedcomDate("FROM 1890 TO 1898").display, "1890 to 1898");
  assert.equal(Core.parseGedcomDate("an unknown date").display, "an unknown date");
});

run("keeps unknown birthdays and undated facts last with stable ties", () => {
  const data = Core.parseGedcom(`0 @I1@ INDI
1 NAME Unknown /Birthday/
1 OCCU Molenmaker
2 PLAC Tolbert
1 EVEN
2 TYPE A custom fact
2 PLAC Tolbert
0 @I2@ INDI
1 NAME Known /Birthday/
1 BIRT
2 DATE 1900
2 PLAC Tolbert
1 OCCU Baker
2 PLAC Tolbert`);
  const { events, ancestry } = Core.extractEvents(data, { includeWithoutPlace: true });
  const group = Core.groupEventsByLocation(events, {})[0];
  const people = Core.peopleAtLocation(group, events, data, ancestry);
  assert.deepEqual(people.map((person) => person.id), ["I2", "I1"]);
  assert.deepEqual(people[0].events.map((event) => event.type), ["birth", "occupation"]);
  assert.deepEqual(people[1].events.map((event) => event.type), ["occupation", "event"]);
});

run("omits metadata-only facts while retaining facts with partial information", () => {
  const data = Core.parseGedcom(`0 @I1@ INDI
1 NAME Test /Person/
1 BIRT
2 _UID birth-id
2 RIN MH:IF24
1 DEAT
2 _UID death-id
1 BAPM
2 DATE 1900
1 RESI
2 PLAC Heerenveen
1 OCCU Baker
1 EVEN
2 NOTE Recorded without a date
0 @F1@ FAM
1 HUSB @I1@
1 MARR
2 RIN MH:IF26
1 DIV
2 DATE 1920`);
  const { events } = Core.extractEvents(data, { includeWithoutPlace: true });
  assert.deepEqual(events.map((event) => event.type), ["baptism", "residence", "occupation", "event", "divorce"]);
  assert.deepEqual(Core.extractEvents(data, {}).events.map((event) => event.type), ["residence"]);
});

run("shows Siewerd's recorded baptism without empty birth and death placeholders", () => {
  const data = Core.parseGedcom(`0 @I14@ INDI
1 NAME Siewerd /Zijlstra/
1 BIRT
2 _UID birth-id
2 RIN MH:IF24
1 DEAT
2 _UID death-id
2 RIN MH:IF25
1 BAPM
2 DATE 1900
2 PLAC Heerenveen`);
  const { events, ancestry } = Core.extractEvents(data, { includeWithoutPlace: true });
  const group = Core.groupEventsByLocation(events, {}).find((group) => group.place === "Heerenveen");
  const person = Core.peopleAtLocation(group, events, data, ancestry).find((person) => person.id === "I14");
  assert.equal(person.name, "Siewerd ZIJLSTRA");
  assert.ok(person.events.some((event) => event.type === "baptism" && event.dateLabel === "1900"));
  assert.ok(person.events.every((event) => event.type !== "birth" && event.type !== "death"));
});
