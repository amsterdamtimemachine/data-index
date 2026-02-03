<script lang="ts">
	import { PUBLIC_MAPTILER_API_KEY } from '$env/static/public';
	const STYLE_URL = `https://api.maptiler.com/maps/8b292bff-5b9a-4be2-aaea-22585e67cf10/style.json?key=${PUBLIC_MAPTILER_API_KEY}`;
	import 'maplibre-gl/dist/maplibre-gl.css';
	import { onMount, onDestroy } from 'svelte';
	import maplibre, { type Map as MapLibreMap } from 'maplibre-gl';
	import type { FeatureCollection, Feature, Polygon, GeoJsonProperties } from 'geojson';
	import type { Heatmap, HeatmapDimensions, Coordinates } from '@atm/shared/types';
	import { generateCellIdMap, generateCellGeometries, calculateDensity } from '$utils/heatmap';
	import { mergeCss } from '$utils/utils';
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
		center: Coordinates;
		cellSelectedOutlineColor: string; // hex
		cellSelectedOutlineWidth: number; // px
		cellHoveredOutlineColor: string; //hex
		cellValueColor: string; // hex
		outlineLayerColor: string; // hex
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
		mapStyle?: MapStyle;
		class?: string;
		handleCellClick?: (cellId: string | null) => void;
		handleMapLoaded?: () => void;
	}

	const twConfig = resolveConfig(tailwindConfig);
	const colors = twConfig.theme.colors as unknown as Record<string, string>;

	const defaultMapStyle: MapStyle = {
		boundsPanningOffsetLat: 0.15,
		boundsPanningOffsetLon: 0.3,
		minZoom: 11,
		maxZoom: 14,
		defaultZoom: 12,
		center: { lat: 4.895645, lon: 52.372219 },
		cellSelectedOutlineColor: colors['atm-red'],
		cellHoveredOutlineColor: colors['atm-red-light'],
		cellSelectedOutlineWidth: 3,
		cellValueColor: colors['map-cell-value'],
		outlineLayerColor: colors['atm-gold'],
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
		class: className,
		mapStyle = defaultMapStyle,
		handleCellClick,
		handleMapLoaded
	}: MapProps = $props();

	let map: MapLibreMap | undefined = $state();
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
		resetAllCells();
		setActiveCells();
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

	function resetAllCells(): void {
		if (!map || !cellIdMap.size) return;
		const mapInstance = map; // Store reference for TypeScript
		cellIdMap.forEach((cellId) => {
			if (cellId) {
				mapInstance.setFeatureState(
					{ source: 'heatmap', id: cellId },
					{
						value: 0,
						count: 0
					}
				);
			}
		});
	}

	function setActiveCells(): void {
		if (!map) return;
		const mapInstance = map;
		activeCells.forEach((stateValues, cellId) => {
			mapInstance.setFeatureState({ source: 'heatmap', id: cellId }, stateValues);
		});
	}

	function generateHeatmapCells(
		dims: HeatmapDimensions
	): FeatureCollection<Polygon, CellProperties> {
		// Generate geometries on-the-fly using client-side calculation
		const cellGeometries = generateCellGeometries(dims);

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
		if (!isMapLoaded || !map || !cellIdMap.size) return;
		const mapInstance = map;

		// Clear all previous highlights
		cellIdMap.forEach((id) => {
			if (id) {
				mapInstance.setFeatureState({ source: 'heatmap', id }, { selected: false });
			}
		});

		// Set new highlight
		if (cellId) {
			mapInstance.setFeatureState({ source: 'heatmap', id: cellId }, { selected: true });
		}
	}

	function initializeMap(): void {
		if (!mapContainer) return;

		const { minLon: west, maxLon: east, minLat: south, maxLat: north } = dimensions;

		map = new maplibre.Map({
			container: mapContainer,
			style: STYLE_URL,
			maxBounds: [
				[west - mapStyle.boundsPanningOffsetLon, south - mapStyle.boundsPanningOffsetLat],
				[east + mapStyle.boundsPanningOffsetLon, north + mapStyle.boundsPanningOffsetLat]
			],
			center: [mapStyle.center.lat, mapStyle.center.lon],
			minZoom: mapStyle.minZoom,
			maxZoom: mapStyle.maxZoom,
			zoom: mapStyle.defaultZoom,
			dragRotate: false,
			touchZoomRotate: false,
			dragPan: true,
			keyboard: true,
			scrollZoom: true
		});

		map.on('load', () => {
			if (!map || !dimensions) return; // Guard for TypeScript
			const mapInstance = map;

			// Heatmap geometry - generate from dimensions
			const geojsonData = generateHeatmapCells(dimensions);

			// Add background layer with custom color
			mapInstance.addLayer(
				{
					id: 'background',
					type: 'background',
					paint: {
						'background-color': mapStyle.backgroundColor
					}
				},
				mapInstance.getStyle().layers[0]?.id
			);

			mapInstance.addSource('heatmap', {
				type: 'geojson',
				data: geojsonData,
				promoteId: 'id'
			});

			// Add water fill layer
			mapInstance.addLayer({
				id: 'heatmap-water-fill',
				type: 'fill',
				source: 'maptiler_planet',
				'source-layer': 'water',
				paint: {
					'fill-color': mapStyle.waterFillColor,
					'fill-opacity': 1.0
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
				source: 'maptiler_planet',
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
				source: 'maptiler_planet',
				'source-layer': 'transportation',
				minzoom: 4,
				maxzoom: 22,
				layout: {
					visibility: 'visible',
					'line-cap': 'round'
				},
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

			// Active cell
			mapInstance.addLayer({
				id: 'selected-cell',
				type: 'line',
				source: 'heatmap',
				paint: {
					'line-color': mapStyle.cellSelectedOutlineColor,
					'line-width': mapStyle.cellSelectedOutlineWidth,
					'line-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 1, 0]
				}
			});

			// Hover cell
			mapInstance.addLayer({
				id: 'hovered-cell',
				type: 'line',
				source: 'heatmap',
				paint: {
					'line-color': mapStyle.cellHoveredOutlineColor,
					'line-width': mapStyle.cellSelectedOutlineWidth,
					'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.8, 0]
				}
			});

			// Event handlers
			let hoveredFeatureId: string | null = null;

			mapInstance.on('mousemove', 'heatmap-squares', (e) => {
				if (e.features?.[0]) {
					const feature = e.features[0];
					const featureId = feature.properties.id;
					const featureState = mapInstance.getFeatureState({
						source: 'heatmap',
						id: featureId
					});

					// Clear previous hover state
					if (hoveredFeatureId && hoveredFeatureId !== featureId) {
						mapInstance.setFeatureState(
							{
								source: 'heatmap',
								id: hoveredFeatureId
							},
							{ hover: false }
						);
					}

					// Set new hover state
					if (featureState.count > 0) {
						mapInstance.getCanvas().style.cursor = 'pointer';
						mapInstance.setFeatureState(
							{
								source: 'heatmap',
								id: featureId
							},
							{ hover: true }
						);
						hoveredFeatureId = featureId;

						// Show tooltip with count
						hoverTooltip = {
							x: e.point.x,
							y: e.point.y,
							count: featureState.count as number,
							cellId: featureId
						};
					} else {
						mapInstance.getCanvas().style.cursor = '';
						hoveredFeatureId = null;
						hoverTooltip = null;
					}
				}
			});

			mapInstance.on('mouseleave', 'heatmap-squares', () => {
				mapInstance.getCanvas().style.cursor = '';
				if (hoveredFeatureId) {
					mapInstance.setFeatureState(
						{
							source: 'heatmap',
							id: hoveredFeatureId
						},
						{ hover: false }
					);
					hoveredFeatureId = null;
				}
				hoverTooltip = null;
			});

			mapInstance.on('click', 'heatmap-squares', (e) => {
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
			style="left: {hoverTooltip.x}px; top: {hoverTooltip.y - 8}px;"
		>
			<div class="font-medium">{hoverTooltip.count} {featuresText}</div>
			<div class="text-xs opacity-75">Cel: {hoverTooltip.cellId}</div>
		</div>
	{/if}
</div>
