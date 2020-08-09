import { ApiCallResult } from '@/background/scrobbler/api-call-result';
import {
	BaseScrobbler,
	ScrobblerSongInfo,
} from '@/background/scrobbler/base-scrobbler';
import { LastFmScrobbler } from '@/background/scrobbler/lastfm-scrobbler';
import { LibreFmScrobbler } from '@/background/scrobbler/librefm-scrobbler';
import { ListenBrainzScrobbler } from '@/background/scrobbler/listenbrainz-scrobbler';

import { SongInfo, LoveStatus } from '@/background/object/song';

/**
 * Scrobblers that are bound, meaning they have valid session IDs.
 */
const boundScrobblers: BaseScrobbler[] = [];

/**
 * Scrobblers that are registered and that can be bound.
 */
const registeredScrobblers: BaseScrobbler[] = [
	new LastFmScrobbler(),
	new LibreFmScrobbler(),
	new ListenBrainzScrobbler(),
];

/**
 * Check if scrobbler is in given array of scrobblers.
 *
 * @param scrobbler Scrobbler instance
 * @param array Array of scrobblers
 *
 * @return True if scrobbler is in array, false otherwise
 */
function isScrobblerInArray(
	scrobbler: BaseScrobbler,
	array: BaseScrobbler[]
): boolean {
	return array.some((s) => {
		return s.getId() === scrobbler.getId();
	});
}

