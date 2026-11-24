/**
 * Extract the Amsterdam Diaries Time Machine dump (Zenodo, its rdf/ JSON-LD) into the
 * JSONL the amsterdam-diaries ingest reads.
 *
 * An entry is the unit: one dated piece of writing with its diary and author and an
 * excerpt of its transcription per place inside the territory, cut around the first
 * mention of that place. The index answers what, when, where and why it is here; the
 * people and places an entry names are the source's to show, so they are not
 * extracted. The index links a feature to one place per row, so an entry mentioning
 * several places is written once per place, with the same entry fields, a different
 * `place`, and the whole list in `places`. Entries without such a place are left out.
 *
 * The dump links a mention to a span of text on a line; lines belong to regions and
 * regions to entries, so an entry's mentions are found by walking those ids, never by
 * reading the text. The excerpt is whole lines, up to EXCERPT_LENGTH characters, with
 * the mention offsets inside it and flags for the text cut away on either side; its
 * `place` is the mention's URI, which the ingest uses to resolve the place and drops.
 *
 * A region tagged Visual is a drawing or picture on the page. The entry lists its
 * regions in reading order, so an image sits in the text where it sits in that list:
 * its anchor is the text offset there. An excerpt carries the images anchored within
 * it, edges included, each as its scan on the Diaries IIIF server and its box there.
 *
 * The author's page on the Diaries site is asked of the site's API while extracting.
 *
 * Usage: bun run db:extract -s amsterdam-diaries -i <dump dir> -o <data-dir>/amsterdam-diaries.jsonl -m <data-dir>/municipality.geojson
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import type { ExcerptImage } from '@atm/shared';
import type { DiaryEntryRow, DiaryPlace } from '../sources/amsterdam-diaries';
import { findJson } from '../util/http';
import { jsonlWriter } from '../util/jsonl';
import { loadScope } from '../util/scope';
import { pointWkt } from '../util/wkt';

// characters of transcription kept around a place mention, about one printed page
const EXCERPT_LENGTH = 3000;

// the reading page of an entry on the Diaries site: the diary's subject by slug and
// the entry's position among the subject's entries, diaries in order, counted from 1
const SITE_URL = 'https://diaries.amsterdamtimemachine.nl/dagboeken/{slug}?page={page}';
const AUTHOR_URL = 'https://diaries.amsterdamtimemachine.nl/dagboekschrijfsters/{slug}';
const AUTHOR_API = 'https://diaries.amsterdamtimemachine.nl/api/dagboekschrijfsters/{slug}';
const DIARIES_API = 'https://diaries.amsterdamtimemachine.nl/api/diaries/{id}';
const PERSON_URL = 'https://diaries.amsterdamtimemachine.nl/personen/{slug}';
const PERSON_API = 'https://diaries.amsterdamtimemachine.nl/api/personen/{slug}';

// Wikidata places whose coordinate is the centroid of an area or a water, not a
// location: the mention stays on the card, the map gets no point for it
const AREAS = new Set([
  'Q727', // Amsterdam (stad)
  'Q478607', // Amsterdam-Noord (stadsdeel)
  'Q478608', // Amsterdam-Oost (stadsdeel)
  'Q478636', // Amsterdam-Zuid (stadsdeel)
  'Q1661514', // Indische Buurt (wijk)
  'Q1936132', // Watergraafsmeer (wijk)
  'Q447664', // De Wallen (wijk)
  'Q582916', // Betondorp (wijk)
  'Q966809', // Omval (wijk)
  'Q2264716', // Schellingwoude (plaats)
  'Q9898', // Amstelveen (gemeente)
  'Q185405', // Amstel (rivier)
  'Q338137', // IJ (meer)
  'Q1397383', // Haven van Amsterdam (haven)
]);

// a JSON-LD node, read loosely: the dump is the source's to shape
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any;
type Span = [lineId: string, start: number, end: number];
type Excerpt = DiaryEntryRow['excerpts'][number];

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name]));
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// a reference written as an id or a value, or as a node carrying one
function ref(x: Node): string | null {
  if (x && typeof x === 'object') {
    return x['@id'] ?? x['@value'] ?? null;
  }
  return x ?? null;
}

function load(dump: string, name: string): Node[] {
  return JSON.parse(readFileSync(join(dump, 'rdf', `${name}.jsonld`), 'utf8'));
}

function placeKind(uri: string): string {
  if (uri.includes('adamlink.nl/geo/')) {
    return uri.split('/geo/')[1].split('/')[0];
  }
  return 'wikidata';
}

/** The site's pages for the people who wrote the diaries, asked once per name. */
function authorPages() {
  const authors = new Map<string, string | null>();
  const persons = new Map<string, string | null>();

  async function personPage(slug: string): Promise<string | null> {
    if (!persons.has(slug)) {
      const person = await findJson(fill(PERSON_API, { slug }));
      persons.set(slug, person ? fill(PERSON_URL, { slug }) : null);
    }
    return persons.get(slug)!;
  }

  // the writer's page when the site files a diary under them, else their person page
  return async (name: string | null): Promise<string | null> => {
    const slug = slugify(name ?? '');
    if (!slug) {
      return null;
    }
    if (!authors.has(slug)) {
      let page: string | null = null;
      const writer = await findJson<{ id: string | number }>(fill(AUTHOR_API, { slug }));
      if (writer) {
        const diaries = await findJson<unknown[]>(fill(DIARIES_API, { id: writer.id }));
        if (Array.isArray(diaries) ? diaries.length > 0 : Boolean(diaries)) {
          page = fill(AUTHOR_URL, { slug });
        }
      }
      authors.set(slug, page ?? (await personPage(slug)));
    }
    return authors.get(slug)!;
  };
}

