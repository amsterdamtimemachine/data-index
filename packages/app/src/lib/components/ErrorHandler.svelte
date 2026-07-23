<script lang="ts">
	import type { PageErrorData, AppError } from '$lib/types/error';
	import { addToast } from '$state/toaster.svelte';

	interface Props {
		errorData: PageErrorData;
	}

	let { errorData }: Props = $props();
	let processedErrorIds = $state(new Set<string>());

	$effect(() => {
		if (!errorData.hasErrors) return;
		
		for (const error of errorData.errors) {
			if (!processedErrorIds.has(error.id)) {
				addToast({
					data: {
						title: error.title,
						description: error.description,
						type: error.type
					}
				});
				processedErrorIds.add(error.id);
			}
		}
	});

</script>