export const ScrobbleManager = new (class {
	/**
	 * Bind all registered scrobblers.
	 *
	 * @return Bound scrobblers
	 */
	async bindAllScrobblers(): Promise<BaseScrobbler[]> {
		for (const scrobbler of registeredScrobblers) {
			try {
				await scrobbler.getSession();
				this.bindScrobbler(scrobbler);
			} catch (e) {
				console.warn(`Unable to bind ${scrobbler.getLabel()}`);
			}
		}

		return boundScrobblers;
	}

	/**
	 * Bind given scrobbler.
	 *
	 * @param scrobbler Scrobbler instance
	 */
	bindScrobbler(scrobbler: BaseScrobbler): void {
		if (!isScrobblerInArray(scrobbler, boundScrobblers)) {
			boundScrobblers.push(scrobbler);
			console.log(`Bind ${scrobbler.getLabel()} scrobbler`);
		}
	}

	/**
	 * Unbind given scrobbler.
	 *
	 * @param scrobbler Scrobbler instance
	 */
	unbindScrobbler(scrobbler: BaseScrobbler) {
		if (isScrobblerInArray(scrobbler, boundScrobblers)) {
			const index = boundScrobblers.indexOf(scrobbler);
			boundScrobblers.splice(index, 1);

			console.log(`Unbind ${scrobbler.getLabel()} scrobbler`);
		} else {
			console.error(`${scrobbler.getLabel()} is not bound`);
		}
	}

	/**
	 * Retrieve song info using scrobbler APIs.
	 *
	 * @param songInfo Object containing song info
	 *
	 * @return Promise resolved with array of song info objects
	 */
	getSongInfo(songInfo: SongInfo): Promise<ScrobblerSongInfo[] | null[]> {
		const scrobblers = registeredScrobblers.filter((scrobbler) => {
			return scrobbler.canLoadSongInfo();
		});
		console.log(`Send "get info" request: ${scrobblers.length}`);

		return Promise.all(
			scrobblers.map((scrobbler) => {
				return scrobbler.getSongInfo(songInfo).catch(() => {
					console.warn(
						`Unable to get song info from ${scrobbler.getLabel()}`
					);
					return null;
				});
			})
		);
	}

	/**
	 * Send now playing notification to each bound scrobbler.
	 *
	 * @param songInfo Object containing song info
	 *
	 * @return Promise that will be resolved then the task will complete
	 */
	sendNowPlaying(songInfo: SongInfo): Promise<ApiCallResult[]> {
		console.log(`Send "now playing" request: ${boundScrobblers.length}`);

		return Promise.all(
			boundScrobblers.map((scrobbler) => {
				// Forward result (including errors) to caller
				return scrobbler.sendNowPlaying(songInfo).catch((result) => {
					return this.processErrorResult(scrobbler, result);
				});
			})
		);
	}

	/**
	 * Scrobble song to each bound scrobbler.
	 *
	 * @param songInfo Object containing song info
	 *
	 * @return Promise that will be resolved then the task will complete
	 */
	scrobble(songInfo: SongInfo): Promise<ApiCallResult[]> {
		console.log(`Send "scrobble" request: ${boundScrobblers.length}`);

		return this.sendScrobbleRequest(boundScrobblers, songInfo);
	}

	/**
	 * Scrobble song using given scrobblers.
	 *
	 * @param songInfo Object containing song info
	 * @param scrobblerIds Array of scrobbler IDs.
	 *
	 * @return Promise that will be resolved then the task will complete
	 */
	scrobbleWithScrobblers(
		songInfo: SongInfo,
		scrobblerIds: string[]
	): Promise<ApiCallResult[]> {
		console.log(`Send "scrobble" request: ${scrobblerIds.length}`);

		const scrobblers = scrobblerIds.map((id) => this.getScrobblerById(id));
		return this.sendScrobbleRequest(scrobblers, songInfo);
	}

	/**
	 * Toggle song love status.
	 *
	 * @param songInfo Object containing song info
	 * @param loveStatus Flag indicates song is loved
	 *
	 * @return Promise that will be resolved then the task will complete
	 */
	toggleLove(
		songInfo: SongInfo,
		loveStatus: LoveStatus
	): Promise<ApiCallResult[]> {
		const scrobblers = registeredScrobblers.filter((scrobbler) => {
			return scrobbler.canLoveSong();
		});
		const requestName = loveStatus === LoveStatus.Loved ? 'love' : 'unlove';
		console.log(`Send "${requestName}" request: ${scrobblers.length}`);

		return Promise.all(
			scrobblers.map((scrobbler) => {
				// Forward result (including errors) to caller
				return scrobbler
					.toggleLove(songInfo, loveStatus)
					.catch((result) => {
						return this.processErrorResult(scrobbler, result);
					});
			})
		);
	}

	/**
	 * Get all registered scrobblers.
	 *
	 * @return Array of registered scrobblers
	 */
	getRegisteredScrobblers(): BaseScrobbler[] {
		return registeredScrobblers;
	}

	/**
	 * Get all bound scrobblers.
	 *
	 * @return Array of bound scrobblers
	 */
	getBoundScrobblers(): BaseScrobbler[] {
		return boundScrobblers;
	}

	/**
	 * Get a scrobbler by a given ID.
	 *
	 * @param scrobblerId Scrobbler ID
	 *
	 * @return Found scrobbler object
	 */
	getScrobblerById(scrobblerId: string): BaseScrobbler {
		for (const scrobbler of registeredScrobblers) {
			if (scrobbler.getId() === scrobblerId) {
				return scrobbler;
			}
		}

		return null;
	}

	sendScrobbleRequest(
		scrobblers: BaseScrobbler[],
		songInfo: SongInfo
	): Promise<ApiCallResult[]> {
		return Promise.all(
			scrobblers.map(async (scrobbler) => {
				// Forward result (including errors) to caller
				try {
					return scrobbler.scrobble(songInfo);
				} catch (result) {
					return this.processErrorResult(scrobbler, result);
				}
			})
		);
	}

	/**
	 * Process result received from scrobbler.
	 *
	 * @param scrobbler Scrobbler instance
	 * @param result API call result
	 *
	 * @return Promise resolved with result object
	 */
	async processErrorResult(
		scrobbler: BaseScrobbler,
		result: ApiCallResult
	): Promise<ApiCallResult> {
		const isOtherError = result.is(ApiCallResult.ERROR_OTHER);
		const isAuthError = result.is(ApiCallResult.ERROR_AUTH);

		if (!(isOtherError || isAuthError)) {
			throw new Error('Invalid result');
		}

		if (isAuthError) {
			// Don't unbind scrobblers which have tokens
			const isReady = await scrobbler.isReadyForGrantAccess();
			if (!isReady) {
				this.unbindScrobbler(scrobbler);
			}
		}

		// Forward result
		return result;
	}
})();
