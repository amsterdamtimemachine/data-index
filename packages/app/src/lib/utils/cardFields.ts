import type { Entity, PersonEntity, MediaObjectEntity, FeatureResult } from '@atm/shared/types';
import { formatDate, formatDateRange, formatDatasetTitle } from './format';
import { translate } from './translations';

/** One label:value row on a card. `href` turns the value into a link; `label` is a translate() key. */
export type FieldRow = { label: string; value: string; href?: string };

const isPerson = (e: Entity): e is PersonEntity => e.type === 'Person';
const isMedia = (e: Entity): e is MediaObjectEntity => e.type === 'MediaObject';

const withPlace = (date?: string, place?: string) =>
	date ? `${formatDate(date)}${place ? `, ${place}` : ''}` : translate('unknown');

type CardFieldSpec = {
	label: string;
	value: (entity: Entity) => string | null; // formatted value; null hides the row
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
};

/** Entity fields to render for the given mode (collapsed keeps only `summary` fields). */
export function resolveCardFields(entity: Entity, expanded: boolean): FieldRow[] {
	const specs = CARD_FIELDS[entity.type] ?? [];
	return specs
		.filter((s) => expanded || s.summary)
		.map((s) => ({ label: s.label, value: s.value(entity) }))
		.filter((f): f is FieldRow => f.value != null);
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
