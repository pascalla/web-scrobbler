import SavedEdits from '@/background/storage/saved-edits';

import Song from '@/background/object/song';
import { SongDiff } from '@/background/pipeline/pipeline';
import { ProcessedSongInfo } from '@/background/object/song';

/**
 * Load edited song info from the storage.
 *
 * @param song Song instance
 *
 * @return Song info loaded from the storage
 */
export async function loadEditedSongInfo(song: Song): Promise<SongDiff> {
	const editedSongInfo = await SavedEdits.loadSongInfo(song);
	if (editedSongInfo === null) {
		return {};
	}

	const processed: Partial<ProcessedSongInfo> = {};

	for (const field of Song.BASE_FIELDS) {
		processed[field] = editedSongInfo[field];
	}

	return { processed, flags: { isCorrectedByUser: true } };
}
