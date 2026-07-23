<script lang="ts">
	import { Progress } from 'melt/builders';
	import { loadingState } from '$state/loadingState.svelte';
	import { onDestroy } from 'svelte';
	import { mergeCss } from '$utils/utils';

	interface Props {
		class?: string;
	}

	let { class: className = undefined }: Props = $props();

	const progress = new Progress({ value: 0, max: 100 });

	// rAF is the only thing that moves the bar — no CSS transition on the transform, so
	// the two never fight. Opacity has its own transition (a different property).
	let visible = $state(false);
	let phase: 'idle' | 'trickle' | 'complete' = 'idle';
	let rafId: number | null = null;
	let hideTimer: ReturnType<typeof setTimeout> | null = null;
	let resetTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		if (loadingState.isLoading) start();
		else complete();
	});

	function stopRaf() {
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
	}

	function clearTimers() {
		if (hideTimer) clearTimeout(hideTimer);
		if (resetTimer) clearTimeout(resetTimer);
		hideTimer = null;
		resetTimer = null;
	}

	// Ease toward ~90% and never quite arrive: fast at first, slowing to a crawl, so the
	// bar keeps moving while we wait without pretending to know the real percentage.
	function start() {
		clearTimers();
		if (phase === 'trickle') return; // already trickling — don't restart from 0
		stopRaf();
		phase = 'trickle';
		visible = true;
		progress.value = 0;
		const t0 = performance.now();
		const step = () => {
			progress.value = 90 * (1 - Math.exp(-(performance.now() - t0) / 1000));
			rafId = requestAnimationFrame(step);
		};
		rafId = requestAnimationFrame(step);
	}

	// Fill from wherever the trickle reached up to 100, hold a beat, fade out, then reset
	// to 0 — the reset happens while invisible so the rewind is never seen.
	function complete() {
		if (phase === 'idle') return;
		stopRaf();
		clearTimers();
		phase = 'complete';
		const from = progress.value;
		const t0 = performance.now();
		const fill = () => {
			const t = Math.min((performance.now() - t0) / 200, 1);
			progress.value = from + (100 - from) * t;
			if (t < 1) {
				rafId = requestAnimationFrame(fill);
				return;
			}
			rafId = null;
			hideTimer = setTimeout(() => {
				visible = false;
				resetTimer = setTimeout(() => {
					phase = 'idle';
					progress.value = 0;
				}, 250);
			}, 150);
		};
		rafId = requestAnimationFrame(fill);
	}

	onDestroy(() => {
		stopRaf();
		clearTimers();
	});
</script>

<div
	{...progress.root}
	class={mergeCss('w-full h-[3px] overflow-hidden', className)}
	style:opacity={visible ? '1' : '0'}
	style:transition="opacity 250ms ease-in-out"
>
	<div
		{...progress.progress}
		class="h-full w-full bg-atm-blue"
		style:transform="translateX(calc(var(--progress) * -1))"
	></div>
</div>
