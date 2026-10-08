import type { Entity, PersonEntity, MediaObjectEntity, CreativeWorkEntity, ScreeningEventEntity, TheaterEventEntity, ManuscriptEntity, FeatureResult } from '@atm/shared/types';
import { formatDate, formatPartialDate, formatPeriod, formatDatasetTitle } from './format';
import { translate } from './translations';

/**
 * One label:value row on a card, as text ready to print. `href` turns the value into
 * a link, `labelHref` the label.
 */
export type FieldRow = { label: string; value: string; href?: string; labelHref?: string };

const isPerson = (e: Entity): e is PersonEntity => e.type === 'Person';
const isMedia = (e: Entity): e is MediaObjectEntity => e.type === 'MediaObject';
const isCreativeWork = (e: Entity): e is CreativeWorkEntity => e.type === 'CreativeWork';
// a programme: a screening (a film on its bill) or a theatre event (acts only)
const isProgramme = (e: Entity): e is ScreeningEventEntity | TheaterEventEntity => e.type === 'ScreeningEvent' || e.type === 'TheaterEvent';
const isManuscript = (e: Entity): e is ManuscriptEntity => e.type === 'Manuscript';

/** The names of a story's mentions of one kind, joined; null when there are none. */
function mentionNames(entity: ManuscriptEntity, kind: 'Place' | 'Person' | 'Organization'): string | null {
	const names = entity.mentions.filter((m) => m.type === kind).map((m) => m.name);
	if (names.length === 0) {
		return null;
	}
	return names.join(', ');
}

/** An image's dating as the archive words it; else its dates, worded at their precision. */
function imageDating(entity: MediaObjectEntity): string {
	if (entity.dateText) {
		return entity.dateText;
	}
	if (!entity.dateCreated) {
		return translate('unknown');
	}
	const [start, end] = entity.dateCreated.split('/');
	if (end) {
		return formatPeriod(start, end);
	}
	return formatPartialDate(start);
}

const withPlace = (date?: string, place?: string) =>
	date ? `${formatDate(date)}${place ? `, ${place}` : ''}` : translate('unknown');

type CardFieldSpec = {
	// a translate() key
	label: string;
	// formatted value; null hides the row
	value: (entity: Entity) => string | null;
	// a link for the value
	href?: (entity: Entity) => string | undefined;
	// one row per item, for a field that repeats (the films on a bill); the label and value are per row
	rows?: (entity: Entity) => FieldRow[];
	summary?: boolean; // also show on the collapsed card, not just the expanded detail
};

// a programme's venue; its date is in the relation line, its bill the card's content (programmeBillRows)
const PROGRAMME_FIELDS: CardFieldSpec[] = [
	{ label: 'venue', value: (e) => (isProgramme(e) ? e.location.name : null), summary: true },
	{ label: 'programmeSource', value: (e) => (isProgramme(e) && e.citation ? e.citation.join(', ') : null) },
];

/**
 * The label:value fields each entity type exposes. This is the single place that
 * decides which fields exist and where they show: flip `summary` to surface a field
 * on the collapsed card, add an entry to introduce a new field. FieldList renders
 * whatever the resolvers below return, so layout never needs touching.
 */
const CARD_FIELDS: Partial<Record<Entity['type'], CardFieldSpec[]>> = {
	Person: [
		{ label: 'born', value: (e) => (isPerson(e) ? withPlace(e.birthDate, e.birthPlace) : null), summary: true },
		{ label: 'died', value: (e) => (isPerson(e) ? withPlace(e.deathDate, e.deathPlace) : null), summary: true },
	],
	// a text's date is the issue it appeared in
	CreativeWork: [
		{ label: 'published', value: (e) => (isCreativeWork(e) && e.dateCreated ? formatPartialDate(e.dateCreated) : null) },
	],
	MediaObject: [
		{ label: 'dating', value: (e) => (isMedia(e) ? imageDating(e) : null) },
		{ label: 'author', value: (e) => (isMedia(e) ? e.author || translate('unknown') : null) },
	],
	ScreeningEvent: PROGRAMME_FIELDS,
	TheaterEvent: PROGRAMME_FIELDS,
	Manuscript: [
		{ label: 'author', value: (e) => (isManuscript(e) ? e.author?.name ?? null : null), href: (e) => (isManuscript(e) ? e.author?.url : undefined), summary: true },
		{ label: 'diary', value: (e) => (isManuscript(e) ? e.isPartOf?.name ?? null : null), href: (e) => (isManuscript(e) ? e.isPartOf?.url : undefined) },
		{ label: 'archive', value: (e) => (isManuscript(e) ? e.isPartOf?.holdingArchive ?? null : null) },
		{ label: 'persons', value: (e) => (isManuscript(e) ? mentionNames(e, 'Person') : null) },
		// the places only when there are several: with one it repeats the card's place
		{ label: 'places', value: (e) => (isManuscript(e) && e.mentions.filter((m) => m.type === 'Place').length > 1 ? mentionNames(e, 'Place') : null) },
	],
};

/** Entity fields to render for the given mode (collapsed keeps only `summary` fields). */
export function resolveCardFields(entity: Entity, expanded: boolean): FieldRow[] {
	const specs = CARD_FIELDS[entity.type] ?? [];
	const fields: FieldRow[] = [];
	for (const spec of specs) {
		if (!expanded && !spec.summary) continue;
		if (spec.rows) {
			fields.push(...spec.rows(entity));
			continue;
		}
		const value = spec.value(entity);
		if (value == null) continue;
		const href = spec.href ? spec.href(entity) : undefined;
		fields.push({ label: translate(spec.label), value, href });
	}
	return fields;
}

