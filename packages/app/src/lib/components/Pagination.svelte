<!--
	The features panel's page strip: previous, a few pages, next, and a field to type a
	page into. Built on the headless pagination builder, so the current page and the
	count are read live and the strip follows them.
-->
<script lang="ts">
	import { translate } from '$utils/translations';
	import { pageStrip, totalPages } from '$utils/pagination';
	import { Pagination } from '$lib/builders/pagination';
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

	let { totalItems, currentPage, itemsPerPage, onPageChange, loading = false, class: className }: Props = $props();

	const total = $derived(totalPages(totalItems, itemsPerPage));

	const pagination = new Pagination({
		page: () => currentPage,
		totalPages: () => total,
		onChange: (page) => onPageChange?.(page)
	});

	const strip = $derived(pageStrip(currentPage, total));

	// the jump field: type a page, Enter applies, blur clears
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
		pagination.goTo(parsed);
	}

	function handleJumpBlur() {
		jumpValue = '';
	}
</script>

<nav
	{...pagination.root}
	class="flex flex-wrap items-center gap-2 {className || ''}"
	class:opacity-50={loading}
	class:pointer-events-none={loading}
	aria-label={translate('pagination')}
>
	<Button {...pagination.prev} icon={CaretLeft} aria-label={translate('previousPage')} />
	{#each strip as item, i (i)}
		{#if item.kind === 'gap'}
			<span class="px-1 text-gray-500" aria-hidden="true">…</span>
		{:else}
			<Button
				{...pagination.page(item.value)}
				class="data-[selected]:bg-atm-gold data-[selected]:hover:bg-atm-gold-dark"
				aria-label="{translate('goToPage')} {item.value}"
			>
				{item.value}
			</Button>
		{/if}
	{/each}
	<Button {...pagination.next} icon={CaretRight} aria-label={translate('nextPage')} />
	<!-- jump-to-page: a fixed slot, whatever shape the strip takes -->
	<input
		type="text"
		inputmode="numeric"
		bind:value={jumpValue}
		onkeydown={handleJumpKeydown}
		onblur={handleJumpBlur}
		placeholder="…"
		aria-label={translate('goToPage')}
		class="focus-ring h-[32px] w-[40px] text-center bg-atm-sand-darkish rounded border border-atm-gold border-[1px] hover:bg-atm-sand-dark text-sm placeholder:text-gray-500"
	/>
</nav>
