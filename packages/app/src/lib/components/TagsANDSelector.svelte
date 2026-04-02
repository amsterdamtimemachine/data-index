<script lang="ts">
	import ToggleGroup from './ToggleGroup.svelte';
	import Tag from './Tag.svelte';
	import type { RecordType, PhosphorIcon } from '@atm/shared/types';

	interface Props {
		recordTypes: RecordType[]; // Currently selected record types
		allRecordTypes: RecordType[]; // All available record types from metadata
		availableTags: string[]; // All available tags from metadata
		selectedTags: string[]; // Currently selected tags
		onTagsSelected: (selected: string[]) => void;
		class?: string;
	}

	let {
		recordTypes,
		allRecordTypes,
		availableTags,
		selectedTags,
		onTagsSelected,
		class: className = ''
	}: Props = $props();

	// Tag combination state
	let availableTagsForSelection = $state<string[]>([]);

	// Use selectedTags from route data
	let validSelectedTags = $derived(selectedTags);

	let disabledTags = $derived.by(() => {
		// All tags that are NOT available for current selection should be disabled
		// But never disable currently selected tags
		return availableTags.filter(
			(tag) => !availableTagsForSelection.includes(tag) && !validSelectedTags.includes(tag)
		);
	});

	// Effect to load available tag combinations when record types or current tags change
	$effect(() => {
		if (allRecordTypes.length > 0) {
			loadAvailableTagCombinations();
		} else {
			// When no record types available, show all tags as available
			availableTagsForSelection = availableTags;
		}
	});

	async function loadAvailableTagCombinations() {
		try {
			// Use the "show all" exception: if no current record types, use all record types
			const effectiveRecordTypes = recordTypes.length > 0 ? recordTypes : allRecordTypes;

			// Build query params
			const query = new URLSearchParams();
			query.set('recordTypes', effectiveRecordTypes.join(','));
			if (validSelectedTags && validSelectedTags.length > 0) {
				query.set('selected', validSelectedTags.join(','));
			}

			const response = await fetch(`/api/tag-combinations?${query}`);

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const data = await response.json();

			if (!data.success) {
				throw new Error(data.message || 'API returned unsuccessful response');
			}

			availableTagsForSelection = data.availableTags.map((tag: { name: string }) => tag.name);
		} catch (error) {
			console.error('Failed to load available tag combinations:', error);
			// On error, show all tags as available
			availableTagsForSelection = availableTags;
		}
	}

	// Validate tags before emitting to parent
	async function handleTagSelection(selected: string[] | string) {
		const selectedArray = Array.isArray(selected) ? selected : [selected];
		// Use the same validation logic as route loader
		if (selectedArray.length > 0) {
			try {
				const effectiveRecordTypes = recordTypes.length > 0 ? recordTypes : allRecordTypes;
				const response = await fetch(
					`/api/tag-combinations?recordTypes=${effectiveRecordTypes.join(',')}&selected=${selectedArray.join(',')}&validateAll=true`
				);

				if (response.ok) {
					const data = await response.json();
					const validTags = data.validTags || [];

					onTagsSelected(validTags);
					return;
				}
			} catch (error) {
				console.error('TagsSelector validation failed:', error);
			}
		}

		// Fallback: pass selected tags as-is
		onTagsSelected(selectedArray);
	}
</script>

<div class={className}>
	{#if availableTags.length === 0}
		<div class="text-sm text-gray-500">No tags available</div>
	{:else}
		{#key availableTags}
			<ToggleGroup
				items={availableTags}
				selectedItems={validSelectedTags}
				disabledItems={disabledTags}
				onItemSelected={handleTagSelection}
				orientation="vertical"
				type="multiple"
			>
				{#snippet children(item, isSelected, isDisabled)}
					<Tag variant={isSelected ? 'selected' : 'default'} disabled={isDisabled} interactive={true}>
						{item}
					</Tag>
				{/snippet}
			</ToggleGroup>
		{/key}
	{/if}
</div>