/** Whole lines around the first mention, up to EXCERPT_LENGTH, with the mentions and images inside. */
function excerpt(lines: string[], lineIds: string[], lineStart: Map<string, number>, spans: Span[], images: ExcerptImage[]): Omit<Excerpt, 'place'> {
  const index = new Map(lineIds.map((id, i) => [id, i]));
  const marks = spans
    .filter(([id]) => lineStart.has(id))
    .map(([id, start, end]) => [lineStart.get(id)! + start, lineStart.get(id)! + end])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const positions = spans.filter(([id]) => index.has(id)).map(([id]) => index.get(id)!);
  const first = positions.length ? Math.min(...positions) : 0;
  let lo = first;
  let hi = first;
  let length = lines[first].length;
  // grow alternately upward and downward while the next line still fits
  for (let grew = true; grew;) {
    grew = false;
    if (lo > 0 && length + lines[lo - 1].length + 1 <= EXCERPT_LENGTH) {
      lo--;
      length += lines[lo].length + 1;
      grew = true;
    }
    if (hi < lines.length - 1 && length + lines[hi + 1].length + 1 <= EXCERPT_LENGTH) {
      hi++;
      length += lines[hi].length + 1;
      grew = true;
    }
  }
  const base = lineStart.get(lineIds[lo])!;
  const end = lineStart.get(lineIds[hi])! + lines[hi].length;
  return {
    text: lines.slice(lo, hi + 1).join('\n'),
    truncatedBefore: lo > 0,
    truncatedAfter: hi < lines.length - 1,
    mentions: marks.filter(([s, e]) => s >= base && e <= end).map(([s, e]) => ({ start: s - base, end: e - base })),
    // an image just before the first line or just after the last is still beside the text
    images: images
      .filter((img) => base <= img.anchor && img.anchor <= end + 1)
      .map((img) => ({ ...img, anchor: Math.min(img.anchor, end + 1) - base })),
  };
}

