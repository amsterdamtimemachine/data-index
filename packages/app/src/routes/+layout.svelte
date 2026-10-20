<script lang="ts">
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
	<LoadingBar class="z-50 fixed top-0 " />
	<Toaster />
	<LiveRegion />
	<FeatureDetailModal />
	{@render children?.()}
</main>
