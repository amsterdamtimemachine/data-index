}

export class Delpher extends Ingestor<DelpherSourceData> {
  // ═══════════════════════════════════════════════════════════════
  //  Organisation
  // ═══════════════════════════════════════════════════════════════
  protected ORG_ID = 'kb';
  protected ORG_LABEL = 'Koninklijke Bibliotheek';
  protected ORG_URL = 'https://www.kb.nl';

  // ═══════════════════════════════════════════════════════════════
  //  Dataset
  // ═══════════════════════════════════════════════════════════════
  protected DATASET_ID = 'delpher';
  protected DATASET_LABEL = 'Delpher Kranten';
  protected DATASET_URL = 'https://www.delpher.nl';

  // ═══════════════════════════════════════════════════════════════
  //  Feature metadata
  // ═══════════════════════════════════════════════════════════════
  protected RECORD_TYPE = 'text';
  protected RELATION_ID = 'isAbout';
  protected RELATION_LABEL = 'Is About';
  protected transform(source: DelpherSourceData): Omit<TargetRecord, 'area' | 'level'> & { area?: string; level?: string; } {
    throw new Error('Method not implemented.');
  }
  
}