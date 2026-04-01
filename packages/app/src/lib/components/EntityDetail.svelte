<script lang="ts">
	import type { Entity, PersonEntity, MediaObjectEntity } from '@atm/shared/types';
	import { t } from '$utils/translations';
	import { formatDate, formatDateRange } from '$utils/format';

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
		<p class="text-gray-500 mb-1">{t(relationId)}</p>
	{/if}
	{#if isPerson(entity)}
		<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
			<dt class="text-gray-500">{t('born')}</dt>
			<dd>{entity.birthDate ? formatDate(entity.birthDate) : t('unknown')}{entity.birthPlace ? `, ${entity.birthPlace}` : ''}</dd>
			<dt class="text-gray-500">{t('died')}</dt>
			<dd>{entity.deathDate ? formatDate(entity.deathDate) : t('unknown')}{entity.deathPlace ? `, ${entity.deathPlace}` : ''}</dd>
		</dl>
	{:else if isMediaObject(entity)}
		<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
			<dt class="text-gray-500">{t('date')}</dt>
			<dd>{entity.dateCreated ? formatDateRange(entity.dateCreated) : t('unknown')}</dd>
			<dt class="text-gray-500">{t('author')}</dt>
			<dd>{entity.author || t('unknown')}</dd>
		</dl>
	{/if}
</div>
