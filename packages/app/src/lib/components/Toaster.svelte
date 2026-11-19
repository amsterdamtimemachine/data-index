<script lang="ts">
	import { translate } from '#lib/utils/translations.js';
	import { fade } from 'svelte/transition';
	import X from 'phosphor-svelte/lib/X';
	import Bug from 'phosphor-svelte/lib/Bug';
	import Button from '#lib/components/Button.svelte';
	import { toaster } from '#lib/state/toaster.svelte.js';

	// a failure is outlined red; the words still say what happened
	function toastClasses(failure: boolean | undefined): string {
		const base = 'rounded-lg bg-white text-gray-800 shadow-md';
		if (failure) {
			return `${base} border border-atm-red`;
		}
		return `${base} border border-atm-sand-border`;
	}
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
			in:fade={{ duration: 75 }}
			out:fade={{ duration: 225 }}
			class={toastClasses(toast.data.failure)}
		>
			<!-- as wide as its words, up to 20rem; a phone keeps a margin -->
			<div class="relative w-max max-w-[min(20rem,calc(100vw-2rem))] p-5">
				<div class="pr-10">
					<h3 {...toast.title} class="flex items-center gap-1.5 font-bold text-sm">
						{#if toast.data.failure}
							<span class="shrink-0 text-atm-red" aria-hidden="true"><Bug size={16} weight="bold" color="currentColor" /></span>
						{/if}
						{toast.data.title}
					</h3>
					<!-- one line per thing to say; a long value from a link wraps inside the toast -->
					<div {...toast.description} class="text-sm text-gray-600 mt-1 empty:hidden whitespace-pre-line [overflow-wrap:anywhere]">{toast.data.description ?? ''}</div>
				</div>
				<div class="absolute top-2 right-2">
					<Button icon={X} onclick={toast.removeSelf} size={18} aria-label={translate('dismissNotification')} />
				</div>
			</div>
		</div>
	{/each}
</div>
