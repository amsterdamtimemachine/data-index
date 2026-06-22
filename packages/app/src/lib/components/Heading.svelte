<script lang="ts">
	import { mergeCss } from '$utils/utils';

	interface Props {
		level?: 1 | 2 | 3 | 4 | 5 | 6;
		depth?: 1 | 2 | 3 | 4 | 5 | 6; // For svelte-markdown compatibility
		id?: string;
		style?: string;
		class?: string;
		children?: import('svelte').Snippet;
	}

	let { level, depth, id, style, class: className, children }: Props = $props();
	
	// Use depth from svelte-markdown if available, otherwise fallback to level prop
	const headingLevel = $derived(depth ?? level ?? 1);

	const levelStyles = {
		1: 'text-2xl font-bold mb-4',
		2: 'text-3xl font-light mb-4',
		3: 'text-2xl font-light mb-3',
		4: 'text-base font-light mb-3',
		5: 'text-base font-light mb-2',
		6: 'text-base font-light mb-2'
	};
</script>

<svelte:element
	this={`h${headingLevel}`}
	{id}
	{style}
	class={mergeCss('block font-sans', levelStyles[headingLevel], className)}
>
	{@render children?.()}
</svelte:element>
