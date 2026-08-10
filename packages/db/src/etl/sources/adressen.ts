/**
 * Import historical address names from the Adamlink adressen TTL (RDF).
 *
 * Each address observation (one per registry record) carries its label, a date
 * window (begin/end), a source document, and a `schema:geoContains` link to the LP
 * point it belongs to. We create one `place_historical_name` row per observation,
 * linked to the LP `place` via that geoContains link, then set `place.name`
 * to the most recent named entry per place.
 *
 * Replaces the older two-step where LPS built registry-column name stubs and a
 * separate adressen file enriched them: the TTL self-links observation → LP, so LPS
 * only needs to create the points. Run AFTER lps (the LP `place` rows must exist for
 * the place_historical_name FK).
 *
 * Usage: bun run db:ingest -s adressen -f <path-to-20240311-adressen.ttl>
 */
import { readFileSync } from 'fs';
import { Parser } from 'n3';
import { sql } from 'drizzle-orm';
import { db } from '../../client';
import { createNameWriter } from '../writers/place-writer';

export async function ingest(filePath: string) {
  console.log(`Parsing ${filePath}...`);
  const quads = new Parser().parse(readFileSync(filePath, 'utf8'));

  // Group triples by subject (each address observation is self-contained — no
  // blank-node chasing, unlike streets/buurten geometry).
  const subjects = new Map<string, { predicate: string; object: string }[]>();
  for (const q of quads) {
    if (!subjects.has(q.subject.value)) subjects.set(q.subject.value, []);
    subjects.get(q.subject.value)!.push({ predicate: q.predicate.value, object: q.object.value });
  }

  // Source documents: albr:S1 → "Publieke Werken kaartserie 1943", etc.
  const sourceLabels = new Map<string, string>();
  for (const [subj, preds] of subjects) {
    if (!subj.includes('/geo/source/')) continue;
    const label = preds.find(p => p.predicate.endsWith('#label'))?.object;
    if (label) sourceLabels.set(subj, label);
  }

  // Existing LP places (FK guard): skip observations whose LP point wasn't ingested.
  const places = new Set(
    (await db.execute<{ id: string }>(sql`SELECT id FROM place WHERE type = 'address'`)).rows.map(r => r.id)
  );

  const names = createNameWriter();
  let written = 0;
  let skipped = 0;

  for (const [subj, preds] of subjects) {
    if (!subj.includes('/geo/address/')) continue;

    const name = preds.find(p => p.predicate.endsWith('#label'))?.object;       // rdfs:label
    const lpRef = preds.find(p => p.predicate.endsWith('geoContains'))?.object;  // schema:geoContains allp:N
    if (!name || !lpRef) continue;

    const placeId = lpRef;
    if (!places.has(placeId)) { skipped++; continue; }

    const since = preds.find(p => p.predicate.endsWith('hasEarliestBeginTimeStamp'))?.object || null;
    const until = preds.find(p => p.predicate.endsWith('hasLatestEndTimeStamp'))?.object || null;
    const sourceRef = preds.find(p => p.predicate.endsWith('documentedIn'))?.object;
    const source = sourceRef ? (sourceLabels.get(sourceRef) ?? sourceRef.split('/geo/source/')[1]) : null;

    names.add({ id: subj, placeId, name, since, until, source });
    await names.flushIfFull();
    written++;
  }
  await names.flush();

  console.log(`Inserted ${written} place names (${skipped} skipped: LP place not found)`);

  // Set place.name to the most recent named entry per place.
  console.log('Updating place names...');
  const result = await db.execute(sql`
    UPDATE place SET name = sub.name
    FROM (
      SELECT DISTINCT ON (place_id) place_id, name
      FROM place_historical_name
      WHERE name IS NOT NULL
      ORDER BY place_id, since DESC
    ) sub
    WHERE place.id = sub.place_id
  `);
  console.log(`Done: ${written} names, ${result.rowCount} place names updated`);
}
