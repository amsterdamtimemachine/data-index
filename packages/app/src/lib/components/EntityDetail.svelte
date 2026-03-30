<script lang="ts">
	import type { Entity, PersonEntity, MediaObjectEntity } from '@atm/shared/types';
	import { translateRelation } from '$utils/translations';

	type Props = {
		entity: Entity | PersonEntity | MediaObjectEntity;
		relationId?: string;
		class?: string;
	};

	let { entity, relationId, class: className }: Props = $props();

	function isPerson(e: Entity): e is PersonEntity {
		return e.type === 'Person';
	}

	function isMediaObject(e: Entity): e is MediaObjectEntity {
		return e.type === 'MediaObject';
	}
</script>

<div class="text-base text-gray-700 {className || ''}">
	{#if relationId}
		<p class="text-gray-500 mb-1">{translateRelation(relationId)}</p>
	{/if}
	{#if isPerson(entity)}
		<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
			{#if entity.birthDate}
				<dt class="text-gray-500">Born</dt>
				<dd>{entity.birthDate}{entity.birthPlace ? `, ${entity.birthPlace}` : ''}</dd>
			{:else if entity.birthPlace}
				<dt class="text-gray-500">Born</dt>
				<dd>{entity.birthPlace}</dd>
			{/if}
			{#if entity.deathDate}
				<dt class="text-gray-500">Died</dt>
				<dd>{entity.deathDate}{entity.deathPlace ? `, ${entity.deathPlace}` : ''}</dd>
			{:else if entity.deathPlace}
				<dt class="text-gray-500">Died</dt>
				<dd>{entity.deathPlace}</dd>
			{/if}
		</dl>
	{:else if isMediaObject(entity)}
		<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
			{#if entity.dateCreated}
				<dt class="text-gray-500">Date</dt>
				<dd>{entity.dateCreated}</dd>
			{/if}
			{#if entity.author}
				<dt class="text-gray-500">Author</dt>
				<dd>{entity.author}</dd>
			{/if}
		</dl>
	{/if}
</div>
