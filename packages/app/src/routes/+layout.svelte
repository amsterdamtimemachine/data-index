<script lang="ts">
	import type { Snippet } from 'svelte';
	import Toaster from '$components/Toaster.svelte';
	import LoadingBar from '$components/LoadingBar.svelte';
	import FeatureDetailModal from '$components/FeatureDetailModal.svelte';
	import LiveRegion from '$components/LiveRegion.svelte';
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