/** An entity's subtype as a translate() key, shown in brackets after the record type; null without one. */
export function entitySubtype(entity: Entity | undefined): string | null {
	if (entity?.type === 'ScreeningEvent') {
		return 'screening';
	}
	if (entity?.type === 'TheaterEvent') {
		return 'performance';
	}
	return null;
}

/**
 * A heading for a bill of more than one item, worded from it: "3 films op het
 * programma", "2 films en 1 optreden op het programma". Null for a single item,
 * which the title already names.
 */
export function programmeBillHeading(entity: Entity | undefined): string | null {
	if (!entity || !isProgramme(entity)) {
		return null;
	}
	const films = entity.workPresented.length;
	const acts = (entity.performer ?? []).length;
	if (films + acts < 2) {
		return null;
	}
	const parts: string[] = [];
	if (films > 0) {
		parts.push(countWord(films, 'filmOne', 'filmMany'));
	}
	if (acts > 0) {
		parts.push(countWord(acts, 'actOne', 'actMany'));
	}
	return `${parts.join(` ${translate('and')} `)} ${translate('onTheProgramme')}`;
}

function countWord(count: number, one: string, many: string): string {
	if (count === 1) {
		return `${count} ${translate(one)}`;
	}
	return `${count} ${translate(many)}`;
}

/** A programme's bill as rows: its films, each linked to its page, then its acts, each in bill order. */
export function programmeBillRows(entity: Entity | undefined): FieldRow[] {
	if (!entity || !isProgramme(entity)) {
		return [];
	}
	const rows: FieldRow[] = [];
	for (const film of entity.workPresented) {
		rows.push({ label: translate('film'), value: film.name, href: film.url });
	}
	for (const act of entity.performer ?? []) {
		rows.push({ label: translate('performer'), value: act });
	}
	return rows;
}

/**
 * The line under a card's title: how the feature relates to its place, the place's
 * name as it was then with the current name after it when they differ, and the date
 * when it belongs to the relation ("Vertoond op Ceintuurbaan 338, 5 januari 1934").
 * Empty when the feature has neither a relation nor a place name.
 */
export function relationLine(feature: FeatureResult): string {
	const parts: string[] = [];
	if (feature.relationId) {
		parts.push(translate(feature.relationId));
	}
	const placeName = feature.historicalLabel || feature.displayName;
	if (placeName) {
		parts.push(placeName);
	}
	let line = parts.join(' ');
	if (feature.historicalLabel && feature.displayName && feature.historicalLabel !== feature.displayName) {
		line = `${line} (${translate('nowKnownAs')} ${feature.displayName})`;
	}
	if (feature.relationDated && feature.startDate && feature.endDate) {
		line = `${line}, ${formatPeriod(feature.startDate, feature.endDate)}`;
	}
	return line;
}

/**
 * What the feature is and where, as an expanded card's first rows: its type with the
 * subtype after a comma ("Evenement, vertoning"), and its place labelled by the place
 * type and linked to the place's own record, with today's name after an old one
 * ("Straat Keizersgragt (nu Keizersgracht)").
 */
export function identityFields(feature: FeatureResult): FieldRow[] {
	const rows: FieldRow[] = [];
	let type = translate(feature.recordType);
	const subtype = entitySubtype(feature.entity);
	if (subtype) {
		type = `${type}, ${translate(subtype)}`;
	}
	rows.push({ label: translate('type'), value: type });
	const placeName = feature.historicalLabel || feature.displayName;
	if (feature.placeType && placeName) {
		let value = placeName;
		if (feature.historicalLabel && feature.displayName && feature.historicalLabel !== feature.displayName) {
			value = `${placeName} (${translate('nowKnownAs')} ${feature.displayName})`;
		}
		rows.push({ label: translate(feature.placeType), value, href: feature.placeUrl });
	}
	return rows;
}

/**
 * Where the feature comes from: the dataset, linked to the item's own record; its
 * provider when that is someone else; the classifier models behind its tags; who
 * provides the place, and the line when another provider drew it. Detail only.
 */
export function dataSourceFields(feature: FeatureResult, expanded: boolean): FieldRow[] {
	if (!expanded) return [];
	const rows: FieldRow[] = [];
	if (feature.datasetLabel) {
		rows.push({ label: translate('source'), value: formatDatasetTitle(feature.datasetLabel), href: feature.url });
	}
	if (feature.providerLabel && feature.providerLabel !== feature.datasetLabel) {
		rows.push({ label: translate('dataProvider'), value: feature.providerLabel, href: feature.providerUrl });
	}
	for (const classifier of feature.classifiers ?? []) {
		rows.push({ label: translate('classifier'), value: classifier.label, href: classifier.url });
	}
	if (feature.placeProviderLabel) {
		rows.push({ label: translate('placeDataProvider'), value: feature.placeProviderLabel, href: feature.placeProviderUrl });
	}
	if (feature.geometryProviderLabel) {
		rows.push({ label: translate('geometryProvider'), value: feature.geometryProviderLabel, href: feature.geometryProviderUrl });
	}
	return rows;
}
