// masonryMemoized.ts - Memory-aware masonry layout utility
import debounce from 'lodash.debounce';

export interface MasonryMemoizedOptions {
	debounceDelay?: number;
	layoutMemory?: Map<string, number>; // featureId -> columnIndex
}

export interface MasonryMemoizedInstance {
	layout: (columns: number, forceLayout?: boolean) => void;
	clearMemory: () => void;
	destroy: () => void;
}

/**
 * Extract unique identifier from masonry item element
 */
function getFeatureId(item: HTMLElement, index: number): string | null {
	// Use combination of feature ID and index to ensure uniqueness
	const featureId = item.getAttribute('data-feature-id') ||
		item.querySelector('[data-feature-id]')?.getAttribute('data-feature-id');

	if (featureId) {
		return `${featureId}_${index}`;
	}
	
	// Fallback to index-based ID
	return `item_${index}`;
}

/**
 * Clear all columns by moving their content back to the container
 */
function clearColumns(columns: HTMLElement[]): void {
	columns.forEach((column) => {
		// Move all children back to the container (parent of columns)
		while (column.firstChild) {
			const child = column.firstChild;
			column.parentElement?.appendChild(child);
		}
	});
}

/**
 * Get the current height of a column by measuring its content
 */
function getColumnHeight(column: HTMLElement): number {
	let totalHeight = 0;
	for (let i = 0; i < column.children.length; i++) {
		const child = column.children[i] as HTMLElement;
		totalHeight += child.offsetHeight;

		// Add gap between items (matching CSS gap: 1rem = 16px)
		if (i < column.children.length - 1) {
			totalHeight += 16;
		}
	}
	return totalHeight;
}

/**
 * Find the column with the shortest total height
 */
function getShortestColumnIndex(columns: HTMLElement[]): number {
	let shortestIndex = 0;
	let shortestHeight = getColumnHeight(columns[0]);

	console.log('Column heights:', columns.map((col, i) => ({
		column: i,
		height: getColumnHeight(col),
		childCount: col.children.length
	})));

	for (let i = 1; i < columns.length; i++) {
		const height = getColumnHeight(columns[i]);
		if (height < shortestHeight) {
			shortestIndex = i;
			shortestHeight = height;
		}
	}

	console.log(`Shortest column: ${shortestIndex} (height: ${shortestHeight})`);
	return shortestIndex;
}

/**
 * Memory-aware distribution: check memory first, fallback to height-based placement
 */
function distributeItemsWithMemory(
	items: HTMLElement[],
	columns: HTMLElement[],
	layoutMemory: Map<string, number>,
	previousColumnCount: number | null
): void {
	console.log(`Distribution: ${items.length} items, ${columns.length} columns, previous: ${previousColumnCount}`);
	console.log(`Memory size: ${layoutMemory.size} entries`);
	let memoryHits = 0;
	let newPlacements = 0;

	items.forEach((item, index) => {
		const featureId = getFeatureId(item, index);

		// Only use memory if column count hasn't changed
		const canUseMemory = featureId && 
			layoutMemory.has(featureId) && 
			previousColumnCount === columns.length;

		if (canUseMemory) {
			// Use remembered placement (same column count as before)
			const rememberedColumnIndex = layoutMemory.get(featureId)!;
			const rememberedColumn = columns[rememberedColumnIndex];
			rememberedColumn.appendChild(item);
			memoryHits++;
		} else {
			// Use height-based placement + store in memory
			// (either new item, or column count changed)
			const shortestColumnIndex = getShortestColumnIndex(columns);
			columns[shortestColumnIndex].appendChild(item);

			if (featureId) {
				layoutMemory.set(featureId, shortestColumnIndex);
			}
			newPlacements++;
		}

		// Force layout for accurate measurements
		item.offsetHeight;
	});
	
	console.log(`Distribution complete: ${memoryHits} memory hits, ${newPlacements} new placements`);
}


/**
 * Create a memory-aware masonry layout
 */
export function createMasonryMemoized(
	container: HTMLElement,
	options: MasonryMemoizedOptions = {}
): MasonryMemoizedInstance {
	const { debounceDelay = 100, layoutMemory = new Map() } = options;

	// Get columns once
	const columns = Array.from(container.querySelectorAll('.masonry-column')) as HTMLElement[];

	if (columns.length === 0) {
		throw new Error('No columns found with class .masonry-column');
	}

	let lastColumnCount: number | null = null;

	/**
	 * Main layout function
	 */
	function layout(currentColumnCount: number, forceLayout = false): void {
		console.log('Masonry layout called:', { 
			currentColumnCount, 
			lastColumnCount, 
			forceLayout,
			willRearrange: forceLayout || currentColumnCount !== lastColumnCount
		});
		
		// Only re-layout if column count changed or forced
		if (forceLayout || currentColumnCount !== lastColumnCount) {
			console.log(`Masonry: Re-distributing ${currentColumnCount} columns (was ${lastColumnCount})`);
			
			// Clear all columns
			clearColumns(columns);

			// Get all masonry items (including those already moved into columns)
			const items = Array.from(container.querySelectorAll('.masonry-item')) as HTMLElement[];

			// Distribute items using memory-aware algorithm
			const targetColumns = columns.slice(0, currentColumnCount);
			distributeItemsWithMemory(items, targetColumns, layoutMemory, lastColumnCount);

			lastColumnCount = currentColumnCount;
		} else {
			console.log('Masonry: No re-layout needed');
		}
	}

	/**
	 * Clear layout memory
	 */
	function clearMemory(): void {
		layoutMemory.clear();
	}

	return {
		layout,
		clearMemory,
		destroy: () => {
			clearColumns(columns);
		}
	};
}
