<script lang="ts">
	import Button from '$components/Button.svelte';
	import List from 'phosphor-svelte/lib/List';
	import X from 'phosphor-svelte/lib/X';
	import { cubicOut } from 'svelte/easing';
	import { tweened } from 'svelte/motion';
	import { mergeCss } from '$utils/utils';
	import type { Snippet } from 'svelte';

	interface Props {
		class?: string;
		isExpanded: boolean;
		header?: Snippet;
		children?: Snippet;
	}

	let { class: className, isExpanded = $bindable(true), header, children }: Props = $props();

	const navPosition = tweened(isExpanded ? 0 : -100, {
		duration: 200,
		easing: cubicOut
	});

	$effect(() => {
		navPosition.set(isExpanded ? 0 : -100);
	});

	function toggleToc() {
		isExpanded = !isExpanded;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' || event.key === 'Esc' || event.keyCode === 27) {
			isExpanded = false;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div
	id="table-of-contents-container"
	class={mergeCss(
		'absolute left-0 top-0 w-[250px] h-full xl:w-[290px] 2xl:w-[400px] border-r border-atm-sand-border bg-atm-sand-dark shadow-[5px_0px_20px_5px_rgba(0,0,0,0.07)]',
		className
	)}
	style="transform: translateX({$navPosition}%);"
	aria-hidden={!isExpanded}
>
	<Button
		onclick={toggleToc}
		icon={isExpanded ? X : List}
		class="absolute right-[-32px] top-[50%] h-[32px] w-[32px] rounded-l-none border-l-atm-sand-border"
		size={18}
		aria-label={isExpanded ? 'Close navigation menu' : 'Open navigation menu'}
	/>
	<div class="w-full h-full flex flex-col" inert={!isExpanded}>
		{#if header}
			<div class="shrink-0">
				{@render header()}
			</div>
		{/if}
		<div class="flex-1 overflow-y-auto">
			{@render children?.()}
		</div>
	</div>
</div>
