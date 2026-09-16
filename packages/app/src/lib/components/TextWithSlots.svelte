<!-- A translated sentence with inline elements at named slots: "Klik op {button}
     rechtsonder" renders the text with the snippet's output where {button} stands,
     so the translation decides where a picture or button goes in the sentence. -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { splitSlots } from '$utils/slots';

	interface Props {
		text: string;
		// renders the element for a slot name
		children: Snippet<[string]>;
	}
	let { text, children }: Props = $props();

	const parts = $derived(splitSlots(text));
</script>

{#each parts as part, i (i)}
	{#if part.kind === 'slot'}
		{@render children(part.name)}
	{:else}
		{part.value}
	{/if}
{/each}
