import { browser } from 'webextension-polyfill-ts';

import StorageWrapper from '@/background/storage/storage-wrapper';

const LOCAL = 0;
const SYNC = 1;

/**
 * This storage contains the options values.
 * @see DEFAULT_CONNECTOR_OPTIONS_MAP object in `config` module.
 */
const CONNECTORS_OPTIONS = 'Connectors';

/**
 * This storage contains custom URL patterns defined by an user.
 *
 * The format of storage data is following:
 * {
 *     connector_id: [URL_pattern_1, URL_pattern_2, ...],
 *     ...
 * }
 */
const CUSTOM_PATTERNS = 'customPatterns';

/**
 * This storage contains data used to manage notifications.
 *
 * The `changelog` section contains data is used to check
 * if user notified of changelog of certain version.
 *
 * The format of storage data is following:
 * {
 *     changelog: {
 *     	   // `ver` is the extention version, e.g. 'v2.15.1'
 *     	   // `true` means the notification of the version changelog
 *     	   // was displayed.
 *         ver: true,
 *         ...
 *     }
 * }
 */
const NOTIFICATIONS = 'Notifications';

/**
 * This storage contains the song data saved by an user.
 * The format of storage data is following:
 * {
 *     song_id: {
 *         artist: 'Artist name',
 *         track: 'Track name',
 *         album: 'Album name', // Optional property
 *     },
 *     ...
 * }
 */
const LOCAL_CACHE = 'LocalCache';

/**
 * This storage contains the options values.
 * @see DEFAULT_OPTIONS_MAP object in `config` module.
 */
const OPTIONS = 'Options';

/**
 * This storage contains the data saved and used by the extension core.
 * The format of storage data is following:
 * {
 *     appVersion: 'Extension version',
 * }
 */
const CORE = 'Core';

const SCROBBLE_STORAGE = 'ScrobbleStorage';

const storageTypeMap = {
	[CONNECTORS_OPTIONS]: SYNC,
	[CUSTOM_PATTERNS]: SYNC,
	[NOTIFICATIONS]: SYNC,
	[OPTIONS]: SYNC,

	[SCROBBLE_STORAGE]: LOCAL,
	[LOCAL_CACHE]: LOCAL,
	[CORE]: LOCAL,
};

/**
 * Return storage by given namespace according storage type map.
 *
 * @param namespace Storage namespace
 *
 * @return StorageWrapper instance
 *
 * @throws {Error} if unknown namespace is specified
 */
function getStorage(namespace: string): StorageWrapper {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const storageType = storageTypeMap[namespace];
	switch (storageType) {
		case SYNC:
			return getSyncStorage(namespace);
		case LOCAL:
			return getLocalStorage(namespace);
		default:
			throw new Error(`Unknown storage namespace: ${namespace}`);
	}
}

/**
 * Return storage by given scrobbler storage namespace.
 *
 * @param namespace Scrobbler storage namespace
 *
 * @return StorageWrapper instance
 */
function getScrobblerStorage(namespace: string): StorageWrapper {
	return getLocalStorage(namespace);
}

/**
 * Return local storage wrapped into StorageWrapper object.
 *
 * @param namespace Scrobbler storage namespace
 *
 * @return StorageWrapper instance
 */
function getLocalStorage(namespace: string): StorageWrapper {
	const storageArea = browser.storage.local;
	return new StorageWrapper(storageArea, namespace);
}

/**
 * Return sync storage wrapped into StorageWrapper object.
 * Local storage is used as fallback.
 *
 * @param namespace Scrobbler storage namespace
 *
 * @return StorageWrapper instance
 */
function getSyncStorage(namespace: string): StorageWrapper {
	const storageArea = browser.storage.sync || browser.storage.local;
	return new StorageWrapper(storageArea, namespace);
}

export default {
	getLocalStorage,
	getScrobblerStorage,
	getStorage,
	getSyncStorage,

	CONNECTORS_OPTIONS,
	CORE,
	CUSTOM_PATTERNS,
	LOCAL_CACHE,
	NOTIFICATIONS,
	OPTIONS,
	SCROBBLE_STORAGE,
};
