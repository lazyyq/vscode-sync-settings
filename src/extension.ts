import vscode from 'vscode';
import pkg from '../package.json';
import { createProfile } from './commands/create-profile.js';
import { deleteProfile } from './commands/delete-profile.js';
import { download } from './commands/download.js';
import { listMissingExtensions } from './commands/list-missing-extensions.js';
import { openProfileDirectory } from './commands/open-profile-directory.js';
import { openProfileSettings } from './commands/open-profile-settings.js';
import { openRepositoryDirectory } from './commands/open-repository-directory.js';
import { openSettings } from './commands/open-settings.js';
import { reset } from './commands/reset.js';
import { review } from './commands/review.js';
import { switchProfile } from './commands/switch-profile.js';
import { upload } from './commands/upload.js';
import { viewDifferences } from './commands/view-differences.js';
import { setupCrons } from './crons.js';
import { RepositoryFactory } from './repository-factory.js';
import { Settings } from './settings.js';
import { ThrottledDelayer } from './utils/async.js';
import { Logger } from './utils/logger.js';

const VERSION_KEY = 'version';

// Command item type for the tree view
type CommandItem = {
	label: string;
	command: string;
	description?: string;
	icon?: string;
};

// TreeDataProvider for commands view
class CommandsViewProvider implements vscode.TreeDataProvider<CommandItem> {
	private readonly _onDidChangeTreeData: vscode.EventEmitter<CommandItem | undefined | null | void> = new vscode.EventEmitter<CommandItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<CommandItem | undefined | null | void> = this._onDidChangeTreeData.event;

	private readonly commands: CommandItem[] = [
		{ label: 'Create a new profile', command: 'syncSettings.createProfile', description: 'Create a new profile', icon: 'add' },
		{ label: 'Delete a profile', command: 'syncSettings.deleteProfile', description: 'Delete a profile', icon: 'trash' },
		{ label: 'Download (repository -> user)', command: 'syncSettings.download', description: 'Download (repository -> user)', icon: 'cloud-download' },
		{ label: 'List the missing extensions', command: 'syncSettings.listMissingExtensions', description: 'List the missing extensions', icon: 'extensions' },
		{ label: 'Reveal the profile in the file explorer', command: 'syncSettings.openProfileDirectory', description: 'Reveal the profile in the file explorer', icon: 'folder-opened' },
		{ label: 'Open the profile settings', command: 'syncSettings.openProfileSettings', description: 'Open the profile settings', icon: 'gear' },
		{ label: 'Reveal the repository in the file explorer', command: 'syncSettings.openRepositoryDirectory', description: 'Reveal the repository in the file explorer', icon: 'repo' },
		{ label: 'Open the repository settings', command: 'syncSettings.openSettings', description: 'Open the repository settings', icon: 'settings-gear' },
		{ label: 'Remove all settings and extensions', command: 'syncSettings.reset', description: 'Remove all settings and extensions', icon: 'clear-all' },
		{ label: 'Prompt if a difference between actual and saved settings is found', command: 'syncSettings.review', description: 'Prompt if a difference between actual and saved settings is found', icon: 'eye' },
		{ label: 'Switch to profile', command: 'syncSettings.switchProfile', description: 'Switch to profile', icon: 'arrow-swap' },
		{ label: 'Upload (user -> repository)', command: 'syncSettings.upload', description: 'Upload (user -> repository)', icon: 'cloud-upload' },
		{ label: 'View differences between actual and saved settings', command: 'syncSettings.viewDifferences', description: 'View differences between actual and saved settings', icon: 'diff' },
	];

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: CommandItem): vscode.TreeItem {
		const treeItem = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);

		// Set icon
		treeItem.iconPath = new vscode.ThemeIcon(element.icon ?? 'play');

		// Add description to tooltip
		treeItem.tooltip = element.description;

		// Configure command execution
		treeItem.command = {
			command: element.command,
			title: element.label,
		};

		// Set context value for button styling
		treeItem.contextValue = 'button';

		return treeItem;
	}

	getChildren(): CommandItem[] {
		return this.commands;
	}
}

