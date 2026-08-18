<script lang="ts" module>
	export type SelectOption<T extends string = string> = { value: T; label: string };
</script>

<script lang="ts" generics="T extends string">
	import { Select as MeltSelect } from 'melt/builders';
	import CaretDown from 'phosphor-svelte/lib/CaretDown';
	import { mergeCss } from '$utils/utils';

	type Props = {
		options: SelectOption<T>[];
		value: T;
		onChange: (value: T) => void;
		'aria-label'?: string;
		class?: string;
	};
	let { options, value, onChange, 'aria-label': ariaLabel, class: className }: Props = $props();

	const select = new MeltSelect<T>({
		value: () => value,
		onValueChange: (next) => {
			if (next) {
				onChange(next);
			}
		},
		sameWidth: false
	});

	const currentLabel = $derived.by(() => {
		const current = options.find((option) => option.value === value);
		if (current) {
			return current.label;
		}
		return '';
	});
</script>

<button
	{...select.trigger}
	class={mergeCss(
		'h-[32px] flex items-center justify-between gap-2 px-3 bg-atm-sand-darkish rounded border border-atm-gold border-[1px] hover:bg-atm-sand-dark text-sm',
		className
	)}
	aria-label={ariaLabel}
>
	{currentLabel}
	<CaretDown size={12} weight="bold" />
</button>

<!-- m-0 inset-auto: the UA stylesheet centres native popovers, which would defeat
     melt's floating positioning (same reset as Tooltip) -->
<div
	{...select.content}
	class="z-50 m-0 inset-auto bg-atm-sand border border-atm-sand-border rounded-sm shadow-md py-1"
>
	{#each options as option (option.value)}
		<div
			{...select.getOption(option.value)}
			class="px-3 py-1.5 text-sm cursor-pointer data-[highlighted]:bg-atm-sand-dark aria-selected:bg-atm-gold aria-selected:data-[highlighted]:bg-atm-gold-dark"
		>
			{option.label}
		</div>
	{/each}
</div>
