<!-- A labelled block of the filter panel: a heading, an optional tooltip beside it, then whatever the section holds -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import QuestionMark from 'phosphor-svelte/lib/QuestionMark';
	import Heading from './Heading.svelte';
	import Tooltip from './Tooltip.svelte';

	interface Props {
		heading: string;
		tooltip?: Snippet;
		children: Snippet;
	}

	let { heading, tooltip, children }: Props = $props();
</script>

<div class="mb-4">
	<div class="flex mb-2">
		<Heading level={3} class="pr-2">{heading}</Heading>
		{#if tooltip}
			<Tooltip icon={QuestionMark} placement="bottom">{@render tooltip()}</Tooltip>
		{/if}
	</div>
	{@render children()}
</div>
