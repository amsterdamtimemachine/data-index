<script lang="ts">
	import { Progress } from 'melt/builders';
	import { loadingState } from '#lib/state/loadingState.svelte.js';
	import { onDestroy } from 'svelte';
	import { mergeCss } from '#lib/utils/utils.js';

	interface Props {
		class?: string;
	}

	let { class: className = undefined }: Props = $props();

	const progress = new Progress({ value: 0, max: 100 });

	// while something loads the bar fills at a steady pace up to FILL_CAP, where it
	// waits; when the loading ends it runs on to the end at the same pace, shows there
	// for a moment, and is gone. No real percentage is known.
	const FILL_CAP = 90;
	const FILL_MS = 400;
	const DONE_MS = 100;
	let rafId: number | null = null;
	let visible = $state(false);
	let doneTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		if (loadingState.isLoading) {
			start();
		} else {
			stop();
		}
	});

	function stopRaf() {
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
	}

	function clearDone() {
		if (doneTimer) {
			clearTimeout(doneTimer);
			doneTimer = null;
		}
	}

	// from the start, or from where the bar was, at FILL_CAP per FILL_MS, up to `to`
	function fill(to: number, onDone?: () => void) {
		stopRaf();
		const from = progress.value;
		const t0 = performance.now();
		const step = () => {
			progress.value = Math.min(to, from + (FILL_CAP * (performance.now() - t0)) / FILL_MS);
			if (progress.value < to) {
				rafId = requestAnimationFrame(step);
			} else {
				rafId = null;
				onDone?.();
			}
		};
		rafId = requestAnimationFrame(step);
	}

	function start() {
		clearDone();
		visible = true;
		if (progress.value >= FILL_CAP) {
			progress.value = 0;
		}
		fill(FILL_CAP);
	}

	function stop() {
		if (!visible) {
			return;
		}
		fill(100, () => {
			doneTimer = setTimeout(() => {
				visible = false;
				progress.value = 0;
			}, DONE_MS);
		});
	}

	onDestroy(() => {
		stopRaf();
		clearDone();
	});
</script>

<!-- visual only: the results are announced when they land -->
<div
	{...progress.root}
	aria-hidden="true"
	class={mergeCss('w-full h-[3px] overflow-hidden', className)}
	style:visibility={visible ? 'visible' : 'hidden'}
>
	<div {...progress.progress} class="h-full w-full bg-atm-blue" style:transform="translateX(calc(var(--progress) * -1))"></div>
</div>
