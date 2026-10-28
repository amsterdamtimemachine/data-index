import { describe, test, expect } from 'vitest';
import { memorixThumbUrl } from './memorix';
import { getPictureUrl, getExcerptImageUrl } from './image-sizes';

describe('memorixThumbUrl', () => {
	const thumb = 'https://images.memorix.nl/ams/thumb/350x350/d22581c6-fb2e-9e1b-a8eb-e4d8b527fe64.jpg';

	test('asks the same picture at another size', () => {
		expect(memorixThumbUrl(thumb, '1000x1000')).toBe('https://images.memorix.nl/ams/thumb/1000x1000/d22581c6-fb2e-9e1b-a8eb-e4d8b527fe64.jpg');
	});

	test('leaves any other URL alone', () => {
		expect(memorixThumbUrl('https://example.org/a/thumb/350x350/x.jpg', '640x480')).toBe('https://example.org/a/thumb/350x350/x.jpg');
		expect(memorixThumbUrl('https://images.memorix.nl/ams/full/x.jpg', '640x480')).toBe('https://images.memorix.nl/ams/full/x.jpg');
		expect(memorixThumbUrl('not a url', '640x480')).toBe('not a url');
	});
});

describe('getPictureUrl', () => {
	const thumb = 'https://images.memorix.nl/ams/thumb/350x350/d22581c6-fb2e-9e1b-a8eb-e4d8b527fe64.jpg';
	const drawing = { source: 'https://iiif.example/scan.jpg', region: '80,806,1083,654', anchor: 0 };

	test('a card and the full view get the size each needs, per image server', () => {
		expect(getPictureUrl(thumb, 'card')).toContain('/thumb/640x480/');
		expect(getPictureUrl(thumb, 'full')).toContain('/thumb/1000x1000/');
		expect(getExcerptImageUrl(drawing, 'card')).toBe('https://iiif.example/scan.jpg/80,806,1083,654/!640,480/0/default.jpg');
		expect(getExcerptImageUrl(drawing, 'full')).toBe('https://iiif.example/scan.jpg/80,806,1083,654/!1000,1000/0/default.jpg');
	});
});
