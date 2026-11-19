<!-- A labelled block of the filter panel: a heading with an optional tooltip and an optional action beside it, then whatever the section holds -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import QuestionMark from 'phosphor-svelte/lib/QuestionMark';
	import Heading from './Heading.svelte';
	import Tooltip from './Tooltip.svelte';
	import { translate } from '#lib/utils/translations.js';

	interface Props {
		heading: string;
		tooltip?: Snippet;
		// a control on the whole section, beside the heading
		action?: Snippet;
		// the section's body; receives the heading's id, for a control labelled by it
		children: Snippet<[headingId: string]>;
	}

	let { heading, tooltip, action, children }: Props = $props();
	const headingId = $props.id();
</script>

<div class="mb-4">
	<!-- the three on one line, centred on each other; none carries its own margin here -->
	<div class="flex items-center gap-2 mb-2">
		<Heading level={3} id={headingId} class="mb-0">{heading}</Heading>
		{#if tooltip}
			<Tooltip icon={QuestionMark} placement="bottom" label="{translate('explainAbout')} {heading}" class="m-0">{@render tooltip()}</Tooltip>
		{/if}
		{#if action}
			{@render action()}
		{/if}
	</div>
	{@render children(headingId)}
</div>
