<!--
	The topics' operator as a switch: on requires all chosen topics, off at least one.
	The switch is one Tab stop and Space or Enter flips it; its name says what "on"
	means. The side labels are pointer targets and hidden from screen readers, which
	would otherwise hear the choice twice.
-->
<script lang="ts">
	import { mergeCss } from '#lib/utils/utils.js';
	import { translate } from '#lib/utils/translations.js';

	type Operator = 'AND' | 'OR';

	interface Props {
		operator: Operator;
		onOperatorChange: (operator: Operator) => void;
		anyLabel: string;
		allLabel: string;
		disabled?: boolean;
		class?: string;
	}

	let { operator, onOperatorChange, anyLabel, allLabel, disabled = false, class: className }: Props = $props();

	const all = $derived(operator === 'AND');

	function choose(next: Operator) {
		if (disabled || next === operator) {
			return;
		}
		onOperatorChange(next);
	}

	function flip() {
		if (all) {
			choose('OR');
		} else {
			choose('AND');
		}
	}

	// border and padding leave exactly the thumb's height, so it sits centred and
	// travels the inner width less its own
	const thumbClasses = $derived.by(() => {
		const base = 'block h-4 w-4 rounded-full bg-atm-gold-dark shadow-sm transition-transform duration-200 ease-in-out';
		if (all) {
			return `${base} translate-x-4`;
		}
		return base;
	});

	const labelClasses = 'font-sans text-base text-black whitespace-nowrap cursor-pointer select-none';
</script>

<div class={mergeCss('flex items-center gap-1', className)} class:opacity-50={disabled}>
	<span aria-hidden="true" onclick={() => choose('OR')} class={labelClasses}>{anyLabel}</span>
	<button
		type="button"
		role="switch"
		aria-checked={all}
		aria-label={translate('topicOperator')}
		title={translate('topicOperator')}
		{disabled}
		onclick={flip}
		class="focus-ring relative inline-flex items-center h-5 w-9 p-px cursor-pointer rounded-full bg-atm-sand-darkish hover:bg-atm-sand-dark border border-atm-gold disabled:cursor-not-allowed"
	>
		<span class={thumbClasses}></span>
	</button>
	<span aria-hidden="true" onclick={() => choose('AND')} class={labelClasses}>{allLabel}</span>
</div>
