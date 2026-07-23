<script lang="ts">
	import { createSwitch, melt } from '@melt-ui/svelte';
	import { mergeCss } from '$utils/utils';

	interface Props {
		operator: 'AND' | 'OR';
		onOperatorChange: (operator: 'AND' | 'OR') => void;
		disabled?: boolean;
		class?: string;
		anyLabel?: string;
		allLabel?: string;
	}

	let { 
		operator, 
		onOperatorChange, 
		disabled = false, 
		class: className,
		anyLabel = 'Any',
		allLabel = 'All'
	}: Props = $props();

	// Props seed the builder's initial config; the live state is the $checked store below.
	const {
		elements: { root, input },
		states: { checked }
	} = createSwitch({
		// svelte-ignore state_referenced_locally
		defaultChecked: operator === 'AND',
		// svelte-ignore state_referenced_locally
		disabled,
		onCheckedChange: ({ next }) => {
			const newOperator = next ? 'AND' : 'OR';
			onOperatorChange(newOperator);
			return next;
		}
	});
</script>

<div class={mergeCss('flex items-center gap-1', className)}>
	<span class="font-sans text-base text-black select-none">{anyLabel}</span>
	<button
		use:melt={$root}
		class="relative h-5 w-9 cursor-pointer rounded-full bg-atm-sand-darkish hover:bg-atm-sand-dark border border-atm-gold transition-transform duration-200 ease-in-out
			   data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50
			   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2"
		aria-label="Toggle between Any and All search modes"
	>
		<span
			class="thumb block h-4 w-4 rounded-full bg-atm-gold-dark shadow-sm transition-transform duration-200 ease-in-out"
		></span>
	</button>
	<input use:melt={$input} />
	<span class="font-sans text-sm text-black select-none">{allLabel}</span>
</div>

<style>
	:global([data-state='checked']) .thumb {
		transform: translateX(1.125rem);
	}
</style>
