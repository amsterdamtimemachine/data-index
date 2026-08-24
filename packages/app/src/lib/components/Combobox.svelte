<script lang="ts" module>
	export type ComboboxOption<T extends string = string> = {
		value: T;
		label: string;
		detail?: string;
	};
</script>

<script lang="ts" generics="T extends string">
	import { Combobox as MeltCombobox } from 'melt/builders';
	import { mergeCss } from '$utils/utils';

	type Props = {
		options: ComboboxOption<T>[];
		onInput: (text: string) => void;
		onSelect?: (value: T) => void;
		placeholder?: string;
		'aria-label'?: string;
		class?: string;
	};
	let { options, onInput, onSelect, placeholder, 'aria-label': ariaLabel, class: className }: Props = $props();

	const combobox = new MeltCombobox<T>({
		onValueChange: (value) => {
			if (!value) {
				return;
			}
			if (onSelect) {
				onSelect(value);
			}
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
			{...combobox.getOption(option.value)}
			class="px-3 py-1.5 text-sm cursor-pointer flex items-baseline justify-between gap-3 data-[highlighted]:bg-atm-sand-dark aria-selected:bg-atm-gold"
		>
			<span>{option.label}</span>
			{#if option.detail}
				<span class="text-xs text-gray-600">{option.detail}</span>
			{/if}
		</div>
	{/each}
</div>
