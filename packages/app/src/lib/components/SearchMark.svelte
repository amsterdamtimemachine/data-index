<!--
	The words a search matched, wherever the card shows them: an underline, distinct from
	the plum evidence highlight, which says something else (where the place is named).
	A mark element, so screen readers announce it.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		children: Snippet;
	};
	let { children }: Props = $props();
</script>

<mark class="bg-transparent text-inherit underline decoration-atm-gold-dark decoration-2 underline-offset-2">{@render children()}</mark>
