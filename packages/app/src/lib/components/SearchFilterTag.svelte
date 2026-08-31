<script lang="ts">
	import Tag from '$components/Tag.svelte';
	import Button from '$components/Button.svelte';
	import X from 'phosphor-svelte/lib/X';
	import MagnifyingGlass from 'phosphor-svelte/lib/MagnifyingGlass';
	import { translate } from '$utils/translations';

	type Props = {
		query: string;
		onClear: () => void;
	};
	let { query, onClear }: Props = $props();
</script>

<div class="flex items-center gap-2">
	<Button icon={X} onclick={onClear} size={18} aria-label={translate('clearSearchFilter')} class="shrink-0" />
	<Tag variant="outline">
		<!-- inline flow, not flex: a narrow chip wraps like a sentence -->
		<MagnifyingGlass size={14} class="inline align-middle mr-1" aria-hidden="true" /><span class="align-middle">{query}</span>
	</Tag>
</div>
