<script lang="ts">
	import QuestionMark from 'phosphor-svelte/lib/QuestionMark';
	import Heading from '$components/Heading.svelte';
	import Tooltip from '$components/Tooltip.svelte';
	import TagOperatorSwitch from '$components/TagOperatorSwitch.svelte';
	import ToggleGroup from '$components/ToggleGroup.svelte';
	import Tag from '$components/Tag.svelte';

	// Hardcoded dummy tags for preview purposes (in Dutch)
	const DUMMY_TAGS = [
		'Katten', 
		'Paarden', 
		'Wonen', 
		'Eten',
		'Verkeer'
	];
	
	// Fixed operator for simplicity
	const currentTagOperator = 'OR';
	
	// No-op handlers since everything is disabled
	function handleTagOperatorChange(operator: 'AND' | 'OR') {
		// Disabled - no action
	}
	
	function handleTagsChange(tags: string | string[]) {
		// Disabled - no action  
	}
</script>

<div class="mb-4">
	<div class="flex">
		<Heading level={3} class="pr-2"> Onderwerpen </Heading>
		<Tooltip icon={QuestionMark} placement="bottom">
			Automatisch gegenereerde onderwerpen zonder handmatige correctie. Dit toont zowel de mogelijkheden als de beperkingen van huidige machine learning-classificatietechnieken. Minimaal één: resultaten met minstens één onderwerp. Alle: alleen resultaten met alle onderwerpen
		</Tooltip>
	</div>
	<span class="text-base text-gray-500">
		Work in progress, momenteel uitgeschakeld	
	</span>
	<div class="mt-1 mb-1">
		<TagOperatorSwitch 
			operator={currentTagOperator}
			onOperatorChange={handleTagOperatorChange}
			disabled={true}
			anyLabel="Minimaal één"
			allLabel="Alle"
			class="block"
		/>
	</div>
</div>

<!-- Always show OR version since it's simpler for preview -->
<ToggleGroup
	items={DUMMY_TAGS}
	selectedItems={[]}
	disabledItems={DUMMY_TAGS}
	onItemSelected={handleTagsChange}
	requireOneItemSelected={false}
>
	{#snippet children(item, isSelected, isDisabled)}
		<Tag variant="default" disabled={true} interactive={false}>
			{item}
		</Tag>
	{/snippet}
</ToggleGroup>
