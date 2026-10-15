<!--
	The evidence of a feature's link to its place, in one style on both ends: the place
	name in the relation line, and the span of the feature's text that names it. In
	text it is a mark, so screen readers announce the highlight; with a link it is a link.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import Link from '$components/Link.svelte';
	import { mergeCss } from '$utils/utils';

	type Props = {
		href?: string;
		// the span sits in running text rather than in a sentence about the place
		inText?: boolean;
		class?: string;
		children: Snippet;
	};
	let { href, inText = false, class: className, children }: Props = $props();

	// the colour on both ends; only the span in the text is also bold
	const classes = $derived(mergeCss('text-atm-plum', className));
</script>

{#if inText}
	<mark class="bg-transparent font-semibold {classes}">{@render children()}</mark>
{:else if href}
	<Link {href} target="_blank" rel="noopener noreferrer" class="inline {classes}">{@render children()}</Link>
{:else}
	<span class={classes}>{@render children()}</span>
{/if}
