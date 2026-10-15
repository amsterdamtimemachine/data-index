<!-- A labelled block of the filter panel: a heading, an optional tooltip beside it, then whatever the section holds -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import QuestionMark from 'phosphor-svelte/lib/QuestionMark';
	import Heading from './Heading.svelte';
	import Tooltip from './Tooltip.svelte';
	import { translate } from '$utils/translations';

	interface Props {
		heading: string;
		tooltip?: Snippet;
		// the section's body; receives the heading's id, for a control labelled by it
		children: Snippet<[headingId: string]>;
	}

	let { heading, tooltip, children }: Props = $props();
	const headingId = $props.id();
</script>

<div class="mb-4">
	<div class="flex mb-2">
		<Heading level={3} id={headingId} class="pr-2">{heading}</Heading>
		{#if tooltip}
			<Tooltip icon={QuestionMark} placement="bottom" label="{translate('explainAbout')} {heading}">{@render tooltip()}</Tooltip>
		{/if}
	</div>
	{@render children(headingId)}
</div>