export async function run(dump: string, outPath: string, opts: { municipality?: string } = {}) {
  if (!opts.municipality) {
    throw new Error('the amsterdam-diaries extract keeps the territory: -m <data-dir>/municipality.geojson (from db:fetch -s municipality)');
  }
  const inScope = loadScope(opts.municipality);
  const authorPage = authorPages();

  console.log(`Reading ${dump}...`);
  const meta = load(dump, 'metadata');
  const textual = load(dump, 'textual_annotations');
  const entityAnnotations = load(dump, 'entity_annotations');
  const external = new Map<string, Node>(load(dump, 'external_resources').map((n) => [n['@id'], n]));

  // text: line id -> text, region id -> line ids; a Visual region -> its scan and box
  const lineText = new Map<string, string>();
  const regionLines = new Map<string, string[]>();
  const lineRegion = new Map<string, string>();
  const visual = new Map<string, { source: string; region: string }>();
  for (const a of textual) {
    const isVisual = (a.body ?? []).some((b: Node) => typeof b.source === 'object' && b.source?.id?.endsWith('/tags/regions/visual'));
    if (a.textGranularity === 'block' && isVisual) {
      const target = a.target;
      const box: string | undefined = (target.selector ?? []).find((s: Node) => s.type === 'FragmentSelector')?.value;
      if (box) {
        visual.set(a.id, { source: ref(target.source)!, region: box.replace(/^xywh=/, '') });
      }
    }
    if (a.textGranularity === 'line') {
      lineText.set(a.id, a.body[0].value || '');
    } else if (a.items?.length) {
      for (const item of a.items) {
        const lineId = typeof item === 'string' ? item : item.id;
        if (!regionLines.has(a.id)) {
          regionLines.set(a.id, []);
        }
        regionLines.get(a.id)!.push(lineId);
        lineRegion.set(lineId, a.id);
      }
    }
  }

  const books = new Map<string, Node>(meta.filter((n) => n['@type'] === 'Book').map((n) => [n['@id'], n]));
  const persons = new Map<string, Node>(meta.filter((n) => n['@type'] === 'Person').map((n) => [n['@id'], n]));

  // entry id -> its page on the site, counted over the subject's diaries in order
  const sitePage = new Map<string, string>();
  const bySubject = new Map<string | null, Node[]>();
  for (const b of books.values()) {
    const subject = ref(b.about) ?? ref(b.author);
    if (!bySubject.has(subject)) {
      bySubject.set(subject, []);
    }
    bySubject.get(subject)!.push(b);
  }
  for (const subjectBooks of bySubject.values()) {
    let page = 0;
    for (const b of subjectBooks) {
      const slug = slugify((b.about || b.author)?.name ?? '');
      for (const part of b.hasPart ?? []) {
        page++;
        sitePage.set(ref(part)!, fill(SITE_URL, { slug, page }));
      }
    }
  }
  const entries: Node[] = meta.filter((n) => n.type === 'Annotation' && n.motivation === 'classifying').map((n) => n.body[0]);
  const regionEntry = new Map<string, string>();
  for (const e of entries) {
    for (const r of e.hasPart ?? []) {
      regionEntry.set(r, e['@id']);
    }
  }

  // per entry and place, where in the entry's text each mention of it sits
  const spans = new Map<string, Map<string, Span[]>>();
  // the identified place's label, for a place the external resources do not name
  const placeLabels = new Map<string, string | null>();
  for (const a of entityAnnotations) {
    let kind: string | null = null;
    let ident: Node = null;
    for (const b of a.body) {
      if (b.purpose === 'classifying') {
        kind = b.source.label;
      }
      if (b.purpose === 'identifying' && b.source && typeof b.source === 'object') {
        ident = b.source;
      }
    }
    if (kind !== 'Place' || !ident) {
      continue;
    }
    const targets: Node[] = Array.isArray(a.target) ? a.target : [a.target];
    const entryId = regionEntry.get(lineRegion.get(targets[0].source.replaceAll('-body', '')) ?? '');
    if (!entryId) {
      continue;
    }
    placeLabels.set(ident.id, ident.label ?? null);
    for (const t of targets) {
      const pos = (t.selector ?? []).filter((s: Node) => s.type === 'TextPositionSelector').pop();
      if (pos) {
        if (!spans.has(entryId)) {
          spans.set(entryId, new Map());
        }
        const byPlace = spans.get(entryId)!;
        if (!byPlace.has(ident.id)) {
          byPlace.set(ident.id, []);
        }
        byPlace.get(ident.id)!.push([t.source.replaceAll('-body', ''), pos.start, pos.end]);
      }
    }
  }

  const out = jsonlWriter<DiaryEntryRow>(outPath);
  // Wikidata points kept, for a look that they are places rather than areas
  const unlisted = new Map<string, string>();
  for (const e of entries) {
    const lineIds: string[] = (e.hasPart ?? []).flatMap((r: string) => regionLines.get(r) ?? []);
    const lines = lineIds.map((id) => lineText.get(id) ?? '');
    if (!lines.join('\n').trim()) {
      out.skip('without text');
      continue;
    }
    // where each line starts in the entry's text, and where each image sits in it
    const lineStart = new Map<string, number>();
    const images: ExcerptImage[] = [];
    let offset = 0;
    for (const r of e.hasPart ?? []) {
      const image = visual.get(r);
      if (image) {
        images.push({ ...image, anchor: offset });
      }
      for (const id of regionLines.get(r) ?? []) {
        lineStart.set(id, offset);
        offset += (lineText.get(id) ?? '').length + 1;
      }
    }
    const book = books.get(ref(e.isPartOf) ?? '') ?? {};
    const author = persons.get(ref(book.author) ?? '') ?? {};
    const entrySpans = spans.get(e['@id']) ?? new Map<string, Span[]>();
    const places: DiaryPlace[] = [];
    for (const uri of entrySpans.keys()) {
      const p = external.get(uri) ?? {};
      if (!p.geo || !inScope(p.geo.longitude, p.geo.latitude)) {
        continue;
      }
      const qid = uri.split('/').pop()!;
      if (AREAS.has(qid)) {
        continue;
      }
      const kind = placeKind(uri);
      const name = p.name || placeLabels.get(uri) || null;
      if (kind === 'wikidata') {
        unlisted.set(qid, `${name}  (${p.description ?? ''})`);
      }
      places.push({
        uri,
        name,
        kind,
        geom_wkt: pointWkt(p.geo.longitude, p.geo.latitude),
      });
    }
    if (places.length === 0) {
      out.skip('without a place in the territory');
      continue;
    }
    const row: Omit<DiaryEntryRow, 'place'> = {
      id: e['@id'],
      url: sitePage.get(e['@id']) ?? e['@id'],
      name: e.name ?? null,
      date: ref(e.dateCreated),
      excerpts: places.map((p) => ({ place: p.uri, ...excerpt(lines, lineIds, lineStart, entrySpans.get(p.uri) ?? [], images) })),
      // every place of the entry, so one row can resolve them all
      places,
      diary: { name: book.name ?? null, url: ref(book.url) },
      author: { name: author.name ?? null, url: await authorPage(author.name ?? null) },
    };
    for (const place of places) {
      out.write({ ...row, place });
    }
  }
  await out.close();
  console.log(`amsterdam-diaries: ${out.summary()}`);
  if (unlisted.size > 0) {
    console.log('Wikidata points kept (check they are places, not areas):');
    for (const [qid, label] of [...unlisted].sort()) {
      console.log(`  ${qid}  ${label}`);
    }
  }
}
