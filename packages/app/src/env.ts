import { defineEnvVars } from '@sveltejs/kit/env';

// read when the app starts; each is optional
export const variables = defineEnvVars({
	PUBLIC_DEFAULT_CENTER: { public: true, schema: (value) => value },
	PUBLIC_TILE_SOURCE_URL: { public: true, schema: (value) => value },
	PUBLIC_EXACT_CELLS: { public: true, schema: (value) => value }
});
