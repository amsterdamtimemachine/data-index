<script lang="ts">
	import type { FieldRow } from '$utils/cardFields';
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
			<dt class="text-gray-500">
				{#if field.labelHref}
					<Link href={field.labelHref} target="_blank" rel="noopener noreferrer" class="text-gray-500">{field.label}</Link>
				{:else}
					{field.label}
				{/if}
			</dt>
			<dd class:text-gray-500={field.muted}>
				{#if field.href}
					<Link href={field.href} target="_blank" rel="noopener noreferrer">{field.value}</Link>
				{:else}
					{field.value}
				{/if}
			</dd>
		{/each}
	</dl>
{/if}
