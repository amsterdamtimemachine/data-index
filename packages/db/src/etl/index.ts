import { program } from 'commander';
import { rebuildFeatureCells } from './post-process/populate-cells';

program
  .name('atm-db')
  .description('Amsterdam Time Machine database ETL tools');

program
  .command('rebuild-index')
  .description('Rebuild feature_cells grid, spatial frequency, and temporal frequency')
  .action(async () => {
    try {
      await rebuildFeatureCells();
      process.exit(0);
    } catch (error) {
      console.error('Failed to rebuild feature_cells:', error);
      process.exit(1);
    }
  });

program
  .command('ingest')
  .description('Ingest data from a source')
  .requiredOption('-s, --source <name>', 'Source name to ingest')
  .requiredOption('-f, --file <path>', 'Input file path')
  .action(async (opts) => {
    try {
      // Dynamically import the source module
      const sourcePath = `./sources/${opts.source}.ts`;
      let sourceModule;

      try {
        sourceModule = await import(sourcePath);
      } catch {
        console.error(`Unknown source: ${opts.source}`);
        console.error('Available sources: lps, beeldbank, joods-monument');
        process.exit(1);
      }

      if (!sourceModule.ingest) {
        console.error(`Source ${opts.source} does not export an ingest function`);
        process.exit(1);
      }

      console.log(`Ingesting from source: ${opts.source}`);
      console.log(`File: ${opts.file}\n`);

      await sourceModule.ingest(opts.file);

      console.log('\nRun `bun run db:rebuild-index` to compute spatial grid and temporal frequencies.');
      process.exit(0);
    } catch (error) {
      console.error('Ingestion failed:', error);
      process.exit(1);
    }
  });

program.parse();
