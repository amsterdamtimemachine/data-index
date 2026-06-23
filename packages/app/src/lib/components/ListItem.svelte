<script lang="ts">
	import { mergeCss } from '$utils/utils';
	import type { Snippet } from 'svelte';

	interface Props {
		class?: string;
		children?: Snippet;
	}

	let {
		class: className,
		children
	}: Props = $props();

	const baseClasses = 'text-base';
</script>

<li class={mergeCss(baseClasses, className)}>
	{@render children?.()}
</li>