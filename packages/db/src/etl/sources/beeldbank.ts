/**
 * Import Beeldbank (Amsterdam Stadsarchief image archive) features
 *
 * Streams a large JSON file (~2.5GB) mapping Adamlink URIs to arrays of images.
 * Inserts features, creates source/relation records, and links features to places.
 *
 * Usage: bun run db:ingest -s beeldbank -f ../../data/beeldbank-fixed.json
 */
import { createReadStream } from 'fs';
import { parser } from 'stream-json';
import { streamObject } from 'stream-json/streamers/StreamObject';
import { pool } from '../../client';

export async function ingest(filePath: string) {
  const client = await pool.connect();

  // Create source
  await client.query(`
    INSERT INTO sources (id, label, url)
    VALUES ('beeldbank', 'Stadsarchief Amsterdam Beeldbank', 'https://archief.amsterdam/beeldbank')
    ON CONFLICT DO NOTHING
  `);

  // Create default relation
  await client.query(`
    INSERT INTO relation (id, label)
    VALUES ('isAbout', 'Is About')
    ON CONFLICT DO NOTHING
  `);

  console.log(`Streaming ${filePath}...`);

  const seenFeatures = new Set<string>();
  let featureCount = 0;
  let linkCount = 0;
  let entryCount = 0;

  const pipeline = createReadStream(filePath)
    .pipe(parser())
    .pipe(streamObject());

  for await (const { key: adamlinkUri, value: val } of pipeline) {
    const images = (val as any).images || [];

    for (const img of images) {
      const featureId = img['@id'];
      if (!featureId) continue;

      if (!seenFeatures.has(featureId)) {
        seenFeatures.add(featureId);
        const name = (img.name || '').replace(/'/g, "''");
        const contentUrl = img.contentUrl || '';
        const startDate = img.startDate || null;
        const endDate = img.endDate || null;
        const dateCreated = (img.dateCreated || '').replace(/'/g, "''");

        await client.query(`
          INSERT INTO features (id, record_type, label, content_url, start_date, end_date, date_created, source_id)
          VALUES ($1, 'image', $2, $3, $4, $5, $6, 'beeldbank')
          ON CONFLICT DO NOTHING
        `, [featureId, name, contentUrl, startDate, endDate, dateCreated]);
        featureCount++;
      }

      await client.query(`
        INSERT INTO feature_to_place (feature_id, place_id, relation_id)
        VALUES ($1, $2, 'isAbout')
        ON CONFLICT DO NOTHING
      `, [featureId, adamlinkUri]);
      linkCount++;
    }

    entryCount++;
    if (entryCount % 1000 === 0) {
      process.stdout.write(`\r  ${entryCount} addresses, ${featureCount} features, ${linkCount} links`);
    }
  }

  console.log(`\nDone: ${featureCount} features, ${linkCount} links`);
  client.release();
}
