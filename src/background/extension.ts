import { browser } from 'webextension-polyfill-ts';

import {
	BaseScrobbler,
	UserProperties,
} from '@/background/scrobbler/base-scrobbler';
import { BrowserStorage } from '@/background/storage/browser-storage';
import { Controller, ControllerEvent } from '@/background/object/controller';
import { ScrobbleManager } from '@/background/scrobbler/scrobble-manager';
import { StorageWrapper } from '@/background/storage/storage-wrapper';
import { TabWorker } from '@/background/object/tab-worker';

import { openTab } from '@/common/util-browser';
import {
	MessageType,
	Request,
	Message,
	ScrobblerRequestResponse,
	UserPropertiesResponse,
} from '@/common/messages';
import {
	clearNowPlaying,
	showAuthNotification,
	showSignInError,
	showNowPlaying,
	showSongNotRecognized,
} from '@/background/browser/notifications';

/**
 * How many times to show auth notification.
 */
const authNotificationDisplayCount = 3;

interface CoreStorage {
	appVersion: string;
}

interface AuthNotificationsStorage {
	authDisplayCount: number;
}

export class Extension {
	private tabWorker: TabWorker;
	private extVersion: string;
	private notificationStorage: StorageWrapper;

	constructor() {
		this.extVersion = browser.runtime.getManifest().version;
		this.notificationStorage = BrowserStorage.getStorage(
			BrowserStorage.NOTIFICATIONS
		);

		this.tabWorker = new (class extends TabWorker {
			async onControllerEvent(ctrl: Controller, event: ControllerEvent) {
				switch (event) {
					case ControllerEvent.Reset: {
						const song = ctrl.getCurrentSong();
						if (song) {
							clearNowPlaying(song);
						}
						break;
					}

					case ControllerEvent.SongNowPlaying: {
						const song = ctrl.getCurrentSong();
						if (song.flags.isReplaying) {
							return;
						}
						const { label } = ctrl.getConnector();

						showNowPlaying(song, label, () => {
							openTab(ctrl.tabId);
						});
						break;
					}

					case ControllerEvent.SongUnrecognized: {
						const song = ctrl.getCurrentSong();
						await showSongNotRecognized(song, () => {
							openTab(ctrl.tabId);
						});
						break;
					}
				}
			}
		})();

		this.initializeListeners();
	}

	/**
	 * Entry point.
	 */
	async start(): Promise<void> {
		await this.updateVersionInStorage();

		if (!(await this.bindScrobblers())) {
			console.warn('No scrobblers are bound');

			this.showAuthNotification();
		}
	}

	private initializeListeners(): void {
		browser.runtime.onMessage.addListener((request: Message) => {
			const { tabId, type, data } = request;

			return this.processMessage(tabId, type, data);
		});

		try {
			browser.commands.onCommand.addListener((command: string) => {
				this.tabWorker.processCommand(command);
			});
		} catch (e) {
			// Don't let the extension fail on Firefox for Android.
		}

		browser.tabs.onUpdated.addListener((_, changeInfo, tab) => {
			if (changeInfo.status !== 'complete') {
				return;
			}

			this.tabWorker.processTabUpdate(tab.id, tab.url);
		});

		browser.tabs.onRemoved.addListener((tabId) => {
			this.tabWorker.processTabRemove(tabId);
		});

		browser.tabs.onActivated.addListener((activeInfo) => {
			return this.tabWorker.processTabChange(activeInfo.tabId);
		});

		browser.runtime.onConnect.addListener((port) => {
			port.onMessage.addListener((message: Message) => {
				const { type, data } = message;
				const tabId = port.sender.tab.id;

				return this.tabWorker.processPortMessage(tabId, type, data);
			});
		});
	}

