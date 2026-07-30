<script lang="ts">
	import type { FieldRow } from '$utils/cardFields';
	import { translate } from '$utils/translations';
	import Link from './Link.svelte';

	type Props = {
		fields: FieldRow[];
		class?: string;
	};

	let { fields, class: className }: Props = $props();
</script>

{#if fields.length}
	<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-base text-gray-700 {className || ''}">
		{#each fields as field}
			<dt class="text-gray-500">{translate(field.label)}</dt>
			<dd>
				{#if field.href}
					<Link href={field.href} target="_blank" rel="noopener noreferrer">{field.value}</Link>
				{:else}
					{field.value}
				{/if}
			</dd>
		{/each}
	</dl>
{/if}
