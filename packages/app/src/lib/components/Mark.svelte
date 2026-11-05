<!--
	The words a search matched, wherever the card shows them. A mark element, so screen
	readers announce it.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { translate } from '#lib/utils/translations.js';

	type Props = {
		children: Snippet;
	};
	let { children }: Props = $props();
</script>

<mark class="bg-atm-mark text-inherit" title={translate('markTooltip')}>{@render children()}</mark>
