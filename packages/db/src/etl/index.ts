import { readdirSync } from 'fs';
import { program } from 'commander';
import { rebuildIndex } from './post-process/rebuild-index';

program
  .name('atm-db')
  .description('Amsterdam Time Machine database ETL tools');

program
  .command('rebuild-index')
  .description('Rebuild the spatial grid index and compute temporal and spatial frequencies')
  .action(async () => {
    try {
      await rebuildIndex();
      process.exit(0);
    } catch (error) {
      console.error('Failed to rebuild place_cells:', error);
      process.exit(1);
    }
  });

program
  .command('ingest')
  .description('Ingest data from a source')
  .requiredOption('-s, --source <name>', 'Source name to ingest')
  .requiredOption('-f, --file <path>', 'Input file path')
  .option('-x, --adamlink-streets <path>', 'Adamlink straten TTL (required by the nwb-streets source, to dedup against)')
  .action(async (opts) => {
    try {
      // Dynamically import the source module
      const sourcePath = `./sources/${opts.source}.ts`;
      let sourceModule;

      try {
        sourceModule = await import(sourcePath);
      } catch (err) {
        // Two failure modes: the source file doesn't exist (genuinely unknown source),
        // or it exists but threw while loading (a real error — surface it rather than
        // mislabel it "Unknown source", which is misleading when the name IS valid).
        let available: string[] = [];
        try {
          available = readdirSync(new URL('./sources/', import.meta.url))
            .filter(f => f.endsWith('.ts')).map(f => f.replace(/\.ts$/, '')).sort();
        } catch { /* ignore — fall through to reporting */ }
        if (available.includes(opts.source)) {
          console.error(`Source '${opts.source}' exists but failed to load:`);
          console.error(err);
        } else {
          console.error(`Unknown source: ${opts.source}`);
          console.error(`Available sources: ${available.join(', ') || '(none found)'}`);
        }
        process.exit(1);
      }

      if (!sourceModule.ingest) {
        console.error(`Source ${opts.source} does not export an ingest function`);
        process.exit(1);
      }

      console.log(`Ingesting from source: ${opts.source}`);
      console.log(`File: ${opts.file}\n`);

      await sourceModule.ingest(opts.file, { adamlinkStreets: opts.adamlinkStreets });

      console.log('\nRun `bun run db:rebuild-index` to rebuild the spatial grid index and compute temporal and spatial frequencies.');
      process.exit(0);
    } catch (error) {
      console.error('Ingestion failed:', error);
      process.exit(1);
    }
  });

program
  .command('fetch')
  .description('Fetch reference place data from PDOK into a ground-truth file')
  .requiredOption('-s, --source <name>', 'Fetcher name')
  .requiredOption('-o, --out <path>', 'Output file path')
  .action(async (opts) => {
    try {
      const mod = await import(`./fetchers/${opts.source}.ts`);
      if (!mod.run) {
        console.error(`Fetcher ${opts.source} does not export a run function`);
        process.exit(1);
      }
      await mod.run(opts.out);
      process.exit(0);
    } catch (error) {
      console.error('Fetch failed:', error);
      process.exit(1);
    }
  });

program.parse();
