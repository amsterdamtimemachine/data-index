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
			class="fixed inset-0 z-50 bg-black/85 flex items-center justify-center"
			transition:fade={{ duration: 150 }}
		>
			<Button
				icon={X}
				size={18}
				meltAction={$close}
				class="absolute right-3 top-3"
				aria-label="Close feature detail viewer"
			/>
		</div>

		<!-- Modal Content -->
		<div
			use:melt={$content}
			class="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-4xl max-h-[90vh]
			       -translate-x-1/2 -translate-y-1/2 bg-white rounded-sm shadow-xl
			       overflow-hidden flex flex-col"
			transition:fade={{ duration: 100 }}
		>
			<!-- Hidden title for accessibility -->
			<h2 use:melt={$title} class="sr-only">Feature Detail Viewer</h2>

			<!-- Scrollable content area -->
			<div class="overflow-y-auto flex-1">
				<FeatureCard feature={selectedFeature} expanded={true} />
			</div>
		</div>
	</div>
{/if}

<style>
	:global(body.modal-open) {
		overflow: hidden;
	}
</style>
