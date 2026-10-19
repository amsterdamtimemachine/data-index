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
	siteTitle: 'Amsterdam Time Machine Data Index',
	results: 'Resultaten',
	found: 'gevonden',
	// the screen reader's sentence after results change: "Pagina 3 van 12, …", "Geen features …"
	page: 'Pagina',
	outOf: 'van',
	none: 'Geen',
	opensInNewWindow: 'opent in nieuw venster',
	// the map region and its canvas, which the arrow keys pan
	mapRegion: 'Kaart van Amsterdam',
	mapCanvas: 'Kaart, verschuif met de pijltjestoetsen',
	mapKeyboardHint: 'Kies een plek met het zoekveld, of een periode met de tijdlijn.',
	// a filter section's question mark; the heading follows
	explainAbout: 'Uitleg over',
	pauseSearchTerm: 'Pauzeer zoekterm',
	resumeSearchTerm: 'Pas zoekterm toe',
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
	classifier: 'Classificatiemodel',
	// a story's rows
	diary: 'Dagboek',
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
	// after an old place name, the name it goes by now; {name} stands for it
	nowKnownAs: '(nu {name})',
	// place window words: "vanaf 1923", "1380 tot 1663", "in 1853"
	windowSince: 'vanaf',
	windowUntil: 'tot',
	windowIn: 'in',
	filters: 'Filters',
	// the heading over an expanded card's provenance
	provenance: 'Herkomst',
	dataProvider: 'Dataleverancier',
	placeDataProvider: 'Locatieleverancier',
	fullDataset: 'Volledige dataset',
	geometryProvider: 'Geometrieleverancier',
	published: 'Gepubliceerd',
	written: 'Geschreven',
	topicsTooltip: 'Onderwerpen zijn automatisch toegekend door een classificatiemodel, zonder handmatige correctie, en voorlopig alleen aan een deel van de datasets. Een grijs onderwerp heeft geen resultaten binnen de andere filters. Minimaal één: resultaten met minstens één gekozen onderwerp. Alle: alleen resultaten met alle gekozen onderwerpen.',
	topics: 'Onderwerpen',
	topicsAny: 'Minimaal één',
	topicsAll: 'Alle',
	clearAll: 'Wis alles',
	// the topics' operator switch, named by what "on" means
	topicOperator: 'Alle gekozen onderwerpen',

	// Toasts: a title, and a sentence under <key>Text when the title needs one; {slots} are filled in
	indexUnreachable: 'Index niet bereikbaar',
	noInternet: 'Geen internetverbinding',
	// added under a failure when the server answered with a status
	failureCode: 'Foutcode {code}',
	indexNotLoaded: 'Index niet geladen',
	mapNotLoaded: 'Kaart niet geladen',
	timelineNotLoaded: 'Tijdlijn niet geladen',
	featuresNotLoaded: 'Features niet geladen',
	topicCountsNotLoaded: 'Aantallen per onderwerp niet geladen',
	topicCountsNotLoadedText: 'De onderwerpen werken nog wel.',
	placeSearchFailed: 'Zoeken naar plekken mislukt',
	placeFilterNotRestored: 'Plekfilter niet hersteld',
	// one toast for everything wrong with a link on arrival
	linkValueUnknownOne: 'Onbekende waarde in de link',
	linkValueUnknownMany: 'Onbekende waarden in de link',
	linkValueIgnoredOne: '{values} bestaat niet en wordt genegeerd.',
	linkValueIgnoredMany: '{values} bestaan niet en worden genegeerd.',
	linkPeriodReplaced: 'Periode {period} bestaat niet; de meest recente periode wordt getoond.',
	// the error page
	pageNotFound: 'Pagina niet gevonden',
	somethingWentWrong: 'Er ging iets mis',
	backToMap: 'Terug naar de kaart'
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

/** Whether a key has a translation of its own. */
export function hasTranslation(key: string): boolean {
	return key in TRANSLATIONS;
}

/** A translated template with its {name} slots filled in: fill('(nu {name})', { name: 'Dam' }). */
export function fill(template: string, values: Record<string, string> = {}): string {
	return template.replace(/\{(\w+)\}/g, (slot, name: string) => {
		if (name in values) {
			return values[name];
		}
		return slot;
	});
}
