import type { RecordType } from '@atm/shared/types';

// Content type translations: English (server/API) → Dutch (UI display)
const CONTENT_TYPE_TRANSLATIONS: Record<string, string> = {
	image: 'Afbeelding',
	person: 'Persoon',
	text: 'Tekst'
} as const;

// Reverse mapping: Dutch (UI display) → English (server/API) 
const REVERSE_CONTENT_TYPE_TRANSLATIONS: Record<string, string> = Object.fromEntries(
	Object.entries(CONTENT_TYPE_TRANSLATIONS).map(([english, dutch]) => [dutch, english])
);

/**
 * Translate English content type to Dutch for UI display
 */
export function translateContentType(englishType: string): string {
	return CONTENT_TYPE_TRANSLATIONS[englishType] || englishType;
}

/**
 * Translate Dutch content type back to English for API calls
 */
export function reverseTranslateContentType(dutchType: string): string {
	return REVERSE_CONTENT_TYPE_TRANSLATIONS[dutchType] || dutchType;
}

/**
 * Translate array of English content types to Dutch
 */
export function translateContentTypes(englishTypes: string[]): string[] {
	return englishTypes.map(translateContentType);
}

/**
 * Translate array of Dutch content types back to English
 */
export function reverseTranslateContentTypes(dutchTypes: string[]): string[] {
	return dutchTypes.map(reverseTranslateContentType);
}

/**
 * Create translated content type objects with both keys for easy handling
 */
export function createTranslatedContentTypes(englishTypes: RecordType[]) {
	return englishTypes.map(type => ({
		key: type,                        // English for API calls
		label: translateContentType(type) // Dutch for display
	}));
}

// Dataset/source translations: source ID → Dutch display label
const DATASET_TRANSLATIONS: Record<string, string> = {
	beeldbank: 'Beeldbank',
	'joods-monument': 'Joods Monument'
} as const;

const REVERSE_DATASET_TRANSLATIONS: Record<string, string> = Object.fromEntries(
	Object.entries(DATASET_TRANSLATIONS).map(([id, label]) => [label, id])
);

/**
 * Translate source ID to Dutch label for UI display
 */
export function translateDataset(sourceId: string): string {
	return DATASET_TRANSLATIONS[sourceId] || sourceId;
}

/**
 * Translate Dutch dataset label back to source ID
 */
export function reverseTranslateDataset(label: string): string {
	return REVERSE_DATASET_TRANSLATIONS[label] || label;
}

/**
 * Translate array of source IDs to Dutch labels
 */
export function translateDatasets(sourceIds: string[]): string[] {
	return sourceIds.map(translateDataset);
}

/**
 * Translate array of Dutch dataset labels back to source IDs
 */
export function reverseTranslateDatasets(labels: string[]): string[] {
	return labels.map(reverseTranslateDataset);
}

// Relation translations: English (server/API) → Dutch (UI display)
const RELATION_TRANSLATIONS: Record<string, string> = {
	isAbout: 'Gaat over',
	hadLastLivingLocation: 'Laatste woonadres'
} as const;

/**
 * Translate English relation ID to Dutch for UI display
 */
export function translateRelation(relationId: string): string {
	return RELATION_TRANSLATIONS[relationId] || relationId;
}

// Error message translations: English → Dutch
const ERROR_MESSAGE_TRANSLATIONS: Record<string, string> = {
	'Invalid Content Type Removed': 'Ongeldig inhoudstype verwijderd',
	'Invalid Input': 'Ongeldige invoer',
	'Period Not Found': 'Periode niet gevonden',
	'Invalid Cell': 'Ongeldige cel'
} as const;

/**
 * Translate error titles to Dutch
 */
export function translateErrorTitle(englishTitle: string): string {
	return ERROR_MESSAGE_TRANSLATIONS[englishTitle] || englishTitle;
}

/**
 * Translate error messages with content type placeholders to Dutch
 */
export function translateErrorMessage(englishMessage: string): string {
	// Common validation message patterns
	const translations = {
		'is not a valid content type and was removed from your selection': 'is geen geldig inhoudstype en is verwijderd uit uw selectie',
		'No valid content types found. Defaulting to all content types': 'Geen geldige inhoudstypes gevonden. Standaard ingesteld op alle inhoudstypes',
		'invalid format. Expected YYYY_YYYY': 'ongeldig formaat. Verwacht YYYY_YYYY',
		'Defaulting to most recent period': 'Standaard ingesteld op meest recente periode',
		'invalid range. Start year must be less than end year': 'ongeldig bereik. Beginjaar moet kleiner zijn dan eindjaar',
		'spans': 'beslaat',
		'years. Maximum 50 years supported': 'jaar. Maximaal 50 jaar ondersteund',
		"doesn't exist in the dataset. Defaulting to most recent period": 'bestaat niet in de dataset. Standaard ingesteld op meest recente periode',
		'not found. Please select a valid cell from the map': 'niet gevonden. Selecteer een geldige cel op de kaart'
	};

	let translatedMessage = englishMessage;

	// Apply translations for common patterns
	Object.entries(translations).forEach(([english, dutch]) => {
		translatedMessage = translatedMessage.replace(english, dutch);
	});

	return translatedMessage;
}