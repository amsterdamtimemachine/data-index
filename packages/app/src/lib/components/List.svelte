<script lang="ts">
	import { mergeCss } from '$utils/utils';
	import type { Snippet } from 'svelte';

	interface Props {
		ordered?: boolean;
		start?: number; // ol start attribute
		class?: string;
		children?: Snippet;
	}

	let {
		ordered = false,
		start,
		class: className,
		children
	}: Props = $props();

	const baseClasses = 'space-y-1 mb-4';
	const orderedClasses = 'list-decimal list-inside pl-4';
	const unorderedClasses = 'list-disc list-inside pl-4';
	
	const listClasses = $derived(ordered ? orderedClasses : unorderedClasses);
</script>

{#if ordered}
	<ol {start} class={mergeCss(baseClasses, listClasses, className)}>
		{@render children?.()}
	</ol>
{:else}
	<ul class={mergeCss(baseClasses, listClasses, className)}>
		{@render children?.()}
	</ul>
{/if}