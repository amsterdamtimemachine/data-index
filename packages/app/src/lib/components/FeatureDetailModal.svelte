<!--
	The expanded card in a native modal dialog: the browser centres it in the top layer,
	keeps focus inside it, closes it on Escape and makes the page behind it inert.
-->
<script lang="ts">
	import { featureViewerState } from '#lib/state/featureState.svelte.js';
	import FeatureCard from '#lib/components/FeatureCard.svelte';

	// the dialog is named by the card's own heading, which carries this id
	const TITLE_ID = 'feature-dialog-title';

	const dialog = featureViewerState.dialog;
	const selectedFeature = $derived(featureViewerState.selectedFeature);

	// the card's width: a picture gets the room, anything read gets a reading measure,
	// about 75 characters a line; a phone gets the full width either way
	const widthClasses = $derived.by(() => {
		if (selectedFeature?.entity?.type === 'MediaObject') {
			return 'w-[90vw] max-w-4xl';
		}
		return 'w-[90vw] max-w-[600px]';
	});
</script>

<!-- open:flex, not flex: a display class would override the browser hiding a closed dialog -->
<dialog
	{...dialog.content}
	aria-labelledby={TITLE_ID}
	class="{widthClasses} max-h-[calc(100dvh-1.5rem)] p-0 border-0 bg-white rounded-sm shadow-xl overflow-hidden open:flex flex-col backdrop:bg-black/85"
>
	{#if selectedFeature}
		<!-- the card caps itself at this height and scrolls its content region;
		     the overflow here is only a fallback -->
		<div class="flex flex-col flex-1 min-h-0 overflow-y-auto">
			<FeatureCard
				feature={selectedFeature}
				expanded={true}
				headingLevel={2}
				headingId={TITLE_ID}
				onClose={featureViewerState.closeFeature}
			/>
		</div>
	{/if}
</dialog>
