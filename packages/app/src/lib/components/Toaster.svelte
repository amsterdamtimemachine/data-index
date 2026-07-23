<script lang="ts">
	import { fade } from 'svelte/transition';
	import X from 'phosphor-svelte/lib/X';
	import Button from '$components/Button.svelte';
	import { toaster } from '$state/toaster.svelte';
</script>

<!-- toaster.root renders a native popover="manual". Its UA styles centre it (inset:0;
     margin:auto), so top/left-auto + bottom/right-0 pin the stack to the bottom-right. -->
<div
	{...toaster.root}
	class="fixed top-auto left-auto bottom-0 right-0 z-50 m-4 flex flex-col items-end gap-2 border-0 p-0 bg-transparent overflow-visible"
>
	{#each toaster.toasts as toast (toast.id)}
		<div
			{...toast.content}
			in:fade={{ duration: 150 }}
			out:fade={{ duration: 450 }}
			class="rounded-lg bg-white text-gray-800 shadow-md border max-w-sm"
			class:border-red-200={toast.data.type === 'error'}
			class:border-yellow-200={toast.data.type === 'warning'}
			class:border-green-200={toast.data.type === 'success'}
			class:border-blue-200={toast.data.type === 'info'}
		>
			<div class="relative w-[24rem] max-w-[calc(100vw-2rem)] p-5">
				<div class="pr-10">
					<h3 {...toast.title} class="flex items-center gap-2 font-bold text-sm mb-1">
						{toast.data.title}
						<span
							class="size-1.5 rounded-full"
							class:bg-red-500={toast.data.type === 'error'}
							class:bg-yellow-500={toast.data.type === 'warning'}
							class:bg-green-500={toast.data.type === 'success'}
							class:bg-blue-500={toast.data.type === 'info'}
						></span>
					</h3>
					<div {...toast.description} class="text-sm text-gray-600">
						{toast.data.description}
					</div>
				</div>
				<div class="absolute top-2 right-2">
					<Button icon={X} onclick={toast.removeSelf} size={18} aria-label="Dismiss notification" />
				</div>
			</div>
		</div>
	{/each}
</div>
