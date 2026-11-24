<!-- One row of the search dropdown: an optional icon, the label, an optional trailing text -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { PhosphorIcon } from '@atm/shared/types';
	import type { OptionAttributes } from './Combobox.svelte';

	type Props = {
		attributes: OptionAttributes;
		icon?: PhosphorIcon;
		trailing?: string;
		children: Snippet;
	};
	let { attributes, icon: Icon, trailing, children }: Props = $props();
</script>

<div
	{...attributes}
	class="flex items-center gap-2 px-3 py-1.5 text-base text-gray-500 cursor-pointer data-[highlighted]:bg-atm-sand-dark aria-selected:bg-atm-gold"
>
	{#if Icon}
		<span class="shrink-0 flex"><Icon size={16} weight="bold" color="black" /></span>
	{/if}
	<span class="min-w-0 grow text-black">{@render children()}</span>
	{#if trailing}
		<span class="shrink-0 pl-3">{trailing}</span>
	{/if}
</div>
