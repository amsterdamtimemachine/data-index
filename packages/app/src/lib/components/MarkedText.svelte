<!-- A string that may carry search marks, printed with the marked words marked. -->
<script lang="ts">
	import Mark from '#lib/components/Mark.svelte';
	import { parseMarks } from '#lib/utils/search-hits.js';

	type Props = {
		text: string;
	};
	let { text }: Props = $props();

	// the text as runs, each plain or marked
	const runs = $derived.by(() => {
		const { text: plain, ranges } = parseMarks(text);
		const out: { text: string; marked: boolean }[] = [];
		let cursor = 0;
		for (const r of ranges) {
			if (r.start > cursor) {
				out.push({ text: plain.slice(cursor, r.start), marked: false });
			}
			out.push({ text: plain.slice(r.start, r.end), marked: true });
			cursor = r.end;
		}
		if (cursor < plain.length) {
			out.push({ text: plain.slice(cursor), marked: false });
		}
		return out;
	});
</script>

{#each runs as run, i (i)}{#if run.marked}<Mark>{run.text}</Mark>{:else}{run.text}{/if}{/each}
