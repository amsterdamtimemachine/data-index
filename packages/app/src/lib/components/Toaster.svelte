<script lang="ts" context="module">
	import { createToaster, createSync } from '@melt-ui/svelte';
	import { melt } from '@melt-ui/svelte';
	import { flip } from 'svelte/animate';
	import { fly } from 'svelte/transition';

	export type ToastData = {
		title: string;
		description: string;
		type?: 'success' | 'error' | 'warning' | 'info';
	};

	const {
		elements: { content, title, description, close },
		helpers,
		states: { toasts },
		actions: { portal }
	} = createToaster<ToastData>();

	export const addToast = helpers.addToast;
</script>

<div
	class="fixed right-0 top-0 z-50 m-4 flex flex-col items-end gap-2 md:bottom-0 md:top-auto"
	use:portal
>
	{#each $toasts as { id, data } (id)}
		<div
			use:melt={$content(id)}
			animate:flip={{ duration: 500 }}
			in:fly={{ duration: 150, x: '100%' }}
			out:fly={{ duration: 150, x: '100%' }}
			class="rounded-lg bg-white text-gray-800 shadow-md border max-w-sm"
			class:border-red-200={data.type === 'error'}
			class:border-yellow-200={data.type === 'warning'}
			class:border-green-200={data.type === 'success'}
			class:border-blue-200={data.type === 'info'}
		>
			<div
				class="relative flex w-[24rem] max-w-[calc(100vw-2rem)] items-center justify-between gap-4 p-5"
			>
				<div>
					<h3 use:melt={$title(id)} class="flex items-center gap-2 font-bold text-sm mb-1">
						{data.title}
						<span
							class="size-1.5 rounded-full"
							class:bg-red-500={data.type === 'error'}
							class:bg-yellow-500={data.type === 'warning'}
							class:bg-green-500={data.type === 'success'}
							class:bg-blue-500={data.type === 'info'}
						></span>
					</h3>
					<div use:melt={$description(id)} class="text-sm text-gray-600">
						{data.description}
					</div>
				</div>
				<button
					use:melt={$close(id)}
					class="absolute right-4 top-4 grid size-6 place-items-center rounded-full text-gray-400 hover:text-gray-600"
				>
					×
				</button>
			</div>
		</div>
	{/each}
</div>
