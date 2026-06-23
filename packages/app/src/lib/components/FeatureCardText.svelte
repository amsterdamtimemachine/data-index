<script lang="ts">
	type Props = {
		text: string;
		expanded?: boolean;
	};

	let { text, expanded = false }: Props = $props();

	const maxLength = 200;
	let showFullText = $state(false);
	const truncatedText = $derived(text.length > maxLength ? text.slice(0, maxLength) + '...' : text);
	const needsTruncation = $derived(text.length > maxLength);
</script>

{#if expanded}
	<div class="">
		<p class="p-2 text-gray-700 leading-relaxed whitespace-pre-wrap">
			{text}
		</p>
	</div>
{:else}
	<div class="flex-1">
		<div class="text-base text-gray-700 leading-relaxed">
			{#if needsTruncation && !showFullText}
				<div>
					{truncatedText}
				</div>
				<button
					class="mt-2 text-base text-blue-600 hover:text-blue-800 underline"
					onclick={() => (showFullText = true)}
				>
					Show more
				</button>
			{:else}
				<div>
					{text}
				</div>
				{#if needsTruncation}
					<button
						class="mt-2 text-base text-blue-600 hover:text-blue-800 underline"
						onclick={() => (showFullText = false)}
					>
						Show less
					</button>
				{/if}
			{/if}
		</div>
	</div>
{/if}
