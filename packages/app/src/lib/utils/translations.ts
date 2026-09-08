// Single translation map: all UI strings in one place
const TRANSLATIONS: Record<string, string> = {
	// Placeholders
	unknown: 'Onbekend',

	// Record types
	image: 'Afbeelding',
	person: 'Persoon',
	text: 'Tekst',

	// Place types
	address: 'Adres',
	street: 'Straat',
	neighbourhood: 'Buurt',
	district: 'Wijk',

	// Relations
	isAbout: 'Gaat over',
	hadLastLivingLocation: 'Laatste woonadres',

	// Entity fields
	born: 'Geboren',
	died: 'Overleden',
	date: 'Datum',
	author: 'Auteur',

	// Sorting
	sortLabel: 'Sortering',
	sortSample: 'Van alles wat',
	sortSpatial: 'Precies gelokaliseerd',
	sortTemporal: 'Precies gedateerd',
	sortRelevance: 'Relevantie',
	sortOldest: 'Oudste eerst',
	sortNewest: 'Nieuwste eerst',
	sortBestMatch: 'Beste match',
	reshuffle: 'Schud opnieuw',

	// UI labels
	searchPlaceholder: 'Zoek een plek op de kaart',
	featureSearchPlaceholder: 'Zoek in de collectie',
	applySearch: 'Zoek',
	clearSearchFilter: 'Verwijder zoekfilter',
	searchResult: 'resultaat',
	searchResults: 'resultaten',
	cellsOf: 'Cellen van',
	cellOf: 'Cel van',
	clearPlaceFilter: 'Verwijder plekfilter',
	viewPlace: 'bekijk',
	ofThisCell: 'van deze cel',
	ofCellsOf: 'van de cellen van',
	ofCellOf: 'van de cel van',
	nowKnownAs: 'nu',
	filters: 'Filters',
	dataset: 'Dataset',
	dataProvider: 'Databron',
	placeDataProvider: 'Locatiebron',
	geometrySource: 'Geometriebron',
	contentType: 'Inhoudstype',
	topics: 'Onderwerpen',
	source: 'Bron',

	// Error titles
	'Invalid Content Type Removed': 'Ongeldig inhoudstype verwijderd',
	'Invalid Input': 'Ongeldige invoer',
	'Period Not Found': 'Periode niet gevonden',
	'Invalid Cell': 'Ongeldige cel',
	'Place Not Found': 'Plek niet gevonden',
	'Place Filter Load Failed': 'Plekfilter laden mislukt',
	'Place Search Failed': 'Zoeken naar plekken mislukt',

	// Error messages
	'is not a valid content type and was removed from your selection': 'is geen geldig inhoudstype en is verwijderd uit uw selectie',
	'No valid content types found. Defaulting to all content types': 'Geen geldige inhoudstypes gevonden. Standaard ingesteld op alle inhoudstypes',
	'invalid format. Expected YYYY_YYYY': 'ongeldig formaat. Verwacht YYYY_YYYY',
	'Defaulting to most recent period': 'Standaard ingesteld op meest recente periode',
	'invalid range. Start year must be less than end year': 'ongeldig bereik. Beginjaar moet kleiner zijn dan eindjaar',
	spans: 'beslaat',
	'years. Maximum 50 years supported': 'jaar. Maximaal 50 jaar ondersteund',
	"doesn't exist in the dataset. Defaulting to most recent period": 'bestaat niet in de dataset. Standaard ingesteld op meest recente periode',
	'not found. Please select a valid cell from the map': 'niet gevonden. Selecteer een geldige cel op de kaart',
	'The place in this URL does not exist anymore. The place filter was removed.':
		'De plek in deze URL bestaat niet meer. Het plekfilter is verwijderd.',
	'Could not restore the place filter. Please try again later.':
		'Kon het plekfilter niet herstellen. Probeer het later opnieuw.',
	'Could not search places. Please try again later.':
		'Kon geen plekken zoeken. Probeer het later opnieuw.'
};

// Reverse map (built once)
const REVERSE: Record<string, string> = Object.fromEntries(
	Object.entries(TRANSLATIONS).map(([k, v]) => [v, k])
);

/**
 * Translate a key to Dutch. Returns the key itself if no translation exists.
 */
export function translate(key: string): string {
	return TRANSLATIONS[key] || key;
}

/**
 * Reverse translate a Dutch string back to its English key.
 */
export function reverseTranslate(dutch: string): string {
	return REVERSE[dutch] || dutch;
}

/** Translate an array of keys to Dutch. */
export function translateAll(keys: string[]): string[] {
	return keys.map(translate);
}

/** Reverse translate an array of Dutch strings back to their English keys. */
export function reverseTranslateAll(dutch: string[]): string[] {
	return dutch.map(reverseTranslate);
}

/**
 * Translate an error message by substring replacement (not a key lookup), so
 * dynamic messages with interpolated values still get their known phrases translated.
 */
export function translateErrorMessage(message: string): string {
	let translated = message;
	// Apply translations for error message patterns
	for (const [english, dutch] of Object.entries(TRANSLATIONS)) {
		if (english.length > 20) { // Only match longer error message strings
			translated = translated.replace(english, dutch);
		}
	}
	return translated;
}
