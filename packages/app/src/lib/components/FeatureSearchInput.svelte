<script lang="ts">
	import Button from '$components/Button.svelte';
	import MagnifyingGlass from 'phosphor-svelte/lib/MagnifyingGlass';
	import { createSearchCount } from '$lib/state/search-count.svelte';
	import { translate } from '$utils/translations';

	type Props = {
		onApply: (q: string) => void;
		// current filter params, so the preview count matches what apply will show
		filterQuery?: string;
	};
	let { onApply, filterQuery = '' }: Props = $props();

	const searchCount = createSearchCount();
	let value = $state('');

	function handleInput() {
		searchCount.setQuery(value, filterQuery);
	}

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		const q = value.trim();
		if (q.length === 0) {
			return;
		}
		onApply(q);
		value = '';
		searchCount.setQuery('', filterQuery);
	}

	const countLabel = $derived.by(() => {
		if (searchCount.count === null) {
			return null;
		}
		if (searchCount.count === 1) {
			return `1 ${translate('searchResult')}`;
		}
		return `${searchCount.count} ${translate('searchResults')}`;
	});
</script>

<form onsubmit={handleSubmit} class="flex items-center gap-2">
	<input
		bind:value
		oninput={handleInput}
		placeholder={translate('featureSearchPlaceholder')}
		aria-label={translate('featureSearchPlaceholder')}
		class="h-[32px] w-full px-3 bg-atm-sand-darkish rounded border border-atm-gold border-[1px] text-sm placeholder:text-gray-500"
	/>
	<!-- no onclick: the button submits the form, same path as Enter -->
	<Button icon={MagnifyingGlass} size={18} aria-label={translate('applySearch')} class="shrink-0" />
</form>
{#if countLabel}
	<div class="mt-1 text-xs text-gray-600">{countLabel}</div>
{/if}
