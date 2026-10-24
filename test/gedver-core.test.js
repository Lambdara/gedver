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
  assert.equal(data.families.get("F1").marriage.date.display, "04-04-1998");
});

run("uses earliest date from ranges and supports partial dates", () => {
  assert.equal(Core.parseGedcomDate("BET 2 FEB 1900 AND 4 MAR 1902").display, "02-02-1900");
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
