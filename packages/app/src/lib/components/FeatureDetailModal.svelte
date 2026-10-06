<script lang="ts">
	import { createDialog, melt, type CreateDialogProps } from '@melt-ui/svelte';
	import { fade } from 'svelte/transition';
	import { featureViewerState } from '$lib/state/featureState.svelte';
	import X from 'phosphor-svelte/lib/X';
	import type { FeatureResult } from '@atm/shared/types';
	import FeatureCard from '$components/FeatureCard.svelte';
	import Button from '$components/Button.svelte';

	const handleOpenChange: CreateDialogProps['onOpenChange'] = ({ next }) => {
		if (next === false && featureViewerState.selectedFeature) {
			featureViewerState.closeFeature();
		}
		return next;
	};

	const {
		elements: { overlay, content, title, close, portalled },
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

		<!-- Layout layer: a reserved top strip for the close button, then the centering
		     area. The card lives in the lower area with max-h-full, so no card height can
		     ever cover the X. pointer-events-none lets backdrop clicks through to the
		     overlay; the button and card re-enable their own. -->
		<div class="fixed inset-0 z-50 flex flex-col pointer-events-none">
			<div class="h-12 shrink-0 flex items-center justify-end px-3">
				<Button
					icon={X}
					size={18}
					meltAction={$close}
					class="pointer-events-auto"
					aria-label="Close feature detail viewer"
				/>
			</div>
			<div class="flex-1 min-h-0 flex items-center justify-center px-3 pb-3">
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
							groupYear={featureViewerState.selectedYear}
							groupMembers={featureViewerState.yearFeatures}
							onYearSelect={featureViewerState.selectYear}
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
