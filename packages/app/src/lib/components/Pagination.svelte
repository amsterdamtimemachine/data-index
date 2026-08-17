<script lang="ts">
	import { createPagination, melt } from '@melt-ui/svelte';
	import CaretLeft from 'phosphor-svelte/lib/CaretLeft';
	import CaretRight from 'phosphor-svelte/lib/CaretRight';
	import Button from '$components/Button.svelte';
	import { createMediaQuery, MOBILE_QUERY } from '$utils/media.svelte';

	interface Props {
		totalItems: number;
		currentPage: number;
		itemsPerPage: number;
		onPageChange?: (page: number) => void;
		loading?: boolean;
		siblingCount?: number;
		class?: string;
	}

	let {
		totalItems,
		currentPage,
		itemsPerPage,
		onPageChange,
		loading = false,
		siblingCount = 1,
		class: className
	}: Props = $props();

	const isMobile = createMediaQuery(MOBILE_QUERY);

	// Seeds the builder's initial config. count/perPage are captured once, so the parent
	// keys this component on totalItems/itemsPerPage to re-seed it when the dataset changes.
	const {
		elements: { root, pageTrigger, prevButton, nextButton },
		states: { pages, range, page }
	} = createPagination({
		// svelte-ignore state_referenced_locally
		count: totalItems,
		// svelte-ignore state_referenced_locally
		perPage: itemsPerPage,
		// svelte-ignore state_referenced_locally
		defaultPage: currentPage,
		// svelte-ignore state_referenced_locally
		siblingCount,
		onPageChange: ({ curr, next }) => {
			if (onPageChange) {
				onPageChange(next);
			}
			return next;
		}
	});

	// Mobile shows a compact strip: current, next, … , last. Melt's list always
	// contains those pages (next is a sibling, last is pinned) and emits its trailing
	// ellipsis exactly when ours is needed, so filtering melt's own items suffices.
	const displayItems = $derived.by(() => {
		const items = $pages;
		if (!isMobile.matches) {
			return items;
		}
		const pageItems = items.filter((item) => item.type === 'page');
		const last = pageItems[pageItems.length - 1]?.value;
		const keep = new Set([$page, $page + 1, last]);
		const result: typeof items = [];
		let afterCurrent = false;
		for (const item of items) {
			if (item.type === 'page') {
				if (item.value === $page) {
					afterCurrent = true;
				}
				if (keep.has(item.value)) {
					result.push(item);
				}
			} else if (afterCurrent) {
				result.push(item);
			}
		}
		return result;
	});
</script>

<nav
	class="flex flex-wrap items-center gap-2 {className || ''}"
	class:opacity-50={loading}
	class:pointer-events-none={loading}
	aria-label="pagination"
	use:melt={$root}
>
	<Button icon={CaretLeft} meltAction={$prevButton} aria-label="Previous page" />
	{#each displayItems as item (item.key)}
		{#if item.type === 'ellipsis'}
			<span class="px-2 text-gray-500">...</span>
		{:else}
			<Button
				class="data-[selected]:bg-atm-gold data-[selected]:hover:bg-atm-gold-dark"
				meltAction={$pageTrigger(item)}
				aria-label="Go to page {item.value}"
			>
				{item.value}
			</Button>
		{/if}
	{/each}
	<Button icon={CaretRight} meltAction={$nextButton} aria-label="Next page" />
</nav>
