<script lang="ts" module>
	export type ComboboxOption<T extends string = string> = {
		value: T;
		label: string;
		detail?: string;
	};
</script>

<script lang="ts" generics="T extends string">
	import { Combobox as MeltCombobox } from 'melt/builders';
	import { tick } from 'svelte';
	import { mergeCss } from '$utils/utils';

	type Props = {
		options: ComboboxOption<T>[];
		onInput: (text: string) => void;
		onSelect?: (value: T) => void;
		// Search-action mode: keep the picked label in the input but forget the
		// value, so the same option can be picked again later.
		resetValueOnSelect?: boolean;
		// label of the selection this input represents, mirrored into the input
		// whenever it changes; null clears the input
		selectedLabel?: string | null;
		placeholder?: string;
		'aria-label'?: string;
		class?: string;
	};
	let {
		options,
		onInput,
		onSelect,
		resetValueOnSelect = false,
		selectedLabel = undefined,
		placeholder,
		'aria-label': ariaLabel,
		class: className
	}: Props = $props();

	// Options arrive async (debounced fetch), after melt's own tick-based first
	// highlight has already run against an empty list. Navigating over our array
	// keeps the arrow keys working regardless of when the DOM catches up.
	function navigate(current: T | null, direction: 'next' | 'prev'): T | null {
		if (options.length === 0) {
			return null;
		}
		const index = options.findIndex((o) => o.value === current);
		if (index === -1) {
			if (direction === 'next') {
				return options[0].value;
			}
			return options[options.length - 1].value;
		}
		let target = index + 1;
		if (direction === 'prev') {
			target = index - 1;
		}
		if (target < 0 || target >= options.length) {
			return current;
		}
		return options[target].value;
	}

	const combobox = new MeltCombobox<T>({
		onNavigate: navigate,
		onValueChange: (value) => {
			if (!value) {
				return;
			}
			if (onSelect) {
				onSelect(value);
			}
			if (resetValueOnSelect) {
				// after melt's own post-callback write of the label into the input
				tick().then(() => {
					combobox.value = undefined;
				});
			}
		}
	});

	$effect(() => {
		if (selectedLabel === undefined) {
			return;
		}
		combobox.inputValue = selectedLabel ?? '';
	});

	// Enter should pick the top result as soon as results exist
	$effect(() => {
		if (options.length === 0 || !combobox.open) {
			return;
		}
		const stillListed = options.some((o) => o.value === combobox.highlighted);
		if (!stillListed) {
			combobox.highlight(options[0].value);
		}
	});

	$effect(() => {
		onInput(combobox.inputValue);
	});
</script>

<input
	{...combobox.input}
	{placeholder}
	aria-label={ariaLabel}
	class={mergeCss(
		'h-[32px] w-full px-3 bg-atm-sand-darkish rounded border border-atm-gold border-[1px] text-sm placeholder:text-gray-500',
		className
	)}
/>

<!-- m-0 p-0 inset-auto: reset UA popover styles -->
<div
	{...combobox.content}
	class="z-50 m-0 p-0 inset-auto bg-atm-sand border border-atm-sand-border rounded-sm shadow-md overflow-hidden divide-y divide-atm-gold {options.length === 0 ? 'hidden' : ''}"
>
	{#each options as option (option.value)}
		<div
			{...combobox.getOption(option.value, option.label)}
			class="px-3 py-1.5 text-sm cursor-pointer flex items-baseline justify-between gap-3 data-[highlighted]:bg-atm-sand-dark aria-selected:bg-atm-gold"
		>
			<span>{option.label}</span>
			{#if option.detail}
				<span class="text-xs text-gray-600">{option.detail}</span>
			{/if}
		</div>
	{/each}
</div>
