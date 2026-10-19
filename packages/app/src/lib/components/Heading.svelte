<script lang="ts">
	import { mergeCss } from '$utils/utils';

	interface Props {
		level?: 1 | 2 | 3 | 4 | 5 | 6;
		depth?: 1 | 2 | 3 | 4 | 5 | 6;
		id?: string;
		style?: string;
		// a dialog's title takes the first focus, so a screen reader starts there
		tabindex?: number;
		autofocus?: boolean;
		class?: string;
		children?: import('svelte').Snippet;
	}

	let { level, depth, id, style, tabindex, autofocus, class: className, children }: Props = $props();

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

<!-- autofocus is set only on a dialog's title, where it gives the dialog its first focus -->
<!-- svelte-ignore a11y_autofocus -->
<svelte:element
	this={`h${headingLevel}`}
	{id}
	{style}
	{tabindex}
	{autofocus}
	class={mergeCss('block font-sans', levelStyles[headingLevel], className)}
>
	{@render children?.()}
</svelte:element>