	/**
	 * Called when something sent message to the background script
	 * via `browser.runtime.sendMessage` function.
	 *
	 * @param tabId ID of a tab to which the message is addressed
	 * @param type Message type
	 * @param data Object contains data sent in the message
	 */
	private async processMessage(
		tabId: number,
		type: MessageType,
		data: unknown
	): Promise<unknown> {
		if (tabId) {
			return this.tabWorker.processMessage(tabId, type, data);
		}

		switch (type) {
			case Request.GetActiveTabId:
				return this.tabWorker.getActiveTabId();
		}

		const { scrobblerId } = data as ScrobblerRequestResponse;
		const scrobbler = ScrobbleManager.getScrobblerById(scrobblerId);
		if (!scrobbler) {
			console.log(`Unknown scrobbler ID: ${scrobblerId}`);
			return;
		}

		switch (type) {
			case Request.SignIn:
				this.authenticateScrobbler(scrobbler);
				break;

			case Request.SignOut:
				await scrobbler.signOut();
				break;

			case Request.ApplyUserProperties: {
				const { userProps } = data as UserPropertiesResponse;
				await this.applyUserProperties(scrobbler, userProps);
				break;
			}
		}
	}

	/**
	 * Replace the extension version stored in local storage by current one.
	 */
	private async updateVersionInStorage(): Promise<void> {
		const storage = BrowserStorage.getStorage(BrowserStorage.CORE);
		const data = (await storage.get()) as CoreStorage;

		data.appVersion = this.extVersion;
		await storage.set(data);

		void storage.debugLog();
	}

	/**
	 * Ask a scrobble service to bind scrobblers.
	 *
	 * @return True if at least one scrobbler is registered;
	 *                   false if no scrobblers are registered
	 */
	private async bindScrobblers(): Promise<boolean> {
		const boundScrobblers = await ScrobbleManager.bindAllScrobblers();
		return boundScrobblers.length > 0;
	}

	private async showAuthNotification(): Promise<void> {
		if (await this.isAuthNotificationAllowed()) {
			const authUrl = browser.runtime.getURL(
				'/ui/options/index.html#accounts'
			);
			try {
				await showAuthNotification(() => {
					void browser.tabs.create({ url: authUrl });
				});
			} catch (e) {
				// Fallback for browsers with no notifications support.
				void browser.tabs.create({ url: authUrl });
			}

			await this.updateAuthDisplayCount();
		}
	}

	/**
	 * Ask user for grant access for service covered by given scrobbler.
	 *
	 * @param scrobbler Scrobbler instance
	 */
	private async authenticateScrobbler(
		scrobbler: BaseScrobbler
	): Promise<void> {
		try {
			const authUrl = await scrobbler.getAuthUrl();

			ScrobbleManager.bindScrobbler(scrobbler);
			browser.tabs.create({ url: authUrl });
		} catch (e) {
			console.log(`Unable to get auth URL for ${scrobbler.getLabel()}`);

			showSignInError(scrobbler, () => {
				const statusUrl = scrobbler.getStatusUrl();
				if (statusUrl) {
					browser.tabs.create({ url: statusUrl });
				}
			});
		}
	}

	private async applyUserProperties(
		scrobbler: BaseScrobbler,
		userProps: UserProperties
	): Promise<void> {
		await scrobbler.applyUserProperties(userProps);
		ScrobbleManager.bindScrobbler(scrobbler);
	}

	/**
	 * Check if extension should display auth notification.
	 *
	 * @return Check result
	 */
	private async isAuthNotificationAllowed(): Promise<boolean> {
		const data = (await this.notificationStorage.get()) as AuthNotificationsStorage;

		const authDisplayCount = data.authDisplayCount || 0;
		return authDisplayCount < authNotificationDisplayCount;
	}

	/**
	 * Update internal counter of displayed auth notifications.
	 */
	private async updateAuthDisplayCount(): Promise<void> {
		const data = (await this.notificationStorage.get()) as AuthNotificationsStorage;
		const authDisplayCount = data.authDisplayCount || 0;

		data.authDisplayCount = authDisplayCount + 1;
		await this.notificationStorage.set(data);
	}
}
