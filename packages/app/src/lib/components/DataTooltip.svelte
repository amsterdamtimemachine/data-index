<!--
	A readout box at a point on the screen: the dark, pointer-transparent box the
	timeline shows while hovering. The host positions it and supplies the lines.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		x: number;
		y: number;
		children: Snippet;
	};
	let { x, y, children }: Props = $props();
</script>

<div
	class="fixed z-50 bg-black bg-opacity-80 text-white px-2 py-1 rounded text-sm pointer-events-none transform -translate-x-1/2 -translate-y-full"
	style="left: {x}px; top: {y - 8}px;"
>
	{@render children()}
</div>
