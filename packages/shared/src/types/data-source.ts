import type { RecordType, RawFeature } from './feature';

export interface DatabaseConfig {
  baseUrl: string;
  defaultParams?: Partial<ApiQueryParams>;
  batchSize?: number;
  timeout?: number;
}

export interface ApiQueryParams {
  min_lat: number;
  min_lon: number;
  max_lat: number;
  max_lon: number;
  start_year: string;
  end_year: string;
  recordtypes?: RecordType[];
  page?: number;
  page_size?: number;
}

// Response from external geodata API
export interface ApiResponse {
  data: RawFeature[];
  total: number;
  page: number;
  page_size: number;
  returned: number;
  total_pages: number;
}
