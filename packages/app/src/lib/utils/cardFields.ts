import type { Entity, PersonEntity, MediaObjectEntity, CreativeWorkEntity, ScreeningEventEntity, TheaterEventEntity, ManuscriptEntity, FeatureResult } from '@atm/shared/types';
import { formatPartialDate, formatPeriod, formatNowKnownAs } from './format';
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

/** A publication date worded at its precision; a start/end range worded as a period. */
function formatPublished(date: string): string {
	const [start, end] = date.split('/');
	if (end) {
		return formatPeriod(start, end);
	}
	return formatPartialDate(start);
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

/** A person's date worded at its precision, with the place after it: "20 april 1894, Amsterdam". */
function withPlace(date?: string, place?: string): string {
	if (!date) {
		return translate('unknown');
	}
	if (!place) {
		return formatPartialDate(date);
	}
	return `${formatPartialDate(date)}, ${place}`;
}

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
	{ label: 'venue', value: (e) => (isProgramme(e) ? e.location.name : null), href: (e) => (isProgramme(e) ? e.location.url : undefined), summary: true },
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
		{ label: 'published', value: (e) => (isCreativeWork(e) && e.datePublished ? formatPublished(e.datePublished) : null) },
	],
	MediaObject: [
		{ label: 'dating', value: (e) => (isMedia(e) ? imageDating(e) : null) },
		{ label: 'author', value: (e) => (isMedia(e) ? e.author || translate('unknown') : null) },
	],
	ScreeningEvent: PROGRAMME_FIELDS,
	TheaterEvent: PROGRAMME_FIELDS,
	Manuscript: [
		// the day, month or year the entry was written, as the annotators dated it
		{ label: 'written', value: (e) => (isManuscript(e) && e.dateCreated ? formatPartialDate(e.dateCreated) : null) },
		{ label: 'author', value: (e) => (isManuscript(e) ? e.author?.name ?? null : null), href: (e) => (isManuscript(e) ? e.author?.url : undefined), summary: true },
		{ label: 'diary', value: (e) => (isManuscript(e) ? e.isPartOf?.name ?? null : null), href: (e) => (isManuscript(e) ? e.isPartOf?.url : undefined) },
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

/** An entity's subtype as a translate() key, its most specific type; null without one. */
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
	const films = entity.bill.filter((item) => item.type === 'Movie').length;
	const acts = entity.bill.length - films;
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

/** A programme's bill as rows in the source's order: a film linked to its page, an act as worded. */
export function programmeBillRows(entity: Entity | undefined): FieldRow[] {
	if (!entity || !isProgramme(entity)) {
		return [];
	}
	const rows: FieldRow[] = [];
	for (const item of entity.bill) {
		if (item.type === 'Movie') {
			rows.push({ label: translate('film'), value: item.name, href: item.url });
		} else {
			rows.push({ label: translate('performer'), value: item.name });
		}
	}
	return rows;
}

/** The feature's most specific type: its subtype where it has one ("Filmvertoning"), else its record type ("Afbeelding"). */
export function typeLabel(feature: FeatureResult): string {
	const subtype = entitySubtype(feature.entity);
	if (subtype) {
		return translate(subtype);
	}
	return translate(feature.recordType);
}

/**
 * The line under a card's title, in parts so the place can be a link: the type, how
 * the feature relates to its place, the place's name as it was then (linked to the
 * place's own record) with today's name after it when they differ, and the date when
 * it belongs to the relation. "Filmvertoning • Vertoond op Ceintuurbaan 338, 5 januari 1934"
 */
export type RelationLine = {
	type: string;
	relation?: string;
	place?: string;
	placeHref?: string;
	// " (nu Dam)", when the name shown is an old one
	now?: string;
	// ", 5 januari 1934", when the date belongs to the relation
	date?: string;
};

export function relationLine(feature: FeatureResult): RelationLine {
	const line: RelationLine = { type: typeLabel(feature) };
	if (feature.relationId) {
		line.relation = translate(feature.relationId);
	}
	const placeName = feature.historicalLabel || feature.displayName;
	if (placeName) {
		line.place = placeName;
		line.placeHref = feature.placeUrl;
	}
	if (feature.historicalLabel && feature.displayName && feature.historicalLabel !== feature.displayName) {
		line.now = ` ${formatNowKnownAs(feature.displayName)}`;
	}
	if (feature.relationDated && feature.startDate && feature.endDate) {
		line.date = `, ${formatPeriod(feature.startDate, feature.endDate)}`;
	}
	return line;
}

/**
 * Where the feature comes from, below its dataset link at the card's top left: its
 * provider when that is someone else than the dataset; who provides the place, and
 * the line when another provider drew it; last, the classifier models behind its
 * tags. Detail only.
 */
export function dataSourceFields(feature: FeatureResult, expanded: boolean): FieldRow[] {
	if (!expanded) return [];
	const rows: FieldRow[] = [];
	if (feature.providerLabel && feature.providerLabel !== feature.datasetLabel) {
		rows.push({ label: translate('dataProvider'), value: feature.providerLabel, href: feature.providerUrl });
	}
	if (feature.placeProviderLabel) {
		rows.push({ label: translate('placeDataProvider'), value: feature.placeProviderLabel, href: feature.placeProviderUrl });
	}
	if (feature.geometryProviderLabel) {
		rows.push({ label: translate('geometryProvider'), value: feature.geometryProviderLabel, href: feature.geometryProviderUrl });
	}
	if (feature.datasetDistributionUrl) {
		rows.push({ label: translate('fullDataset'), value: new URL(feature.datasetDistributionUrl).host, href: feature.datasetDistributionUrl });
	}
	for (const classifier of feature.classifiers ?? []) {
		rows.push({ label: translate('classifier'), value: classifier.label, href: classifier.url });
	}
	return rows;
}
