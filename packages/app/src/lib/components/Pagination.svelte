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
		class?: string;
	}

	let {
		totalItems,
		currentPage,
		itemsPerPage,
		onPageChange,
		loading = false,
		class: className
	}: Props = $props();

	// Seeds the builder's initial config. count/perPage are captured once, so the parent
	// keys this component on totalItems/itemsPerPage to re-seed it when the dataset changes.
	const {
		elements: { root, pageTrigger, prevButton, nextButton },
		states: { page }
	} = createPagination({
		// svelte-ignore state_referenced_locally
		count: totalItems,
		// svelte-ignore state_referenced_locally
		perPage: itemsPerPage,
		// svelte-ignore state_referenced_locally
		defaultPage: currentPage,
		onPageChange: ({ curr, next }) => {
			if (onPageChange) {
				onPageChange(next);
			}
			return next;
		}
	});

	// Minimal strip: current page, its successor, the last page — arrows do the rest.
	type StripItem = { kind: 'page'; value: number } | { kind: 'gap' };
	const strip = $derived.by(() => {
		const total = Math.ceil(totalItems / itemsPerPage);

		// last page: mirror the strip — first page, gap, predecessor, current
		if (currentPage >= total && total > 1) {
			const items: StripItem[] = [{ kind: 'page', value: 1 }];
			const prev = total - 1;
			if (prev > 1) {
				if (prev - 1 > 1) {
					items.push({ kind: 'gap' });
				}
				items.push({ kind: 'page', value: prev });
			}
			items.push({ kind: 'page', value: total });
			return items;
		}

		const items: StripItem[] = [{ kind: 'page', value: currentPage }];
		const next = currentPage + 1;
		let lastShown = currentPage;
		if (next < total) {
			items.push({ kind: 'page', value: next });
			lastShown = next;
		}
		if (currentPage < total) {
			if (total - lastShown > 1) {
				items.push({ kind: 'gap' });
			}
			items.push({ kind: 'page', value: total });
		}
		return items;
	});

	// the gap doubles as a jump: type a page, Enter applies, blur clears
	let jumpValue = $state('');

	function handleJumpKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter') {
			return;
		}
		const parsed = parseInt(jumpValue, 10);
		jumpValue = '';
		if (isNaN(parsed)) {
			return;
		}
		const total = Math.ceil(totalItems / itemsPerPage);
		page.set(Math.min(Math.max(parsed, 1), total));
	}

	function handleJumpBlur() {
		jumpValue = '';
	}
</script>

<nav
	class="flex flex-wrap items-center gap-2 {className || ''}"
	class:opacity-50={loading}
	class:pointer-events-none={loading}
	aria-label="pagination"
	use:melt={$root}
>
	<Button icon={CaretLeft} meltAction={$prevButton} aria-label="Previous page" />
	{#each strip as item, i (i)}
		{#if item.kind === 'gap'}
			<span class="px-1 text-gray-500">…</span>
		{:else}
			<Button
				class="data-[selected]:bg-atm-gold data-[selected]:hover:bg-atm-gold-dark"
				meltAction={$pageTrigger({ type: 'page', value: item.value })}
				aria-label="Go to page {item.value}"
			>
				{item.value}
			</Button>
		{/if}
	{/each}
	<Button icon={CaretRight} meltAction={$nextButton} aria-label="Next page" />
	<!-- jump-to-page: a fixed slot, whatever shape the strip takes -->
	<input
		type="text"
		inputmode="numeric"
		bind:value={jumpValue}
		onkeydown={handleJumpKeydown}
		onblur={handleJumpBlur}
		placeholder="…"
		aria-label="Ga naar pagina"
		class="h-[32px] w-[40px] text-center bg-atm-sand-darkish rounded border border-atm-gold border-[1px] hover:bg-atm-sand-dark text-sm placeholder:text-gray-500"
	/>
</nav>
