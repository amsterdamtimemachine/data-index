<script lang="ts">
	import type { FeatureResult } from '@atm/shared/types';
	import { translate, translateAll } from '#lib/utils/translations.js';
	import { resolveCardFields, collapsedFields, dataSourceFields, relationLine, contentKind, scrollingContent } from '#lib/utils/cardFields.js';
	import { featureViewerState } from '#lib/state/featureState.svelte.js';
	import FeatureCardHeader from '#lib/components/FeatureCardHeader.svelte';
	import FeatureCardPlaceLine from '#lib/components/FeatureCardPlaceLine.svelte';
	import FeatureCardContent from '#lib/components/FeatureCardContent.svelte';
	import FieldList from '#lib/components/FieldList.svelte';
	import TagList from '#lib/components/TagList.svelte';
	import Heading from '#lib/components/Heading.svelte';
	import MarkedText from '#lib/components/MarkedText.svelte';
	import { markFeature, matchWindow } from '#lib/utils/search-hits.js';

	type Props = {
		feature: FeatureResult;
		expanded?: boolean;
		// an expanded card's close button, in the header where the expand button sits
		onClose?: () => void;
		// where the card sits in the page's heading order: 3 in the list, 2 as a dialog
		headingLevel?: 2 | 3;
		// the heading's id, for a dialog that is named by it
		headingId?: string;
	};

	let { feature, expanded = false, onClose, headingLevel = 3, headingId }: Props = $props();
	// a heading with an id is a dialog's title, which takes the first focus
	const headingTabindex = $derived.by(() => {
		if (headingId) {
			return -1;
		}
		return undefined;
	});
	const sectionLevel = $derived.by((): 3 | 4 => {
		if (headingLevel === 2) {
			return 3;
		}
		return 4;
	});

	const placeLine = $derived(relationLine(feature));
	// the values a search matched carry their marks and show marked wherever the card
	// shows them; a snapshot, so the copying works on plain data rather than the reactive proxy
	const marked = $derived(markFeature($state.snapshot(feature)));
	// collapsed, a title with a match is cut to the words around it
	const title = $derived(expanded ? marked.label : matchWindow(marked.label));

	// collapsed: the summary fields and the matched ones; expanded: every field, between
	// what and where and the sources
	const entityFields = $derived.by(() => {
		if (expanded) {
			return marked.entity ? resolveCardFields(marked.entity, true) : [];
		}
		return collapsedFields(marked);
	});
	// expanded, below the item's own fields: where it comes from
	const provenanceFields = $derived(dataSourceFields(feature, expanded));
	const scrolling = $derived(scrollingContent(feature, expanded));

	const entityFieldsClasses = $derived.by(() => {
		if (!expanded) {
			return 'mt-1';
		}
		if (scrolling) {
			return `px-2 py-2 shrink-0 relative z-10 bg-atm-sand border-t border-atm-sand-border shadow-edge-down`;
		}
		return 'px-2 py-2 shrink-0';
	});
	// the title and place line cast the shadow onto content that scrolls under them
	const titleBlockClasses = $derived.by(() => {
		if (scrolling) {
			return `shrink-0 relative z-10 bg-atm-sand pb-1 shadow-edge-up`;
		}
		return 'shrink-0';
	});

	// expanded, the card is a column capped at the modal's height: head, fields and
	// sources stay, the content region (image, rows, text) is what scrolls
	const rootClasses = $derived.by(() => {
		// a long unbroken word wraps inside the card, its field grids and tag row included
		const base = 'w-full border rounded-sm border-atm-sand-border bg-atm-sand min-w-0 [overflow-wrap:anywhere]';
		if (expanded) {
			return `${base} flex flex-col min-h-0 max-h-full`;
		}
		return base;
	});
	const bodyClasses = $derived.by(() => {
		if (expanded) {
			return 'flex flex-col min-h-0';
		}
		return 'p-2';
	});
	// expanded, text and programmes scroll; a picture never does, it shrinks to the room
	// left between the title and the fields and is shown whole
	const contentClasses = $derived.by(() => {
		if (!expanded) {
			return '';
		}
		if (contentKind(feature.entity) === 'picture' && feature.contentUrl) {
			return 'min-h-0 flex flex-col overflow-hidden';
		}
		return 'min-h-0 overflow-y-auto';
	});

	// collapsed cards open; an expanded card has nothing further to open
	const expandHandler = $derived.by(() => {
		if (expanded) {
			return undefined;
		}
		return handleExpand;
	});

	function handleExpand() {
		featureViewerState.openFeature(feature);
	}
</script>

<div class={rootClasses}>
	<FeatureCardHeader class="p-2 shrink-0" {feature} onExpand={expandHandler} {onClose} />
	<div class={bodyClasses}>
		<div class={titleBlockClasses}>
			<!-- in the dialog the title takes the first focus: a screen reader says the title and
			     stops, rather than reading the whole card -->
			<Heading
				level={headingLevel}
				id={headingId}
				tabindex={headingTabindex}
				autofocus={headingId !== undefined}
				class={expanded
					? 'font-medium text-xl my-3 px-2 focus:outline-none'
					: 'font-medium text-lg line-clamp-2 mb-0'}
			>
				<MarkedText text={title} />
			</Heading>
			<FeatureCardPlaceLine line={placeLine} {expanded} />
		</div>
		<!-- the content by the entity's kind: the region that scrolls when expanded -->
		<div class={contentClasses}>
			<FeatureCardContent feature={marked} {expanded} onExpand={handleExpand} />
		</div>
		{#if expanded}
			<!-- the item's own fields, then where it comes from -->
			<div class={entityFieldsClasses}>
				{#if entityFields.length > 0}
					<FieldList fields={entityFields} class="mb-3" />
				{/if}
				{#if provenanceFields.length > 0}
					<Heading level={sectionLevel} class="text-base font-medium mb-1">{translate('provenance')}</Heading>
					<FieldList fields={provenanceFields} />
				{/if}
			</div>
		{:else}
			<FieldList fields={entityFields} class="mt-1" />
		{/if}

		<TagList
			tags={translateAll(feature.tags || [])}
			{expanded}
			maxVisible={expanded ? undefined : 3}
			class={expanded ? 'py-2 px-2 shrink-0' : 'pt-2'}
		/>
	</div>
</div>
