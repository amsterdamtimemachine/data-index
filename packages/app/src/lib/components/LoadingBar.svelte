<!-- The page's loading bar, a view of loadingState's fill: the page shows one, an open dialog its own -->
<script lang="ts">
	import { Progress } from 'melt/builders';
	import { loadingState } from '#lib/state/loadingState.svelte.js';
	import { mergeCss } from '#lib/utils/utils.js';

	interface Props {
		class?: string;
	}

	let { class: className = undefined }: Props = $props();

	const progress = new Progress({ value: () => loadingState.barValue, max: 100 });
</script>

<!-- visual only: the results are announced when they land -->
<div
	{...progress.root}
	aria-hidden="true"
	class={mergeCss('w-full h-[3px] overflow-hidden', className)}
	style:visibility={loadingState.barVisible ? 'visible' : 'hidden'}
>
	<div {...progress.progress} class="h-full w-full bg-atm-blue" style:transform="translateX(calc(var(--progress) * -1))"></div>
</div>
