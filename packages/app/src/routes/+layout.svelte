<script lang="ts">
	import { featureViewerState } from '#lib/state/featureState.svelte.js';
	import type { Snippet } from 'svelte';
	import Toaster from '#lib/components/Toaster.svelte';
	import LoadingBar from '#lib/components/LoadingBar.svelte';
	import FeatureDetailModal from '#lib/components/FeatureDetailModal.svelte';
	import LiveRegion from '#lib/a11y/LiveRegion.svelte';
	import '../app.pcss';

	let {
		children
	}: {
		children?: Snippet;
	} = $props();
</script>

<main class="relative">
	<!-- one bar at a time: the open dialog carries its own, in the top layer -->
	{#if !featureViewerState.dialog.open}
		<LoadingBar class="z-50 fixed top-0" />
	{/if}
	<Toaster />
	<LiveRegion />
	<FeatureDetailModal />
	{@render children?.()}
</main>
