<!-- A translated sentence with inline elements at named slots: "Klik op {button}
     rechtsonder" renders the text with the snippet's output where {button} stands,
     so the translation decides where a picture or button goes in the sentence. -->
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		text: string;
		// renders the element for a slot name
		children: Snippet<[string]>;
	}
	let { text, children }: Props = $props();

	// "a {picture} b" splits into ['a ', 'picture', ' b']: odd entries are slot names
	const parts = $derived(text.split(/\{(\w+)\}/));
</script>

{#each parts as part, i (i)}
	{#if i % 2 === 1}
		{@render children(part)}
	{:else}
		{part}
	{/if}
{/each}
