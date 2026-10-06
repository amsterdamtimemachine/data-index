import type { Entity, PersonEntity, MediaObjectEntity, ScreeningEventEntity, EventSeriesEntity, ManuscriptEntity, VenueKind, GroupFeature, FeatureResult } from '@atm/shared/types';
import { VENUE_KIND_FALLBACK } from '@atm/shared/vocab';
import { formatDate, formatDateRange, formatPartialDate, formatDateInYear, formatDatasetTitle } from './format';
import { translate } from './translations';

/**
 * One label:value row on a card, as text ready to print. `href` turns the value into
 * a link, `labelHref` the label; `muted` grays the value.
 */
export type FieldRow = { label: string; value: string; href?: string; labelHref?: string; muted?: boolean };

const isPerson = (e: Entity): e is PersonEntity => e.type === 'Person';
const isMedia = (e: Entity): e is MediaObjectEntity => e.type === 'MediaObject';
const isScreening = (e: Entity): e is ScreeningEventEntity => e.type === 'ScreeningEvent';
const isSeries = (e: Entity): e is EventSeriesEntity => e.type === 'EventSeries';
const isManuscript = (e: Entity): e is ManuscriptEntity => e.type === 'Manuscript';

/** The names of a story's mentions of one kind, joined; null when there are none. */
function mentionNames(entity: ManuscriptEntity, kind: 'Place' | 'Person' | 'Organization'): string | null {
	const names = entity.mentions.filter((m) => m.type === kind).map((m) => m.name);
	if (names.length === 0) {
		return null;
	}
	return names.join(', ');
}

/** The translate() key naming a venue of this kind: "Bioscoop", or "Locatie" for the catch-all. */
function venueKindKey(kind: VenueKind): string {
	if (kind === VENUE_KIND_FALLBACK) {
		return 'venue';
	}
	return kind;
}

/** The translate() key for what a venue of this kind holds: screenings, performances, events. */
export function venueEventKey(kind: VenueKind): string {
	if (kind === 'MovieTheater') {
		return 'screenings';
	}
	if (kind === 'PerformingArtsTheater') {
		return 'performances';
	}
	return 'events';
}

/** A group's members over the period: the sum of its years. */
export function seriesMemberCount(series: EventSeriesEntity): number {
	let total = 0;
	for (const year of series.years) {
		total += year.count;
	}
	return total;
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
	MediaObject: [
		{ label: 'date', value: (e) => (isMedia(e) ? (e.dateCreated ? formatDateRange(e.dateCreated) : translate('unknown')) : null) },
		{ label: 'author', value: (e) => (isMedia(e) ? e.author || translate('unknown') : null) },
	],
	ScreeningEvent: [
		{ label: 'date', value: (e) => (isScreening(e) ? formatPartialDate(e.startDate) : null), summary: true },
		{ label: 'film', value: () => null, summary: true, rows: (e) => (isScreening(e) ? e.workPresented.map((m) => ({ label: 'film', value: m.name, href: m.url })) : []) },
		{ label: 'performer', value: (e) => (isScreening(e) ? e.performer ?? null : null), summary: true },
		{ label: 'citation', value: (e) => (isScreening(e) && e.citation ? e.citation.join(', ') : null) },
	],
	Manuscript: [
		{ label: 'author', value: (e) => (isManuscript(e) ? e.author?.name ?? null : null), href: (e) => (isManuscript(e) ? e.author?.url : undefined), summary: true },
		{ label: 'diary', value: (e) => (isManuscript(e) ? e.isPartOf?.name ?? null : null), href: (e) => (isManuscript(e) ? e.isPartOf?.url : undefined) },
		{ label: 'archive', value: (e) => (isManuscript(e) ? e.isPartOf?.holdingArchive ?? null : null) },
		{ label: 'persons', value: (e) => (isManuscript(e) ? mentionNames(e, 'Person') : null) },
		// the places only when there are several: with one it repeats the card's place
		{ label: 'places', value: (e) => (isManuscript(e) && e.mentions.filter((m) => m.type === 'Place').length > 1 ? mentionNames(e, 'Place') : null) },
	],
	EventSeries: [
		// the venue under its kind ("Bioscoop Passage"), then what it holds, counted over the period
		{ label: 'venue', value: () => null, summary: true, rows: (e) => (isSeries(e) ? [{ label: translate(venueKindKey(e.location.type)), value: e.location.name, href: e.location.url }] : []) },
		{ label: 'screenings', value: () => null, summary: true, rows: (e) => (isSeries(e) ? [{ label: translate(venueEventKey(e.location.type)), value: String(seriesMemberCount(e)) }] : []) },
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
export function entityKind(entity: Entity | undefined): string | null {
	if (!entity) {
		return null;
	}
	if (entity.type === 'ScreeningEvent' || entity.type === 'EventSeries') {
		return entity.location.type;
	}
	return null;
}

/**
 * A group's members as label:value rows: a programme's date is the label, linked to
 * its page, and the first film on its bill the value; the rest of the bill follows
 * under it with an empty label, each film linked to its own page, the acts gray. The
 * source's programme title is not shown, as the source's own pages do not show it.
 */
export function groupMemberRows(members: GroupFeature[]): FieldRow[] {
	const rows: FieldRow[] = [];
	for (const member of members) {
		const entity = member.entity;
		let date = formatDateInYear(member.startDate);
		const bill: FieldRow[] = [];
		if (entity && isScreening(entity)) {
			date = formatDateInYear(entity.startDate);
			for (const film of entity.workPresented) {
				bill.push({ label: '', value: film.name, href: film.url });
			}
			if (entity.performer) {
				bill.push({ label: '', value: entity.performer, muted: true });
			}
		}
		if (bill.length === 0) {
			bill.push({ label: '', value: '' });
		}
		bill[0] = { ...bill[0], label: date, labelHref: member.url };
		rows.push(...bill);
	}
	return rows;
}

/** Data-source rows (provider/dataset/place provider). Detail-only, so empty when collapsed. */
export function dataSourceFields(feature: FeatureResult, expanded: boolean): FieldRow[] {
	if (!expanded) return [];
	const rows: FieldRow[] = [];
	if (feature.organisationLabel) {
		rows.push({ label: translate('dataProvider'), value: feature.organisationLabel, href: feature.organisationUrl });
	}
	// Skip the dataset row when it just repeats the provider (e.g. Joods Monument).
	if (feature.datasetLabel && feature.datasetLabel !== feature.organisationLabel) {
		rows.push({ label: translate('dataset'), value: formatDatasetTitle(feature.datasetLabel), href: feature.datasetUrl });
	}
	if (feature.placeProviderLabel && feature.placeProviderUrl) {
		rows.push({ label: translate('placeDataProvider'), value: feature.placeProviderLabel, href: feature.placeProviderUrl });
	}
	// Only set when the geometry came from a different provider than the place
	// (e.g. an Adamlink street whose line was backfilled from NWB).
	if (feature.geometryProviderLabel) {
		rows.push({ label: translate('geometrySource'), value: feature.geometryProviderLabel, href: feature.geometryUrl });
	}
	return rows;
}
