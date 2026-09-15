<script lang="ts">
	import { resolve, asset } from '$app/paths';
	import Heading from './Heading.svelte';
	import { mergeCss } from '$utils/utils';
	import type { Snippet } from 'svelte';

	interface Props {
		class?: string;
		children?: Snippet;
	}

	let { class: className, children }: Props = $props();
</script>

<nav
	class={mergeCss(
		'w-full bg-atm-sand flex items-center justify-between h-[50px] border-b border-atm-sand-border',
		className
	)}
>
	<a href={resolve('/')} class="no-underline flex items-center">
		<img src={asset('/logos/atm_logo_big.png')} alt="A logo reading Amsterdam Time Machine in black" class="h-[34px]" />
	</a>
	<div class="flex items-center gap-2">
		{@render children?.()}
	</div>
</nav>
