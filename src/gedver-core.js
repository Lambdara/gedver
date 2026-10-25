(function gedverCoreModule(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.GedverCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function gedverCoreFactory() {
  "use strict";

  const MONTHS = {
    JAN: 1,
    FEB: 2,
    MAR: 3,
    APR: 4,
    MAY: 5,
    JUN: 6,
    JUL: 7,
    AUG: 8,
    SEP: 9,
    OCT: 10,
    NOV: 11,
    DEC: 12,
  };

  const EVENT_LABELS = {
    birth: "Birth",
    marriage: "Marriage",
    death: "Death",
    baptism: "Baptism",
    christening: "Christening",
    burial: "Burial",
    cremation: "Cremation",
    residence: "Residence",
    divorce: "Divorce",
    engagement: "Engagement",
    confirmation: "Confirmation",
    occupation: "Occupation",
    event: "Event",
    fact: "Fact",
    partnership: "Partnership",
    funeral: "Funeral",
    marriageBanns: "Marriage banns",
    scattering: "Scattering of ashes",
    emancipation: "Emancipation",
  };

  const EVENT_TAGS = { BIRT: "birth", DEAT: "death", BAPM: "baptism", CHR: "christening", CHRA: "christening", BURI: "burial", CREM: "cremation", RESI: "residence", MARR: "marriage", DIV: "divorce", ENGA: "engagement", CONF: "confirmation", OCCU: "occupation", EVEN: "event", FACT: "fact" };

  const FACT_ALIASES = {
    "myheritage:rel_partners": "partnership", partners: "partnership", partnership: "partnership",
    geboorte: "birth", doop: "baptism", huwelijk: "marriage", overlijden: "death",
    beroep: "occupation", begrafenis: "burial", crematie: "cremation", cremation: "cremation",
    ondertrouw: "marriageBanns", "marriage banns": "marriageBanns", uitstrooien: "scattering",
    "scattering of ashes": "scattering", handlichting: "emancipation", emancipation: "emancipation",
    funeral: "funeral", uitvaart: "funeral", verloving: "engagement", scheiding: "divorce",
  };

  function parseFacts(record) {
    return record.children.filter((node) => EVENT_TAGS[node.tag]).map((node, index) => {
      const customLabel = firstChildValue(node, "TYPE");
      const knownType = Object.hasOwn(FACT_ALIASES, customLabel.toLowerCase()) ? FACT_ALIASES[customLabel.toLowerCase()] : "";
      const type = knownType || EVENT_TAGS[node.tag];
      return {
        ...parseEventNode(node), type, index,
        label: knownType ? EVENT_LABELS[type] : customLabel || EVENT_LABELS[type],
      };
    });
  }

  function parseGedcom(text) {
    const records = [];
    const stack = [];
    const lines = String(text || "")
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/);

    for (const rawLine of lines) {
      if (!rawLine.trim()) continue;
      const parsed = parseLine(rawLine);
      if (!parsed) continue;

      const node = {
        level: parsed.level,
        xref: parsed.xref,
        tag: parsed.tag,
        value: parsed.value,
        children: [],
      };

      while (stack.length && stack[stack.length - 1].level >= node.level) {
        stack.pop();
      }

      if (node.level === 0 || stack.length === 0) {
        records.push(node);
      } else {
        stack[stack.length - 1].children.push(node);
      }

      stack.push(node);
    }

    const individuals = new Map();
    const families = new Map();
    const submitters = new Map();

    for (const record of records) {
      if (record.tag === "INDI" && record.xref) {
        const individual = parseIndividualRecord(record);
        individuals.set(individual.id, individual);
      }
      if (record.tag === "FAM" && record.xref) {
        const family = parseFamilyRecord(record);
        families.set(family.id, family);
      }
      if (record.tag === "SUBM" && record.xref) {
        const submitter = parseSubmitterRecord(record);
        submitters.set(submitter.id, submitter);
      }
    }

    const childToFamilies = new Map();
    for (const family of families.values()) {
      for (const childId of family.children) {
        if (!childToFamilies.has(childId)) childToFamilies.set(childId, []);
        childToFamilies.get(childId).push(family.id);
      }
    }

    return { records, individuals, families, submitters, childToFamilies };
  }

  function parseLine(rawLine) {
    const line = rawLine.replace(/\r$/, "");
    const match = line.match(/^(\d+)\s+(?:(@[^@]+@)\s+)?([A-Za-z0-9_]+)(?:\s+(.*))?$/);
    if (!match) return null;
    return {
      level: Number(match[1]),
      xref: match[2] || "",
      tag: match[3].toUpperCase(),
      value: match[4] || "",
    };
  }

  function parseIndividualRecord(record) {
    const id = normalizeXref(record.xref);
    const nameNode = firstChild(record, "NAME");
    const name = parseName(nameNode ? valueWithContinuations(nameNode) : "", nameNode);
    const sex = (firstChildValue(record, "SEX") || "").trim().toUpperCase();
    const familiesAsChild = children(record, "FAMC").map((node) => normalizeXref(valueWithContinuations(node)));
    const familiesAsSpouse = children(record, "FAMS").map((node) => normalizeXref(valueWithContinuations(node)));

    return {
      id,
      name,
      sex,
      familiesAsChild,
      familiesAsSpouse,
      facts: parseFacts(record),
      birth: parseEventNode(firstChild(record, "BIRT")),
      death: parseEventNode(firstChild(record, "DEAT")),
    };
  }

  function parseFamilyRecord(record) {
    const id = normalizeXref(record.xref);
    return {
      id,
      husband: normalizeXref(firstChildValue(record, "HUSB")),
      wife: normalizeXref(firstChildValue(record, "WIFE")),
      children: children(record, "CHIL").map((node) => normalizeXref(valueWithContinuations(node))),
      facts: parseFacts(record),
      marriage: parseEventNode(firstChild(record, "MARR")),
    };
  }

  function parseSubmitterRecord(record) {
    const id = normalizeXref(record.xref);
    const name = valueWithContinuations(firstChild(record, "NAME") || { value: "", children: [] });
    return {
      id,
      name: name.replace(/\s+/g, " ").trim(),
    };
  }

  function parseEventNode(node) {
    if (!node) return null;
    const dateRaw = firstChildValue(node, "DATE");
    const place = normalizePlace(firstChildValue(node, "PLAC"));
    return {
      details: node.value && node.value !== "Y" ? valueWithContinuations(node) : "",
      notes: children(node, "NOTE").map(valueWithContinuations).filter((value) => !/^@.*@$/.test(value)).join("; "),
      dateRaw,
      date: parseGedcomDate(dateRaw),
      place,
    };
  }

  function parseName(rawName, node) {
    const raw = String(rawName || "").trim();
    if (!raw) {
      return {
        raw: "",
        given: "",
        surname: "",
        suffix: "",
        display: "(unnamed)",
      };
    }

    const slashMatch = raw.match(/^(.*?)\s+\/(.*)\/(.*)$/) || raw.match(/^(.*?)\/(.*)\/(.*)$/);
    if (!slashMatch) {
      return {
        raw,
        given: raw.replace(/\s+/g, " ").trim(),
        surname: "",
        suffix: "",
        display: raw.replace(/\//g, "").replace(/\s+/g, " ").trim(),
      };
    }

    const clean = (value) => value.replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ").trim();
    const given = clean((node && firstChildValue(node, "GIVN")) || slashMatch[1]);
    const surname = clean((node && firstChildValue(node, "SURN")) || slashMatch[2]);
    const prefix = clean((node && firstChildValue(node, "SPFX")) || "");
    const fullSurname = prefix && !surname.toLowerCase().startsWith(prefix.toLowerCase() + " ") ? `${prefix} ${surname}` : surname;
    const suffix = clean(slashMatch[3]);
    const display = [given, fullSurname.toLocaleUpperCase(), suffix].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

    return {
      raw,
      given,
      surname,
      suffix,
      display: display || "(unnamed)",
    };
  }

  function firstChild(node, tag) {
    return node.children.find((child) => child.tag === tag) || null;
  }

  function children(node, tag) {
    return node.children.filter((child) => child.tag === tag);
  }

  function firstChildValue(node, tag) {
    const child = firstChild(node, tag);
    return child ? valueWithContinuations(child) : "";
  }

  function valueWithContinuations(node) {
    let value = node.value || "";
    for (const child of node.children) {
      if (child.tag === "CONC") value += child.value || "";
      if (child.tag === "CONT") value += "\n" + (child.value || "");
    }
    return value.trim();
  }

  function normalizeXref(value) {
    return String(value || "").trim().replace(/^@|@$/g, "");
  }

  function normalizePlace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function parseGedcomDate(rawValue) {
    const original = String(rawValue || "").trim();
    if (!original) {
      return emptyDate(original);
    }

    const normalized = original
      .replace(/[,]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();

    let modifier = "";
    let startText = normalized;
    let endText = "";

    const between = normalized.match(/^BET\s+(.+?)\s+AND\s+(.+)$/);
    if (between) {
      modifier = "BET";
      startText = between[1];
      endText = between[2];
    } else {
      const fromTo = normalized.match(/^FROM\s+(.+?)\s+TO\s+(.+)$/);
      if (fromTo) {
        modifier = "FROM";
        startText = fromTo[1];
        endText = fromTo[2];
      } else {
        const from = normalized.match(/^FROM\s+(.+)$/);
        const to = normalized.match(/^TO\s+(.+)$/);
        const qualified = normalized.match(/^(ABT|ABOUT|AFT|AFTER|BEF|BEFORE|CAL|CALCULATED|EST|ESTIMATED|INT|INTERPRETED)\s+(.+)$/);
        if (from) {
          modifier = "FROM";
          startText = from[1];
        } else if (to) {
          modifier = "TO";
          startText = to[1];
        } else if (qualified) {
          modifier = qualified[1];
          startText = qualified[2];
        }
      }
    }

    const stripQualifier = (text) => text.replace(/^(?:BEF|BEFORE|AFT|AFTER|ABT|ABOUT|CAL|CALCULATED|EST|ESTIMATED)\s+/, "");
    const start = parseDatePart(stripQualifier(startText));
    const end = endText ? parseDatePart(stripQualifier(endText)) : null;

    return {
      raw: original,
      modifier,
      start,
      end,
      comparable: start ? dateComparable(start) : null,
      display: start ? [formatDatePart(start), end && formatDatePart(end)].filter(Boolean).join(" to ") : original,
      hasDate: Boolean(start),
    };
  }

  function emptyDate(original) {
    return {
      raw: original,
      modifier: "",
      start: null,
      end: null,
      comparable: null,
      display: "",
      hasDate: false,
    };
  }

  function parseDatePart(text) {
    const value = String(text || "")
      .replace(/[()]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
    if (!value) return null;

    let match = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{3,4})$/);
    if (match) {
      return makeDatePart(Number(match[3]), Number(match[2]), Number(match[1]));
    }

    match = value.match(/^(\d{3,4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (match) {
      return makeDatePart(Number(match[1]), Number(match[2]), Number(match[3]));
    }

    const tokens = value.split(" ");
    if (tokens.length === 3 && /^\d{1,2}$/.test(tokens[0]) && MONTHS[tokens[1]] && /^\d{3,4}$/.test(tokens[2])) {
      return makeDatePart(Number(tokens[2]), MONTHS[tokens[1]], Number(tokens[0]));
    }

    if (tokens.length === 2 && MONTHS[tokens[0]] && /^\d{3,4}$/.test(tokens[1])) {
      return makeDatePart(Number(tokens[1]), MONTHS[tokens[0]], null);
    }

    if (/^\d{3,4}$/.test(value)) {
      return makeDatePart(Number(value), null, null);
    }

    return null;
  }

  function makeDatePart(year, month, day) {
    if (!Number.isFinite(year) || year < 1) return null;
    const safeMonth = month == null ? null : clamp(Math.trunc(month), 1, 12);
    const safeDay = day == null ? null : clamp(Math.trunc(day), 1, 31);
    return {
      year: Math.trunc(year),
      month: safeMonth,
      day: safeDay,
      precision: safeDay ? "day" : safeMonth ? "month" : "year",
    };
  }

  function dateComparable(part) {
    return part.year * 372 + (part.month || 1) * 31 + (part.day || 1);
  }

  function formatDatePart(part) {
    if (part.month == null) return String(part.year).padStart(4, "0");
    if (part.day == null) return `${String(part.month).padStart(2, "0")}-${String(part.year).padStart(4, "0")}`;
    const day = part.day == null ? "??" : String(part.day).padStart(2, "0");
    const month = part.month == null ? "??" : String(part.month).padStart(2, "0");
    return `${day}-${month}-${String(part.year).padStart(4, "0")}`;
  }

  function computeAncestry(data, probandId) {
    const result = new Map();
    const cleanProbandId = normalizeXref(probandId);
    if (!cleanProbandId || !data.individuals.has(cleanProbandId)) {
      return result;
    }

    const queue = [{ id: cleanProbandId, depth: 0, pathIndex: 0, path: [] }];
    const seenStates = new Set();

    while (queue.length) {
      const state = queue.shift();
      const stateKey = `${state.id}|${state.depth}|${state.pathIndex}`;
      if (seenStates.has(stateKey)) continue;
      seenStates.add(stateKey);

      const x = lineageXForPath(state.depth, state.pathIndex);
      const current = result.get(state.id);
      if (!current || state.depth < current.depth) {
        result.set(state.id, { depth: state.depth, positions: [x], relations: [relationLabelForPath(state.path)] });
      } else if (current.depth === state.depth && !current.positions.includes(x)) {
        current.positions.push(x);
      }
      const updated = result.get(state.id);
      const relation = relationLabelForPath(state.path);
      if (updated && state.depth === updated.depth && relation && !updated.relations.includes(relation)) {
        updated.relations.push(relation);
      }

      const parents = getParents(data, state.id);
      if (parents.father) {
        queue.push({ id: parents.father, depth: state.depth + 1, pathIndex: state.pathIndex * 2, path: [...state.path, "father"] });
      }
      if (parents.mother) {
        queue.push({ id: parents.mother, depth: state.depth + 1, pathIndex: state.pathIndex * 2 + 1, path: [...state.path, "mother"] });
      }
    }

    for (const value of result.values()) {
      value.x = average(value.positions);
    }

    return result;
  }

  function relationLabelForPath(path) {
    if (!path || !path.length) return "proband";
    const depth = path.length;
    const first = path[0];
    const last = path[path.length - 1];
    const side = first === "father" ? "paternal" : first === "mother" ? "maternal" : "";
    const gendered = last === "father" ? "father" : last === "mother" ? "mother" : "parent";

    if (depth === 1) return gendered;

    const grandRelation = gendered === "father" ? "grandfather" : gendered === "mother" ? "grandmother" : "grandparent";
    if (depth === 2) return [side, grandRelation].filter(Boolean).join(" ");

    const greatPrefix = Array(depth - 2).fill("great").join("-");
    return [side, `${greatPrefix}-${grandRelation}`].filter(Boolean).join(" ");
  }

  function lineageXForPath(depth, pathIndex) {
    if (depth <= 0) return 0.5;
    const denominator = Math.pow(2, depth) - 1;
    return denominator <= 0 ? 0.5 : pathIndex / denominator;
  }

  function getParents(data, childId) {
    const individual = data.individuals.get(childId);
    const familyIds = new Set(individual ? individual.familiesAsChild : []);
    for (const familyId of data.childToFamilies.get(childId) || []) {
      familyIds.add(familyId);
    }

    for (const familyId of familyIds) {
      const family = data.families.get(familyId);
      if (!family) continue;
      return { father: family.husband, mother: family.wife, familyId };
    }

    return { father: "", mother: "", familyId: "" };
  }

  function extractEvents(data, options) {
    const settings = {
      birth: true,
      marriage: true,
      death: true,
      ancestryOnly: false,
      probandId: "",
      ...options,
    };
    const ancestry = settings.probandId ? computeAncestry(data, settings.probandId) : new Map();
    const useAncestryFilter = Boolean(settings.ancestryOnly && ancestry.size);
    const events = [];
    const eventIds = new Set();

    for (const individual of data.individuals.values()) {
      const included = !useAncestryFilter || ancestry.has(individual.id);
      if (!included) continue;

      for (const fact of individual.facts) {
        if (settings[fact.type] === false) continue;
        if (!settings.includeWithoutPlace && !eventHasPlace(fact)) continue;
        const event = makeIndividualEvent(fact.type, individual, fact, ancestry);
        if (eventIds.has(event.id)) event.id += `:${fact.index}`;
        eventIds.add(event.id);
        event.label = fact.label;
        events.push(event);
      }
    }

    for (const family of data.families.values()) {
      const participantIds = [family.husband, family.wife].filter(Boolean);
      const included = !useAncestryFilter || participantIds.some((id) => ancestry.has(id));
      if (!included) continue;
      for (const fact of family.facts) {
        if (settings[fact.type] === false) continue;
        if (!settings.includeWithoutPlace && !eventHasPlace(fact)) continue;
        const event = makeFamilyEvent(fact.type, family, data, fact, ancestry);
        if (eventIds.has(event.id)) event.id += `:${fact.index}`;
        eventIds.add(event.id);
        event.label = fact.label;
        events.push(event);
      }
    }

    return { events, ancestry };
  }

  function eventHasPlace(event) {
    return Boolean(event && event.place);
  }

  function makeIndividualEvent(type, individual, event, ancestry) {
    const metric = lineageMetric([individual.id], ancestry);
    return {
      id: `${type}:${individual.id}`,
      type,
      label: EVENT_LABELS[type],
      personId: individual.id,
      familyId: "",
      people: [individual.id],
      name: individual.name.display,
      date: event.date,
      dateLabel: event.date.display,
      details: event.details,
      notes: event.notes,
      place: event.place,
      lineageX: metric.x,
      lineageDepth: metric.depth,
      relation: relationForIds([individual.id], ancestry),
    };
  }

  function makeFamilyEvent(type, family, data, event, ancestry) {
    const people = [family.husband, family.wife].filter(Boolean);
    const names = people.map((id) => {
      const individual = data.individuals.get(id);
      return individual && individual.name ? individual.name.display : "(unnamed)";
    });
    const metric = lineageMetric(people, ancestry);
    return {
      id: `${type}:${family.id}`,
      type,
      label: EVENT_LABELS[type],
      personId: "",
      familyId: family.id,
      people,
      name: names.join(" + ") || "(unnamed)",
      date: event.date,
      dateLabel: event.date.display,
      details: event.details,
      notes: event.notes,
      place: event.place,
      lineageX: metric.x,
      lineageDepth: metric.depth,
      relation: relationForIds(people, ancestry),
    };
  }

  function relationForIds(ids, ancestry) {
    const labels = ids
      .map((id) => ancestry.get(id))
      .filter(Boolean)
      .flatMap((metric) => metric.relations || [])
      .filter(Boolean);
    return unique(labels).join(" + ");
  }

  function unique(values) {
    return Array.from(new Set(values));
  }

  function lineageMetric(ids, ancestry) {
    const metrics = ids.map((id) => ancestry.get(id)).filter(Boolean);
    if (!metrics.length) return { x: null, depth: null };
    const newestDepth = Math.min(...metrics.map((metric) => metric.depth));
    const newest = metrics.filter((metric) => metric.depth === newestDepth);
    return {
      depth: newestDepth,
      x: average(newest.map((metric) => metric.x)),
    };
  }

  function groupEventsByLocation(events, locations) {
    const groups = new Map();
    for (const event of events) {
      const place = normalizePlace(event.place);
      if (!place) continue;
      if (!groups.has(place)) {
        groups.set(place, {
          place,
          events: [],
          coordinates: findCoordinates(place, locations),
          colorValue: null,
        });
      }
      groups.get(place).events.push(event);
    }
    return Array.from(groups.values()).sort((a, b) => a.place.localeCompare(b.place));
  }

  function mergeLocationGroups(groups) {
    const merged = new Map();
    for (const group of groups) {
      // Use exact numeric coordinates; nearby places must remain separate.
      const key = group.coordinates
        ? `coordinates:${Number(group.coordinates.lat)},${Number(group.coordinates.lng)}`
        : `place:${group.place}`;
      if (!merged.has(key)) {
        merged.set(key, { ...group, places: [], events: [] });
      }
      const target = merged.get(key);
      target.places.push(group.place);
      target.events.push(...group.events);
    }
    for (const group of merged.values()) {
      group.places.sort((a, b) => a.localeCompare(b));
      group.place = group.places.join("/");
    }
    return [...merged.values()].sort((a, b) => a.place.localeCompare(b.place));
  }

  function eventAtLocation(event, group, locations) {
    if ((group.places || [group.place]).includes(normalizePlace(event.place))) return true;
    // A filtered-out alias can still occur in the person's full fact list.
    const coordinates = locations && findCoordinates(event.place, locations);
    return Boolean(coordinates && group.coordinates &&
      Number(coordinates.lat) === Number(group.coordinates.lat) &&
      Number(coordinates.lng) === Number(group.coordinates.lng));
  }

  function peopleAtLocation(group, allEvents, data, ancestry, locations) {
    const ids = new Set(group.events.flatMap((event) => event.people));
    const byPerson = new Map([...ids].map((id) => [id, []]));
    for (const event of allEvents) {
      for (const id of event.people) {
        if (byPerson.has(id)) byPerson.get(id).push(event);
      }
    }
    const dateValue = (event) => event.date?.comparable ?? Infinity;
    return [...byPerson].map(([id, events]) => ({
      id,
      name: data.individuals.get(id)?.name.display || "(unnamed)",
      relation: relationForIds([id], ancestry),
      events: events.sort((a, b) => dateValue(a) - dateValue(b)),
      birthDate: data.individuals.get(id)?.birth?.date.comparable ?? -Infinity,
    })).sort((a, b) => b.birthDate - a.birthDate || a.name.localeCompare(b.name));
  }

  function findCoordinates(place, locations) {
    const table = locations || {};
    const exact = table[place];
    if (isCoordinate(exact)) return exact;
    const lower = place.toLocaleLowerCase();
    const matchingKey = Object.keys(table).find((key) => key.toLocaleLowerCase() === lower);
    return isCoordinate(table[matchingKey]) ? table[matchingKey] : null;
  }

  function isCoordinate(value) {
    return (
      value &&
      Number.isFinite(Number(value.lat)) &&
      Number.isFinite(Number(value.lng)) &&
      Number(value.lat) >= -90 &&
      Number(value.lat) <= 90 &&
      Number(value.lng) >= -180 &&
      Number(value.lng) <= 180
    );
  }

  function groupRepresentativeEvent(group) {
    const dated = group.events
      .filter((event) => event.date && event.date.comparable != null)
      .sort((a, b) => b.date.comparable - a.date.comparable);
    return dated[0] || group.events[0] || null;
  }

  function colorForGroup(group, mode, context) {
    if (mode === "single") return context.singleColor || "#d11f1f";
    const value = colorValueForGroup(group, mode);
    if (value == null) return interpolatePalette(context.palette, 0.5);

    if (mode === "time") {
      return interpolatePalette(context.palette, normalizeBetween(value, context.minDate, context.maxDate));
    }

    if (mode === "lineageX") {
      return interpolatePalette(context.palette, value);
    }

    if (mode === "lineageDepth") {
      return interpolatePalette(context.palette, normalizeBetween(value, context.minDepth, context.maxDepth));
    }

    return context.singleColor || "#d11f1f";
  }

  function colorValueForGroup(group, mode) {
    if (!group || !Array.isArray(group.events)) return null;
    if (mode === "time") {
      const event = groupRepresentativeEvent(group);
      return event && event.date && Number.isFinite(event.date.comparable) ? event.date.comparable : null;
    }
    if (mode === "lineageX") {
      return average(group.events.map((event) => event.lineageX));
    }
    if (mode === "lineageDepth") {
      return average(group.events.map((event) => event.lineageDepth));
    }
    return null;
  }

  function colorContext(events, singleColor) {
    const datedEvents = events
      .filter((event) => event.date && event.date.comparable != null)
      .sort((a, b) => a.date.comparable - b.date.comparable);
    const dates = datedEvents.map((event) => event.date.comparable);
    const lineageXs = events.map((event) => event.lineageX).filter((value) => value != null);
    const depths = events.map((event) => event.lineageDepth).filter((value) => value != null);
    return {
      singleColor,
      totalEvents: events.length,
      dateCount: dates.length,
      lineageXCount: lineageXs.length,
      lineageDepthCount: depths.length,
      minDate: dates.length ? Math.min(...dates) : 0,
      maxDate: dates.length ? Math.max(...dates) : 1,
      minDateLabel: datedEvents.length ? datedEvents[0].date.display : "",
      maxDateLabel: datedEvents.length ? datedEvents[datedEvents.length - 1].date.display : "",
      minLineageX: lineageXs.length ? Math.min(...lineageXs) : null,
      maxLineageX: lineageXs.length ? Math.max(...lineageXs) : null,
      minDepth: depths.length ? Math.min(...depths) : 0,
      maxDepth: depths.length ? Math.max(...depths) : 1,
      palette: ["#2563eb", "#16a34a", "#f59e0b", "#dc2626"],
    };
  }

  function normalizeBetween(value, min, max) {
    if (value == null || !Number.isFinite(value)) return 0.5;
    if (min == null || max == null || min === max) return 0.5;
    return clamp((value - min) / (max - min), 0, 1);
  }

  function interpolatePalette(palette, value) {
    const colors = palette && palette.length ? palette : ["#2563eb", "#dc2626"];
    const t = clamp(value, 0, 1);
    if (colors.length === 1) return colors[0];
    const scaled = t * (colors.length - 1);
    const index = Math.min(colors.length - 2, Math.floor(scaled));
    const localT = scaled - index;
    return interpolateColor(colors[index], colors[index + 1], localT);
  }

  function interpolateColor(start, end, amount) {
    const a = hexToRgb(start);
    const b = hexToRgb(end);
    const t = clamp(amount, 0, 1);
    return rgbToHex({
      r: Math.round(a.r + (b.r - a.r) * t),
      g: Math.round(a.g + (b.g - a.g) * t),
      b: Math.round(a.b + (b.b - a.b) * t),
    });
  }

  function hexToRgb(hex) {
    const clean = String(hex || "").replace("#", "");
    const full = clean.length === 3 ? clean.replace(/(.)/g, "$1$1") : clean;
    const value = Number.parseInt(full || "000000", 16);
    return {
      r: (value >> 16) & 255,
      g: (value >> 8) & 255,
      b: value & 255,
    };
  }

  function rgbToHex(rgb) {
    return `#${[rgb.r, rgb.g, rgb.b].map((part) => clamp(part, 0, 255).toString(16).padStart(2, "0")).join("")}`;
  }

  function average(values) {
    const usable = values.filter((value) => Number.isFinite(value));
    if (!usable.length) return null;
    return usable.reduce((sum, value) => sum + value, 0) / usable.length;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  return {
    EVENT_LABELS,
    parseGedcom,
    parseGedcomDate,
    computeAncestry,
    extractEvents,
    groupEventsByLocation,
    mergeLocationGroups,
    eventAtLocation,
    peopleAtLocation,
    groupRepresentativeEvent,
    colorContext,
    colorForGroup,
    colorValueForGroup,
    interpolateColor,
    normalizePlace,
  };
});
