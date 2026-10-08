<script lang="ts">
	import { createDialog, melt, type CreateDialogProps } from '@melt-ui/svelte';
	import { fade } from 'svelte/transition';
	import { featureViewerState } from '$lib/state/featureState.svelte';
	import type { FeatureResult } from '@atm/shared/types';
	import FeatureCard from '$components/FeatureCard.svelte';

	const handleOpenChange: CreateDialogProps['onOpenChange'] = ({ next }) => {
		if (next === false && featureViewerState.selectedFeature) {
			featureViewerState.closeFeature();
		}
		return next;
	};

	const {
		elements: { overlay, content, title, portalled },
		states: { open }
	} = createDialog({
		forceVisible: true,
		defaultOpen: false,
		role: 'dialog',
		preventScroll: true,
		onOpenChange: handleOpenChange
	});

	// Get current selected feature
	let selectedFeature = $derived(featureViewerState.selectedFeature);

	// the card's width: a picture gets the room, anything read gets a reading measure,
	// about 75 characters a line; a phone gets the full width either way
	const widthClasses = $derived.by(() => {
		if (selectedFeature?.entity?.type === 'MediaObject') {
			return 'w-[90vw] max-w-4xl';
		}
		return 'w-[90vw] max-w-[600px]';
	});

	// Open dialog when feature is selected
	$effect(() => {
		if (featureViewerState.selectedFeature) {
			open.set(true);
		} else {
			open.set(false);
		}
	});
</script>

{#if $open && selectedFeature}
	<div use:melt={$portalled}>
		<!-- Overlay/backdrop -->
		<div
			use:melt={$overlay}
			class="fixed inset-0 z-50 bg-black/85"
			transition:fade={{ duration: 150 }}
		></div>

		<!-- Layout layer: the centering area; the card carries its own close button in
		     its header. pointer-events-none lets backdrop clicks through to the overlay;
		     the card re-enables its own. -->
		<div class="fixed inset-0 z-50 flex flex-col pointer-events-none">
			<div class="flex-1 min-h-0 flex items-center justify-center p-3">
				<!-- Modal Content -->
				<div
					use:melt={$content}
					class="pointer-events-auto {widthClasses} max-h-full bg-white rounded-sm
					       shadow-xl overflow-hidden flex flex-col"
					transition:fade={{ duration: 100 }}
				>
					<!-- Hidden title for accessibility -->
					<h2 use:melt={$title} class="sr-only">Feature Detail Viewer</h2>

					<!-- the card caps itself at this height and scrolls its content region;
					     the overflow here is only a fallback -->
					<div class="flex flex-col flex-1 min-h-0 overflow-y-auto">
						<FeatureCard
							feature={selectedFeature}
							expanded={true}
							onClose={featureViewerState.closeFeature}
						/>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	:global(body.modal-open) {
		overflow: hidden;
	}
</style>
