<script lang="ts">
	import { mergeCss } from '#lib/utils/utils.js';
	import type { Snippet } from 'svelte';

	interface Props {
		class?: string;
		children?: Snippet;
	}

	let {
		class: className,
		children
	}: Props = $props();

	const baseClasses = 'italic';
</script>

<em class={mergeCss(baseClasses, className)}>
	{@render children?.()}
</em>