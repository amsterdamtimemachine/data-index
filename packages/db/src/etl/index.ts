import { program } from 'commander';
import { rebuildFeatureCells } from './post-process/populate-cells';

program
  .name('atm-db')
  .description('Amsterdam Time Machine database ETL tools');

program
  .command('rebuild-cells')
  .description('Rebuild the feature_cells table for heatmap queries')
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
  .option('--skip-cells', 'Skip rebuilding feature_cells after ingestion')
  .action(async (opts) => {
    try {
      // Dynamically import the source module
      const sourcePath = `./sources/${opts.source}.ts`;
      let sourceModule;

      try {
        sourceModule = await import(sourcePath);
      } catch {
        console.error(`Unknown source: ${opts.source}`);
        console.error('Available sources: lps, beeldbank');
        process.exit(1);
      }

      if (!sourceModule.ingest) {
        console.error(`Source ${opts.source} does not export an ingest function`);
        process.exit(1);
      }

      console.log(`Ingesting from source: ${opts.source}`);
      console.log(`File: ${opts.file}\n`);

      await sourceModule.ingest(opts.file);

      if (!opts.skipCells) {
        console.log('\nRebuilding feature_cells...');
        await rebuildFeatureCells();
      }

      process.exit(0);
    } catch (error) {
      console.error('Ingestion failed:', error);
      process.exit(1);
    }
  });

program.parse();
