import type { Entity, PersonEntity, MediaObjectEntity, ScreeningEventEntity, EventSeriesEntity, VenueEntity, GroupFeature, FeatureResult } from '@atm/shared/types';
import { formatDate, formatDateRange, formatPartialDate, formatDateInYear, formatDatasetTitle } from './format';
import { translate } from './translations';

/**
 * One label:value row on a card. `href` turns the value into a link, `labelHref` the
 * label. The label is a translate() key unless `literalLabel` says it is text already.
 * `muted` grays the value.
 */
export type FieldRow = { label: string; value: string; href?: string; labelHref?: string; literalLabel?: boolean; muted?: boolean };

const isPerson = (e: Entity): e is PersonEntity => e.type === 'Person';
const isMedia = (e: Entity): e is MediaObjectEntity => e.type === 'MediaObject';
const isScreening = (e: Entity): e is ScreeningEventEntity => e.type === 'ScreeningEvent';
const isSeries = (e: Entity): e is EventSeriesEntity => e.type === 'EventSeries';

function venueLabel(venue: VenueEntity): string {
	if (venue.type === 'EventVenue') {
		return 'venue';
	}
	return venue.type;
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
	EventSeries: [
		// the venue, labelled by its kind from the data ("Bioscoop Passage"); the catch-all kind reads as venue
		{ label: 'venue', value: () => null, summary: true, rows: (e) => (isSeries(e) ? [{ label: venueLabel(e.location), value: e.location.name, href: e.location.url }] : []) },
		{ label: 'screenings', value: (e) => (isSeries(e) ? String(seriesMemberCount(e)) : null), summary: true },
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
		fields.push({ label: spec.label, value, href });
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
				bill.push({ label: '', value: film.name, href: film.url, literalLabel: true });
			}
			if (entity.performer) {
				bill.push({ label: '', value: entity.performer, literalLabel: true, muted: true });
			}
		}
		if (bill.length === 0) {
			bill.push({ label: '', value: '', literalLabel: true });
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
		rows.push({ label: 'dataProvider', value: feature.organisationLabel, href: feature.organisationUrl });
	}
	// Skip the dataset row when it just repeats the provider (e.g. Joods Monument).
	if (feature.datasetLabel && feature.datasetLabel !== feature.organisationLabel) {
		rows.push({ label: 'dataset', value: formatDatasetTitle(feature.datasetLabel), href: feature.datasetUrl });
	}
	if (feature.placeProviderLabel && feature.placeProviderUrl) {
		rows.push({ label: 'placeDataProvider', value: feature.placeProviderLabel, href: feature.placeProviderUrl });
	}
	// Only set when the geometry came from a different provider than the place
	// (e.g. an Adamlink street whose line was backfilled from NWB).
	if (feature.geometryProviderLabel) {
		rows.push({ label: 'geometrySource', value: feature.geometryProviderLabel, href: feature.geometryUrl });
	}
	return rows;
}
