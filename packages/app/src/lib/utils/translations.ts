// Single translation map: all UI strings in one place
const TRANSLATIONS: Record<string, string> = {
	// Placeholders
	unknown: 'Onbekend',

	// Record types
	image: 'Afbeelding',
	person: 'Persoon',
	text: 'Tekst',
	event: 'Evenement',
	// an event's subtype, which names its type on the card in place of "Evenement"
	screening: 'Filmvertoning',
	performance: 'Voorstelling',
	story: 'Verhaal',

	// Place types
	address: 'Adres',
	street: 'Straat',
	neighbourhood: 'Buurt',
	district: 'Wijk',

	// Tags (classifier keys → Dutch)
	animals: 'Dieren',
	art: 'Kunst',
	birds_eye_view: 'Vogelvlucht',
	bridge_canal: 'Bruggen en grachten',
	building_architecture: 'Gebouwen',
	building_interior: 'Interieurs',
	construction_demolition: 'Bouw en sloop',
	drawing_architecture: 'Bouwtekeningen',
	harbor_industrial: 'Haven en industrie',
	maps: 'Kaarten',
	parks_green: 'Parken en groen',
	portrait_people: 'Mensen en portretten',
	public_event: 'Evenementen',
	shops_commerce: 'Winkels en handel',
	transportation: 'Vervoer',

	// Relations
	isAbout: 'Gaat over',
	mentions: 'Noemt',
	screenedAt: 'Vertoond op',
	performedAt: 'Opgevoerd op',

	hadLastLivingLocation: 'Laatste woonadres',

	// Entity fields
	born: 'Geboren',
	died: 'Overleden',
	// screening event rows
	film: 'Film',
	performer: 'Optreden',
	dating: 'Datering',

	// Months, for dates worded on cards
	january: 'januari',
	february: 'februari',
	march: 'maart',
	april: 'april',
	may: 'mei',
	june: 'juni',
	july: 'juli',
	august: 'augustus',
	september: 'september',
	october: 'oktober',
	november: 'november',
	december: 'december',
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
	searchPlaceholder: 'Zoek een plek of zoekterm',
	// the dropdown's text search row; {term} stands for what was typed
	searchInTitles: 'Zoek ‘{term}’ in titels',
	clearSearchFilter: 'Verwijder zoekfilter',
	cellsOf: 'Cellen van',
	cellOf: 'Cel van',
	clearPlaceFilter: 'Verwijder plekfilter',
	imageUnavailable: 'Afbeelding niet beschikbaar',
	noFeaturesForSelection: 'Geen features gevonden voor deze selectie en periode.',
	// the filter panel's sections
	searchFilter: 'Zoeken op de kaart',
	recordTypeFilter: 'Inhoudstype',
	datasetFilter: 'Dataset',
	datasetFilterTooltip: 'Filter op basis van de dataset waaruit de data afkomstig is.',
	scaleFilter: 'Schaal',
	scaleFilterTooltip: 'Hoe precies een feature op de kaart is geplaatst: op een adres, een straat, een buurt of een wijk.',
	viewFilters: 'Bekijk',
	navAbout: 'Over',

	// cards, grid and panel
	showMore: 'Meer tonen',
	// the link after a story's excerpt to the entry's page at the source
	readMore: 'Lees verder',
	fullTextAtSource: 'Volledige tekst bij de bron',
	showLess: 'Minder tonen',
	noFeaturesToDisplay: 'Geen features om te tonen',
	openFeature: 'Feature openen',
	closeFeature: 'Feature sluiten',
	closeFeaturesPanel: 'Paneel sluiten',
	expandImage: 'Afbeelding vergroten',
	selectedCellPosition: 'Positie van de geselecteerde cel op de kaart',
	panelWidth: 'Paneelbreedte (kolommen)',

	// controls, for screen readers
	pagination: 'Paginering',
	previousPage: 'Vorige pagina',
	nextPage: 'Volgende pagina',
	goToPage: 'Ga naar pagina',
	dismissNotification: 'Melding sluiten',
	timePeriodSelector: 'Tijdperiode kiezen',
	selectPeriod: 'Kies periode',
	toggleSelection: 'Selectie',
	toggleItem: 'Wissel',

	// the empty panel's hints; {picture} and {button} stand for the inline elements
	emptyPanelCityWideHint: 'Klik op {button} rechtsonder om de tijdlijn van de selectie te tonen: daar zie je in welke periodes de selectie wel features heeft.',
	emptyPanelBarHint: 'Kies op de tijdlijn {picture} een periode met een rode balk: daar heeft de selectie wel features.',
	emptyPanelOtherCell: 'Of kies een andere cel op de kaart.',
	localTimelineAlt: 'Tijdlijn van de selectie met rode balken',
	// the timeline hover
	featureOne: 'feature',
	featureMany: 'features',
	showing: 'Toont',
	venue: 'Venue',
	// a programme's bill heading: "2 films en 1 optreden op het programma"
	filmOne: 'film',
	filmMany: 'films',
	actOne: 'optreden',
	actMany: 'optredens',
	and: 'en',
	or: 'of',
	onTheProgramme: 'op het programma',
	programmeSource: 'Programmabron',
	classifier: 'Classificatiemodel',
	// a story's rows
	diary: 'Dagboek',
	archive: 'Archief',
	persons: 'Personen',
	places: 'Plaatsen',
	inSelection: 'in de selectie',
	periodLabel: 'Periode',
	showPlaceFeatures: 'Features van deze plek tonen',
	hidePlaceFeatures: 'Features van deze plek verbergen',
	// the collapsed filter status line
	statusAtScale: 'op',
	statusInDatasets: 'in',
	statusInCellsOf: 'in de cellen van',
	statusWithSearch: 'met zoekterm',
	statusAboutTopics: 'over',
	// the search tooltip; {border} stands for the map's outline glyph
	searchTooltip: 'Een zoekterm doorzoekt voorlopig alleen titels, binnen de toegepaste filters. Bij een gekozen plek markeert de gouden rand {border} op de kaart de cellen waarin de plek ligt.',
	ofThisCell: 'van deze cel',
	timelineOfCell: 'Tijdlijn van deze cel',
	timelineOf: 'Tijdlijn van',
	toggleLocalTimeline: 'Tijdlijn van de selectie tonen',
	toggleGlobalTimeline: 'Tijdlijn van de hele stad tonen',
	ofCellsOf: 'van de cellen van',
	ofCellOf: 'van de cel van',
	nowKnownAs: 'nu',
	// place window words: "vanaf 1923", "1380 tot 1663", "in 1853"
	windowSince: 'vanaf',
	windowUntil: 'tot',
	windowIn: 'in',
	filters: 'Filters',
	// the heading over an expanded card's provenance
	provenance: 'Herkomst',
	dataProvider: 'Dataleverancier',
	placeDataProvider: 'Locatieleverancier',
	geometryProvider: 'Geometrieleverancier',
	published: 'Gepubliceerd',
	written: 'Geschreven',
	topicsTooltip: 'Onderwerpen zijn automatisch toegekend door een classificatiemodel, zonder handmatige correctie, en voorlopig alleen aan een deel van de datasets. Een grijs onderwerp heeft geen resultaten binnen de andere filters. Minimaal één: resultaten met minstens één gekozen onderwerp. Alle: alleen resultaten met alle gekozen onderwerpen.',
	topics: 'Onderwerpen',
	topicsAny: 'Minimaal één',
	topicsAll: 'Alle',
	clearAll: 'Wis alles',
	toggleTopicOperator: 'Wissel tussen minimaal één en alle onderwerpen',

	// Error titles
	'Invalid Content Type Removed': 'Ongeldig inhoudstype verwijderd',
	'Invalid Tag Removed': 'Ongeldig onderwerp verwijderd',
	'Tag Counts Failed': 'Aantallen per onderwerp niet geladen',
	'Invalid Input': 'Ongeldige invoer',
	'Period Not Found': 'Periode niet gevonden',
	'Invalid Cell': 'Ongeldige cel',
	'Place Not Found': 'Plek niet gevonden',
	'Place Filter Load Failed': 'Plekfilter laden mislukt',
	'Place Search Failed': 'Zoeken naar plekken mislukt',

	// Error messages
	'is not a valid content type and was removed from your selection': 'is geen geldig inhoudstype en is verwijderd uit uw selectie',
	'is not a valid tag and was removed from your selection': 'is geen geldig onderwerp en is verwijderd uit uw selectie',
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
		'Kon geen plekken zoeken. Probeer het later opnieuw.',
	'Could not load the topic counts.': 'Kon de aantallen per onderwerp niet laden.'
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
