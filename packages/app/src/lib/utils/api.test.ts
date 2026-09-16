import { describe, test, expect, vi } from 'vitest';

vi.mock('$app/paths', () => ({ base: '/x' }));

import { apiUrl } from './api';

describe('apiUrl', () => {
	test('prefixes the base path', () => {
		expect(apiUrl('/api/metadata')).toBe('/x/api/metadata');
	});

	test('appends params only when there are any', () => {
		expect(apiUrl('/api/heatmaps', new URLSearchParams())).toBe('/x/api/heatmaps');
		expect(apiUrl('/api/heatmaps', new URLSearchParams('recordTypes=image'))).toBe('/x/api/heatmaps?recordTypes=image');
	});
});
