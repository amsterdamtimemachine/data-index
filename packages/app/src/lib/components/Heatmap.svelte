<script lang="ts">
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { onMount, onDestroy, untrack } from 'svelte';
	import { env } from '$env/dynamic/public';
	// v6 is ESM-only with no default export — namespace import for maplibre.Map / .StyleSpecification.
	import * as maplibre from 'maplibre-gl';
	import type { Map as MapLibreMap } from 'maplibre-gl';
	// v6 builds its worker URL dynamically (new URL(`./${name}`, import.meta.url)), which bundlers
	// can't statically emit — so the file 404s in production. Hand Vite the worker explicitly and
	// point maplibre at it. ?worker&url (not plain ?url) bundles the shared-chunk sibling in, so the
	// emitted worker is self-contained.
	import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
	maplibre.setWorkerUrl(maplibreWorkerUrl);

	const tileSourceUrl = env.PUBLIC_TILE_SOURCE_URL || 'https://tiles.openfreemap.org/planet';
	const BASE_STYLE: maplibre.StyleSpecification = {
		version: 8,
		sources: {
			openmaptiles: {
				type: 'vector',
				url: tileSourceUrl
			}
		},
		layers: []
	};
	import type { FeatureCollection, Feature, Polygon, GeoJsonProperties } from 'geojson';
	import type { Heatmap, HeatmapDimensions, Coordinates } from '@atm/shared/types';
	import { generateCellIdMap, generateCellGeometries, calculateDensity, placeOutlineGeometry, cellIdAtLonLat, staleCells, type CellGeometry } from '$utils/heatmap';
	import { mergeCss } from '$utils/utils';
	import { MOBILE_QUERY, HOVER_QUERY } from '$utils/media.svelte';
	import resolveConfig from 'tailwindcss/resolveConfig';
	import tailwindConfig from '$tailwindConfig';

	interface CellProperties {
		id: string;
		row: number;
		col: number;
		count: number;
		[key: string]: any; // Allow additional GeoJSON properties
	}

	export interface MapStyle {
		boundsPanningOffsetLat: number; // in degrees
		boundsPanningOffsetLon: number; // in degrees
		minZoom: number;
		maxZoom: number;
		defaultZoom: number;
		defaultZoomMobile: number; // phones start zoomed out to show the whole city
		center: Coordinates;
		cellSelectedOutlineColor: string; // hex
		cellSelectedOutlineWidth: number; // px
		cellHoveredOutlineColor: string; //hex
		cellHoveredOutlineOpacity: number; // 0.0 - 1.0
		cellValueColor: string; // hex
		outlineLayerColor: string; // hex
		placeOutlineWidth: number; // px, thicker than the cell selection so both read when they overlap
		placeOutlineCasingColor: string; // hex, darker band under the place outline
		cellSelectedCasingColor: string; // hex, darker band under the cell selection
		outlineCasingExtra: number; // px added around a cased line
		backgroundColor: string; // hex
		waterFillColor: string; // hex
		waterOutlineColor: string; // hex
		waterOutlineWidth: number; // px
		waterOutlineOpacity: number; // 0.0 - 1.0
		transportationColor: string; // hex
		transportationOpacity: number; // 0.0 - 1.0
		transportationOutlineWidth: number; // px
	}

	export interface MapProps {
		heatmap: Heatmap;
		dimensions: HeatmapDimensions;
		selectedCellId: string | null;
		// display-cell indices of the selected place (the gold outline)
		placeCells?: number[];
		// screen space the nav and the panel cover: the camera centres and fits within
		// the strip between them, and eases there when the padding changes
		padding?: { left: number; right: number };
		// the place is the panel's active subject: add the red selection outline
		placeSelected?: boolean;
		mapStyle?: MapStyle;
		class?: string;
		handleCellClick?: (cellId: string | null) => void;
		handleMapLoaded?: () => void;
	}

	const twConfig = resolveConfig(tailwindConfig);
	const TOOLTIP_OFFSET_PX = 8; // gap between the cursor and the tooltip
	const colors = twConfig.theme.colors as unknown as Record<string, string>;

	const defaultMapStyle: MapStyle = {
		boundsPanningOffsetLat: 0.15,
		boundsPanningOffsetLon: 0.3,
		minZoom: 11,
		maxZoom: 14,
		defaultZoom: 12,
		defaultZoomMobile: 11,
		center: { lon: 4.895645, lat: 52.372219 },
		cellSelectedOutlineColor: colors['atm-red'],
		cellHoveredOutlineColor: colors['map-selected-outline-casing'],
		cellHoveredOutlineOpacity: 0.8,
		cellSelectedOutlineWidth: 3,
		cellValueColor: colors['map-cell-value'],
		outlineLayerColor: colors['map-place-outline'],
		placeOutlineWidth: 5,
		placeOutlineCasingColor: colors['map-place-outline-casing'],
		cellSelectedCasingColor: colors['map-selected-outline-casing'],
		outlineCasingExtra: 4,
		backgroundColor: colors['map-background'],
		waterFillColor: colors['map-water-fill'],
		waterOutlineColor: colors['map-water-outline'],
		waterOutlineWidth: 0.75,
		waterOutlineOpacity: 0.8,
		transportationColor: colors['map-transporation-outline'],
		transportationOpacity: 0.8,
		transportationOutlineWidth: 0.75
	};

	let {
		heatmap,
		dimensions,
		selectedCellId = null,
		placeCells = undefined,
		padding = { left: 0, right: 0 },
		placeSelected = false,
		class: className,
		mapStyle = defaultMapStyle,
		handleCellClick,
		handleMapLoaded
	}: MapProps = $props();

	let map: MapLibreMap | undefined = $state();
	let cellGeometries: CellGeometry[] = [];
	let cellById = new Map<string, CellGeometry>();
	// active cells of the previous heatmap, so a change only writes the cells that moved
	let previousActive = new Set<string>();
	let mapContainer: HTMLElement;
	let isMapLoaded = $state(false);
	let hoverTooltip = $state<{ x: number; y: number; count: number; cellId: string } | null>(null);

	const cellIdMap = $derived.by(() => {
		if (!dimensions) return new Map<number, string>();
		return generateCellIdMap(dimensions);
	});

	let activeCells = $derived.by(() => {
		if (!isMapLoaded || !map || !heatmap || !heatmap.indices || !cellIdMap.size) {
			return new Map<string, { value: number; count: number }>();
		}

		const { indices, counts } = heatmap;
		const maxCount = Math.max(...counts, 0);
		const result = new Map<string, { value: number; count: number }>();

		for (let j = 0; j < indices.length; j++) {
			const cellIndex = indices[j];
			const cellId = cellIdMap.get(cellIndex);
			if (cellId) {
				result.set(cellId, {
					value: calculateDensity(counts[j], maxCount),
					count: counts[j]
				});
			}
		}

		return result;
	});

	// Update heatmap cells when active cells change
	$effect(() => {
		if (!isMapLoaded || !map || !dimensions) return;
		applyActiveCells();
	});

	// The camera's motions: 520ms, and never a zoom change.
	const EASE_MS = 520;
	const REVEAL_MARGIN_PX = 24;

	type PixelBox = { minX: number; maxX: number; minY: number; maxY: number };

	// the panel's subject as cells: the open place's, else the selected cell
	function subjectCells(): CellGeometry[] {
		if (placeSelected && placeCells) {
			return placeCells.map((idx) => cellGeometries[idx]).filter((cell) => cell !== undefined);
		}
		if (selectedCellId) {
			const cell = cellById.get(selectedCellId);
			if (cell) {
				return [cell];
			}
		}
		return [];
	}

	// screen box of the cells, shifted by what a pending padding change will move them
	function projectCells(cells: CellGeometry[], shiftX: number): PixelBox | null {
		if (!map || cells.length === 0) return null;
		const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
		for (const cell of cells) {
			for (const [lon, lat] of cell.coordinates[0]) {
				const p = map.project([lon, lat]);
				box.minX = Math.min(box.minX, p.x + shiftX);
				box.maxX = Math.max(box.maxX, p.x + shiftX);
				box.minY = Math.min(box.minY, p.y);
				box.maxY = Math.max(box.maxY, p.y);
			}
		}
		return box;
	}

	// pixels to pan so a span clears its edges; a span too large to fit is centred
	function axisOverflow(min: number, max: number, lo: number, hi: number): number {
		if (max - min > hi - lo) {
			return (min + max) / 2 - (lo + hi) / 2;
		}
		if (min < lo) {
			return min - lo;
		}
		if (max > hi) {
			return max - hi;
		}
		return 0;
	}

	// pixels to pan so the box lies in the strip between the paddings and the edges
	function overflow(box: PixelBox, pad: { left: number; right: number }): [number, number] {
		const container = map!.getContainer();
		const dx = axisOverflow(box.minX, box.maxX, pad.left + REVEAL_MARGIN_PX, container.clientWidth - pad.right - REVEAL_MARGIN_PX);
		const dy = axisOverflow(box.minY, box.maxY, REVEAL_MARGIN_PX, container.clientHeight - REVEAL_MARGIN_PX);
		return [Math.round(dx), Math.round(dy)];
	}

	// Padding changes when the nav or the panel opens or closes: one motion eases the
	// camera to the new padding and, in the same move, pans the subject into the new
	// strip. Before the first render the padding is set without motion.
	$effect(() => {
		const target = { top: 0, bottom: 0, left: padding.left, right: padding.right };
		if (!map) return;
		const applied = map.getPadding();
		const current = { left: applied.left ?? 0, right: applied.right ?? 0 };
		if (current.left === target.left && current.right === target.right) return;
		if (!isMapLoaded) {
			map.jumpTo({ padding: target });
			return;
		}
		const options: maplibre.EaseToOptions = { padding: target, duration: EASE_MS };
		// the padding alone shifts the content by half its change
		const shiftX = ((target.left - current.left) - (target.right - current.right)) / 2;
		const box = untrack(() => projectCells(subjectCells(), shiftX));
		if (box) {
			const [dx, dy] = overflow(box, target);
			if (dx !== 0 || dy !== 0) {
				const centre = map.project(map.getCenter());
				options.center = map.unproject([centre.x + dx, centre.y + dy]);
			}
		}
		map.easeTo(options);
	});

	// A new subject pans into view, just far enough; while a motion runs it waits for
	// the end, so two motions never interrupt each other.
	function revealSubject(): void {
		if (!map || !isMapLoaded) return;
		if (map.isMoving()) {
			map.once('moveend', revealSubject);
			return;
		}
		const box = projectCells(subjectCells(), 0);
		if (!box) return;
		const [dx, dy] = overflow(box, untrack(() => padding));
		if (dx === 0 && dy === 0) return;
		map.panBy([dx, dy], { duration: EASE_MS });
	}

	$effect(() => {
		if (!isMapLoaded) return;
		revealSubject();
	});

	// The red selection outline follows whether the place is the active subject
	$effect(() => {
		if (!isMapLoaded || !map) return;
		let visibility: 'visible' | 'none' = 'none';
		if (placeSelected) {
			visibility = 'visible';
		}
		if (map.getLayer('place-selected')) {
			map.setLayoutProperty('place-selected', 'visibility', visibility);
		}
	});

	// Sync the place outline with the selected place's cells
	$effect(() => {
		if (!isMapLoaded || !map || !dimensions) return;
		const source = map.getSource('place-outline') as maplibre.GeoJSONSource | undefined;
		if (!source) return;
		let cells: number[] = [];
		if (placeCells) {
			cells = placeCells;
		}
		source.setData(placeOutlineGeometry(cells, cellGeometries, dimensions.colsAmount));
	});

	// Handle selected cell changes - THIS FIXES THE HIGHLIGHTING ISSUE
	$effect(() => {
		if (isMapLoaded && map) {
			updateSelectedCell(selectedCellId);
		}
	});

	onMount(() => {
		initializeMap();
	});

	onDestroy(() => {
		if (map) {
			// Remove the map instance which cleans up all event listeners
			map.remove();
		}
	});

	function applyActiveCells(): void {
		if (!map) return;
		const mapInstance = map;
		for (const id of staleCells(previousActive, activeCells)) {
			mapInstance.setFeatureState({ source: 'heatmap', id }, { value: 0, count: 0 });
		}
		activeCells.forEach((stateValues, cellId) => {
			mapInstance.setFeatureState({ source: 'heatmap', id: cellId }, stateValues);
		});
		previousActive = new Set(activeCells.keys());
	}

	// One cell as a source's whole data set (selection, hover), or empty
	function cellCollection(cell: CellGeometry | undefined): FeatureCollection<Polygon> {
		if (!cell) {
			return { type: 'FeatureCollection', features: [] };
		}
		return {
			type: 'FeatureCollection',
			features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: cell.coordinates } }]
		};
	}

	function generateHeatmapCells(
		dims: HeatmapDimensions
	): FeatureCollection<Polygon, CellProperties> {
		// Generate geometries on-the-fly using client-side calculation.
		// PUBLIC_EXACT_CELLS=true reprojects cells to their true RD footprint (proj4),
		// removing the ~0.4° rotation skew; default draws axis-aligned lon/lat rects.
		cellGeometries = generateCellGeometries(dims, env.PUBLIC_EXACT_CELLS === 'true');
		cellById = new Map(cellGeometries.map((cell) => [cell.cellId, cell]));
		previousActive = new Set();

		const features = cellGeometries.map(
			(cell): Feature<Polygon, CellProperties> => ({
				type: 'Feature',
				id: cell.cellId,
				properties: {
					id: cell.cellId,
					row: cell.row,
					col: cell.col,
					count: 0
				},
				geometry: {
					type: 'Polygon',
					coordinates: cell.coordinates
				}
			})
		);

		return {
			type: 'FeatureCollection',
			features
		};
	}

	function updateSelectedCell(cellId: string | null): void {
		if (!isMapLoaded || !map) return;
		const source = map.getSource('selection') as maplibre.GeoJSONSource | undefined;
		if (!source) return;
		let cell: CellGeometry | undefined = undefined;
		if (cellId) {
			cell = cellById.get(cellId);
		}
		source.setData(cellCollection(cell));
	}

	function initializeMap(): void {
		if (!mapContainer) return;

		const { minLon: west, maxLon: east, minLat: south, maxLat: north } = dimensions;

		// once at init — a later resize must not change the user's zoom
		let initialZoom = mapStyle.defaultZoom;
		if (window.matchMedia(MOBILE_QUERY).matches) {
			initialZoom = mapStyle.defaultZoomMobile;
		}

		map = new maplibre.Map({
			container: mapContainer,
			style: BASE_STYLE,
			maxBounds: [
				[west - mapStyle.boundsPanningOffsetLon, south - mapStyle.boundsPanningOffsetLat],
				[east + mapStyle.boundsPanningOffsetLon, north + mapStyle.boundsPanningOffsetLat]
			],
			center: [mapStyle.center.lon, mapStyle.center.lat],
			minZoom: mapStyle.minZoom,
			maxZoom: mapStyle.maxZoom,
			zoom: initialZoom,
			dragRotate: false,
			// pinch-zoom is the only zoom path on touch devices; rotation stays locked below
			touchZoomRotate: true,
			touchPitch: false,
			dragPan: true,
			keyboard: true,
			scrollZoom: true
		});
		map.touchZoomRotate.disableRotation();

		map.on('load', () => {
			if (!map || !dimensions) return; // Guard for TypeScript
			const mapInstance = map;

			// Heatmap geometry - generate from dimensions
			const geojsonData = generateHeatmapCells(dimensions);

			// Add background layer with custom color
			mapInstance.addLayer({
				id: 'background',
				type: 'background',
				paint: {
					'background-color': mapStyle.backgroundColor
				}
			});

			// maxzoom on every GeoJSON source: the map is capped at maxZoom, so tiles
			// beyond it would only cost worker time on each setData
			mapInstance.addSource('heatmap', {
				type: 'geojson',
				data: geojsonData,
				promoteId: 'id',
				maxzoom: mapStyle.maxZoom
			});

			// Add water fill layer
			mapInstance.addLayer({
				id: 'heatmap-water-fill',
				type: 'fill',
				source: 'openmaptiles',
				'source-layer': 'water',
				paint: {
					'fill-color': mapStyle.waterFillColor
				}
			});

			// Color and opacity of the heatmaps cells
			mapInstance.addLayer({
				id: 'heatmap-squares',
				type: 'fill',
				source: 'heatmap',
				paint: {
					'fill-color': mapStyle.cellValueColor,
					'fill-opacity': ['coalesce', ['feature-state', 'value'], 0]
				}
			});

			// Add water outline layer
			mapInstance.addLayer({
				id: 'heatmap-water-outlines',
				type: 'line',
				source: 'openmaptiles',
				'source-layer': 'water',
				paint: {
					'line-color': mapStyle.waterOutlineColor,
					'line-width': mapStyle.waterOutlineWidth,
					'line-opacity': mapStyle.waterOutlineOpacity
				}
			});

			// Add transportation layer (roads)
			mapInstance.addLayer({
				id: 'transportation',
				type: 'line',
				source: 'openmaptiles',
				'source-layer': 'transportation',
				layout: { visibility: 'visible' },
				filter: [
					'all',
					['==', ['geometry-type'], 'LineString'],
					[
						'match',
						['get', 'class'],
						['motorway', 'primary', 'secondary', 'tertiary', 'trunk'],
						true,
						false
					]
				],
				paint: {
					'line-color': mapStyle.transportationColor,
					'line-opacity': mapStyle.transportationOpacity,
					'line-width': mapStyle.transportationOutlineWidth
				}
			});

			// Place-filter outline: gold perimeter, under the red cell selection
			mapInstance.addSource('place-outline', {
				type: 'geojson',
				data: placeOutlineGeometry([], cellGeometries, dimensions.colsAmount),
				maxzoom: mapStyle.maxZoom
			});
			mapInstance.addLayer({
				id: 'place-outline-casing',
				type: 'line',
				source: 'place-outline',
				// square caps: the perimeter is independent edge segments, and butt caps
				// leave unpainted notches where two meet at a corner
				layout: { 'line-cap': 'square' },
				paint: {
					'line-color': mapStyle.placeOutlineCasingColor,
					'line-width': mapStyle.placeOutlineWidth + mapStyle.outlineCasingExtra
				}
			});
			mapInstance.addLayer({
				id: 'place-outline',
				type: 'line',
				source: 'place-outline',
				layout: { 'line-cap': 'square' },
				paint: {
					'line-color': mapStyle.outlineLayerColor,
					'line-width': mapStyle.placeOutlineWidth
				}
			});

			// Red selection core inside the gold band while the place is the panel's
			// subject; the gold outline itself is the contrast ring, so no casing.
			mapInstance.addLayer({
				id: 'place-selected',
				type: 'line',
				source: 'place-outline',
				layout: { 'line-cap': 'square', visibility: 'none' },
				paint: {
					'line-color': mapStyle.cellSelectedOutlineColor,
					'line-width': mapStyle.cellSelectedOutlineWidth
				}
			});

			// Selection and hover each get a one-cell source: a line layer over the whole
			// grid would tessellate every cell's outline each frame, invisible or not
			mapInstance.addSource('selection', {
				type: 'geojson',
				data: cellCollection(undefined),
				maxzoom: mapStyle.maxZoom
			});
			mapInstance.addSource('hover', {
				type: 'geojson',
				data: cellCollection(undefined),
				maxzoom: mapStyle.maxZoom
			});

			// Active cell
			mapInstance.addLayer({
				id: 'selected-cell-casing',
				type: 'line',
				source: 'selection',
				paint: {
					'line-color': mapStyle.cellSelectedCasingColor,
					'line-width': mapStyle.cellSelectedOutlineWidth + mapStyle.outlineCasingExtra
				}
			});
			mapInstance.addLayer({
				id: 'selected-cell',
				type: 'line',
				source: 'selection',
				paint: {
					'line-color': mapStyle.cellSelectedOutlineColor,
					'line-width': mapStyle.cellSelectedOutlineWidth
				}
			});

			// Hover cell
			mapInstance.addLayer({
				id: 'hovered-cell',
				type: 'line',
				source: 'hover',
				paint: {
					'line-color': mapStyle.cellHoveredOutlineColor,
					'line-width': mapStyle.cellSelectedOutlineWidth,
					'line-opacity': mapStyle.cellHoveredOutlineOpacity
				}
			});

			// Event handlers
			let hoveredFeatureId: string | null = null;
			const exactCells = env.PUBLIC_EXACT_CELLS === 'true';

			function clearHover(): void {
				if (hoveredFeatureId) {
					hoveredFeatureId = null;
					const source = mapInstance.getSource('hover') as maplibre.GeoJSONSource;
					source.setData(cellCollection(undefined));
				}
				mapInstance.getCanvas().style.cursor = '';
				hoverTooltip = null;
			}

			// MapLibre synthesises mousemove from taps, and a finger never "leaves"
			const hoverCapable = window.matchMedia(HOVER_QUERY).matches;

			// A plain map listener, not a layer-scoped one: the layer variant hit-tests
			// every rendered cell on each event; the cell is arithmetic from the cursor
			if (hoverCapable) mapInstance.on('mousemove', (e) => {
				if (mapInstance.isMoving()) return;
				const cellId = cellIdAtLonLat(e.lngLat.lng, e.lngLat.lat, dimensions, exactCells);
				if (cellId === hoveredFeatureId) {
					// same cell: only the tooltip follows the cursor
					if (hoverTooltip) {
						hoverTooltip = { ...hoverTooltip, x: e.point.x, y: e.point.y };
					}
					return;
				}
				let count = 0;
				if (cellId) {
					const state = mapInstance.getFeatureState({ source: 'heatmap', id: cellId });
					if (typeof state.count === 'number') {
						count = state.count;
					}
				}
				if (!cellId || count === 0) {
					if (hoveredFeatureId) {
						clearHover();
					}
					return;
				}
				hoveredFeatureId = cellId;
				const source = mapInstance.getSource('hover') as maplibre.GeoJSONSource;
				source.setData(cellCollection(cellById.get(cellId)));
				mapInstance.getCanvas().style.cursor = 'pointer';
				hoverTooltip = { x: e.point.x, y: e.point.y, count, cellId };
			});

			if (hoverCapable) {
				mapInstance.on('mouseout', clearHover);
				// nothing stale rides along a pan or zoom
				mapInstance.on('movestart', clearHover);
			}

			mapInstance.on('click', 'heatmap-squares', (e) => {
				// hybrid devices pass the hover gate; a tap must not strand the tooltip
				hoverTooltip = null;
				if (e.features?.[0]) {
					const feature = e.features[0];
					const featureId = feature.properties.id;
					const featureState = mapInstance.getFeatureState({ source: 'heatmap', id: featureId });

					// select only cells with values
					if (featureState.count > 0) {
						// deselect the currently selected cell if its clicked
						if (featureId === selectedCellId) {
							if (handleCellClick) {
								handleCellClick(null);
							}
						} else {
							// parent callback
							if (handleCellClick) {
								handleCellClick(feature.properties.id);
							}
						}
					}
				}
			});

			isMapLoaded = true;

			if (handleMapLoaded) {
				handleMapLoaded();
			}
		});
	}
</script>

<div class={mergeCss('h-full w-full relative', className)}>
	<div bind:this={mapContainer} class="h-full w-full"></div>

	<!-- Hover tooltip -->
	{#if hoverTooltip}
		{@const featuresText = hoverTooltip.count === 1 ? 'feature' : 'features'}
		<div
			class="absolute z-50 bg-black bg-opacity-80 text-white px-2 py-1 rounded text-sm pointer-events-none transform -translate-x-1/2 -translate-y-full"
			style="left: {hoverTooltip.x}px; top: {hoverTooltip.y - TOOLTIP_OFFSET_PX}px;"
		>
			<div class="font-medium">{hoverTooltip.count} {featuresText}</div>
			<div class="text-xs opacity-75">Cel: {hoverTooltip.cellId}</div>
		</div>
	{/if}
</div>
