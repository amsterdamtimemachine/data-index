<script lang="ts">
	type Props = {
		thumbnail: string;
		alt?: string;
		expanded?: boolean;
		onExpand?: () => void;
	};

	let { thumbnail, alt, expanded = false, onExpand }: Props = $props();

	let imageError = $state(false);
	let imageLoading = $state(true);

	const handleImageLoad = () => {
		imageLoading = false;
	};

	const handleImageError = () => {
		imageError = true;
		imageLoading = false;
	};
</script>

<div class="flex-1">
	{#if imageError}
		<div
			class="w-full {expanded
				? 'h-64'
				: 'h-32'} bg-gray-100 flex items-center justify-center text-gray-500 text-sm"
		>
			<div class="text-center">
				<div class="mb-1">🖼️</div>
				<div>Image unavailable</div>
			</div>
		</div>
	{:else if expanded}
		<div class="relative w-full border-y border-atm-sand-border">
			<img
				src={thumbnail}
				{alt}
				class="w-full h-auto object-contain max-h-[70vh] rounded"
				class:hidden={imageLoading}
				onload={handleImageLoad}
				onerror={handleImageError}
			/>
		</div>
	{:else}
		<!-- Collapsed grid thumbnail: a fixed-aspect box reserves the card's final height
		     before the image loads, so the masonry layout measures true heights and never
		     shifts when images stream in. Lazy so an off-screen page of 100 cards doesn't
		     fetch every thumbnail up front. -->
		<div class="relative w-full border-y border-atm-sand-border">
			{#if onExpand}
				<button
					type="button"
					class="w-full block cursor-pointer hover:opacity-80 transition-opacity"
					onclick={onExpand}
					aria-label="Expand image"
				>
					<div class="w-full aspect-[4/3] overflow-hidden rounded bg-gray-100">
						<img
							src={thumbnail}
							{alt}
							loading="lazy"
							class="w-full h-full object-cover"
							onload={handleImageLoad}
							onerror={handleImageError}
						/>
					</div>
				</button>
			{:else}
				<div class="w-full aspect-[4/3] overflow-hidden rounded bg-gray-100">
					<img
						src={thumbnail}
						{alt}
						loading="lazy"
						class="w-full h-full object-cover"
						onload={handleImageLoad}
						onerror={handleImageError}
					/>
				</div>
			{/if}
		</div>
	{/if}
</div>
