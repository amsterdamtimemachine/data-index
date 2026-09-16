<script lang="ts">
	import { Tooltip } from 'melt/builders';
	import type { Snippet } from 'svelte';
	import { mergeCss } from '$utils/utils';
	import type { PhosphorIcon, PhosphorIconProps } from '@atm/shared/types';

	interface Props {
		// the tooltip's content; the box owns its text style, so callers pass plain content
		children: Snippet;
		icon: PhosphorIcon;
		placement?:
			| 'top'
			| 'bottom'
			| 'left'
			| 'right'
			| 'top-start'
			| 'top-end'
			| 'bottom-start'
			| 'bottom-end'
			| 'left-start'
			| 'left-end'
			| 'right-start'
			| 'right-end';
		openDelay?: number;
		closeDelay?: number;
		disabled?: boolean;
		class?: string;
	}

	const iconProps: PhosphorIconProps = {
		size: 15,
		weight: 'bold',
		color: 'black',
		mirrored: false
	};

	let {
		children,
		placement = 'top',
		openDelay = 100,
		closeDelay = 300,
		disabled = false,
		class: className,
		icon: Icon
	}: Props = $props();

	// closeOnPointerDown:false keeps tap-to-open working on touch devices.
	const tooltip = new Tooltip({
		openDelay: () => openDelay,
		closeDelay: () => closeDelay,
		closeOnPointerDown: false,
		floatingConfig: () => ({ computePosition: { placement, strategy: 'fixed' } })
	});
</script>

<!-- Trigger element -->
{#if disabled}
	<span
		class={mergeCss(
			'inline-flex items-center justify-center w-5 h-5 bg-sand-li rounded-full cursor-not-allowed',
			className
		)}
	>
		<Icon {...iconProps} />
	</span>
{:else}
	<button
		type="button"
		{...tooltip.trigger}
		class="inline-flex items-center justify-center w-5 h-5 bg-atm-sand-darkish rounded-full border border-atm-gold cursor-pointer hover:bg-atm-sand-dark transition-colors {className}"
	>
		<Icon {...iconProps} />
	</button>

	<!-- Tooltip content -->
	<div
		{...tooltip.content}
		class="tooltip-content z-50 max-w-xs rounded-lg bg-atm-gold-deep border border-atm-gold-darkest text-white shadow-lg"
	>
		<div {...tooltip.arrow} class="tooltip-arrow"></div>
		<div class="px-3 py-2 text-base">
			{@render children()}
		</div>
	</div>
{/if}

<style lang="postcss">
	.tooltip-content {
		@apply border border-atm-gold-darkest;
		margin: 0;
		inset: auto;
	}

	.tooltip-arrow {
		@apply bg-atm-gold-deep border-atm-gold-darkest;
	}
</style>
