<script lang="ts">
	import { createPagination, melt } from '@melt-ui/svelte';
	import CaretLeft from 'phosphor-svelte/lib/CaretLeft';
	import CaretRight from 'phosphor-svelte/lib/CaretRight';
	import Button from '$components/Button.svelte';

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

	// Seeds the builder's initial config. count/perPage are captured once, so the parent
	// keys this component on totalItems/itemsPerPage to re-seed it when the dataset changes.
	const {
		elements: { root, pageTrigger, prevButton, nextButton },
		states: { pages }
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
</script>

<nav
	class="flex flex-wrap items-center gap-2 {className || ''}"
	class:opacity-50={loading}
	class:pointer-events-none={loading}
	aria-label="pagination"
	use:melt={$root}
>
	<Button icon={CaretLeft} meltAction={$prevButton} aria-label="Previous page" />
	{#each $pages as page (page.key)}
		{#if page.type === 'ellipsis'}
			<span class="px-2 text-gray-500">...</span>
		{:else}
			<Button
				class="data-[selected]:bg-atm-gold data-[selected]:hover:bg-atm-gold-dark"
				meltAction={$pageTrigger(page)}
				aria-label="Go to page {page.value}"
			>
				{page.value}
			</Button>
		{/if}
	{/each}
	<Button icon={CaretRight} meltAction={$nextButton} aria-label="Next page" />
</nav>