async function showWhatsNewMessage(version: string) {
	const actions: vscode.MessageItem[] = [{
		title: 'Homepage',
	}, {
		title: 'Release Notes',
	}];

	const result = await vscode.window.showInformationMessage(
		`Sync Settings has been updated to v${version} — check out what's new!`,
		...actions,
	);

	if(result !== null) {
		if(result === actions[0]) {
			await vscode.commands.executeCommand(
				'vscode.open',
				vscode.Uri.parse(`${pkg.homepage}`),
			);
		}
		else if(result === actions[1]) {
			await vscode.commands.executeCommand(
				'vscode.open',
				vscode.Uri.parse(`${pkg.homepage}/blob/master/CHANGELOG.md`),
			);
		}
	}
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	context.globalState.setKeysForSync([VERSION_KEY]);

	const previousVersion = context.globalState.get<string>(VERSION_KEY);
	const currentVersion = pkg.version;

	const config = vscode.workspace.getConfiguration('syncSettings');

	if(previousVersion === undefined || currentVersion !== previousVersion) {
		void context.globalState.update(VERSION_KEY, currentVersion);

		const notification = config.get<string>('notification');

		if(previousVersion === undefined) {
			// don't show notification on install
		}
		else if(notification === 'major') {
			if(currentVersion.split('.')[0] > previousVersion.split('.')[0]) {
				void showWhatsNewMessage(currentVersion);
			}
		}
		else if(notification === 'minor') {
			if(currentVersion.split('.')[0] > previousVersion.split('.')[0] || (currentVersion.split('.')[0] === previousVersion.split('.')[0] && currentVersion.split('.')[1] > previousVersion.split('.')[1])) {
				void showWhatsNewMessage(currentVersion);
			}
		}
		else if(notification !== 'none') {
			void showWhatsNewMessage(currentVersion);
		}
	}

	await Settings.load(context);

	const disposables: vscode.Disposable[] = [];

	disposables.push(
		vscode.commands.registerCommand('syncSettings.createProfile', createProfile),
		vscode.commands.registerCommand('syncSettings.deleteProfile', deleteProfile),
		vscode.commands.registerCommand('syncSettings.download', download),
		vscode.commands.registerCommand('syncSettings.listMissingExtensions', listMissingExtensions),
		vscode.commands.registerCommand('syncSettings.openProfileDirectory', openProfileDirectory),
		vscode.commands.registerCommand('syncSettings.openProfileSettings', openProfileSettings),
		vscode.commands.registerCommand('syncSettings.openRepositoryDirectory', openRepositoryDirectory),
		vscode.commands.registerCommand('syncSettings.openSettings', openSettings),
		vscode.commands.registerCommand('syncSettings.reset', reset),
		vscode.commands.registerCommand('syncSettings.review', review),
		vscode.commands.registerCommand('syncSettings.switchProfile', switchProfile),
		vscode.commands.registerCommand('syncSettings.upload', upload),
		vscode.commands.registerCommand('syncSettings.viewDifferences', viewDifferences),
	);

	// Register the commands view provider
	const commandsProvider = new CommandsViewProvider();
	disposables.push(
		vscode.window.registerTreeDataProvider('syncSettingsCommands', commandsProvider),
	);

	const settings = Settings.get();
	const fileChangesDelayer = new ThrottledDelayer<void>(200);
	const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.joinPath(settings.settingsUri, '..').fsPath, 'settings.yml'));

	watcher.onDidChange(() => {
		void fileChangesDelayer.trigger(async () => {
			try {
				await RepositoryFactory.reload();
			}
			catch (error: unknown) {
				Logger.error(error);
			}
		});
	});

	await setupCrons();

	vscode.workspace.onDidChangeConfiguration(async (event) => {
		if(event.affectsConfiguration('syncSettings.crons')) {
			await setupCrons();
		}
	});

	context.subscriptions.push(...disposables);
}
