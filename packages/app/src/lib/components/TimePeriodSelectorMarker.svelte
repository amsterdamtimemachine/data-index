<svelte:options namespace="svg" />

<!-- A dot under a timeline bin: the selection has data there. Lives inside the
     histogram's svg, hence the svg namespace. -->
<script lang="ts">
	interface Props {
		// horizontal centre, as a percentage of the track width
		cx: string;
		cy: number;
		r?: number;
	}
	let { cx, cy, r = 3 }: Props = $props();
</script>

<circle {cx} {cy} {r} class="fill-atm-red" />
