<!--
	The input, popover and keyboard handling of a combobox; the rows are the parent's.
	The children snippet draws the list and spreads getOption's attributes on each
	row it wants selectable, so headers between rows cost nothing.
-->
<script lang="ts" module>
	export type ComboboxOption<T extends string = string> = {
		value: T;
		label: string;
	};
	export type OptionAttributes = Record<string, unknown>;
</script>

<script lang="ts" generics="T extends string">
	import { Combobox as MeltCombobox } from 'melt/builders';
	import { tick } from 'svelte';
	import type { Snippet } from 'svelte';
	import { mergeCss } from '#lib/utils/utils.js';

	type Props = {
		options: ComboboxOption<T>[];
		onInput: (text: string) => void;
		onSelect?: (value: T) => void;
		// empty the input after a choice, so the same option can be picked again
		clearOnSelect?: boolean;
		placeholder?: string;
		'aria-label'?: string;
		class?: string;
		children: Snippet<[(option: ComboboxOption<T>) => OptionAttributes]>;
	};
	let {
		options,
		onInput,
		onSelect,
		clearOnSelect = false,
		placeholder,
		'aria-label': ariaLabel,
		class: className,
		children
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

	// the list starts at the input's left edge and is at least as wide as it;
	// beyond that its rows size it, kept a page margin away from the viewport edge
	const combobox = new MeltCombobox<T>({
		sameWidth: false,
		floatingConfig: {
			shift: { padding: 12 },
			computePosition: {
				placement: 'bottom-start',
				middleware: [
					{
						name: 'minWidthOfInput',
						fn: ({ rects, elements }) => {
							const minWidth = `${rects.reference.width}px`;
							if (elements.floating.style.minWidth === minWidth) {
								return {};
							}
							elements.floating.style.minWidth = minWidth;
							return { reset: { rects: true } };
						}
					}
				]
			}
		},
		onNavigate: navigate,
		onValueChange: (value) => {
			if (!value) {
				return;
			}
			if (onSelect) {
				onSelect(value);
			}
			if (clearOnSelect) {
				// after melt's own post-callback write of the label into the input
				tick().then(() => {
					combobox.value = undefined;
					combobox.inputValue = '';
				});
			}
		}
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

	function getOption(option: ComboboxOption<T>): OptionAttributes {
		return combobox.getOption(option.value, option.label);
	}
</script>

<input
	{...combobox.input}
	{placeholder}
	aria-label={ariaLabel}
	class={mergeCss(
		'focus-ring h-[32px] w-full px-3 bg-atm-sand-darkish rounded border border-atm-gold border-[1px] text-base placeholder:text-gray-500',
		className
	)}
/>

<!-- m-0 p-0 inset-auto: reset UA popover styles -->
<div
	{...combobox.content}
	class="z-50 m-0 p-0 inset-auto w-max max-w-[min(64rem,calc(100vw-1.5rem))] bg-atm-sand border border-atm-sand-border rounded-sm shadow-md overflow-hidden divide-y divide-atm-gold {options.length === 0 ? 'hidden' : ''}"
>
	{@render children(getOption)}
</div>
