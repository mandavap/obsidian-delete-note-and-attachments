import {
	Plugin,
	TFile,
	Notice,
	Modal,
	App,
	Setting,
} from "obsidian";

interface AttachmentInfo {
	file: TFile;
	isShared: boolean;
	usedBy: TFile[]; // list of other notes that use this attachment
}

class ConfirmDeleteModal extends Modal {
	private attachments: AttachmentInfo[];
	private noteFile: TFile;
	private onConfirm: (deleteShared: boolean) => void;

	constructor(
		app: App,
		noteFile: TFile,
		attachments: AttachmentInfo[],
		onConfirm: (deleteShared: boolean) => void
	) {
		super(app);
		this.noteFile = noteFile;
		this.attachments = attachments;
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Delete Note and Attachments" });

		const uniqueAttachments = this.attachments.filter((a) => !a.isShared);
		const sharedAttachments = this.attachments.filter((a) => a.isShared);

		contentEl.createEl("p", {
			text: `You are about to delete "${this.noteFile.basename}".`,
		});

		if (uniqueAttachments.length > 0) {
			contentEl.createEl("p", {
				text: `${uniqueAttachments.length} attachment(s) are only used by this note and will be deleted:`,
			});

			const uniqueList = contentEl.createEl("ul");
			uniqueAttachments.forEach((a) => {
				uniqueList.createEl("li", { text: a.file.name });
			});
		}

		if (sharedAttachments.length > 0) {
			contentEl.createEl("p", {
				text: `${sharedAttachments.length} attachment(s) are also used by other notes:`,
				cls: "mod-warning",
			});

			const sharedList = contentEl.createEl("ul");
			sharedAttachments.forEach((a) => {
				const li = sharedList.createEl("li");
				li.createSpan({ text: a.file.name + " — " });
				
				// Add "show usage" link
				const showUsageLink = li.createEl("span", {
					text: `used by ${a.usedBy.length} other note(s)`,
				});
				showUsageLink.style.cursor = "pointer";
				showUsageLink.style.color = "var(--text-accent)";
				showUsageLink.style.textDecoration = "underline";
				
				// Create the usage list (hidden by default)
				const usageList = li.createEl("ul", { cls: "attachment-usage-list" });
				usageList.style.display = "none";
				usageList.style.marginTop = "4px";
				
				a.usedBy.forEach((usedByFile) => {
					const usageLi = usageList.createEl("li");
					const link = usageLi.createEl("span", {
						text: usedByFile.basename,
					});
					link.style.cursor = "pointer";
					link.style.color = "var(--text-accent)";
					link.style.textDecoration = "underline";
					link.addEventListener("click", (e) => {
						e.preventDefault();
						this.close();
						this.app.workspace.openLinkText(usedByFile.path, "", false);
					});
				});
				
				// Toggle usage list visibility
				let isExpanded = false;
				showUsageLink.addEventListener("click", (e) => {
					e.preventDefault();
					isExpanded = !isExpanded;
					usageList.style.display = isExpanded ? "block" : "none";
					showUsageLink.textContent = isExpanded 
						? "hide" 
						: `used by ${a.usedBy.length} other note(s)`;
				});
			});
		}

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });

		// Delete note only (if there are shared attachments)
		if (sharedAttachments.length > 0) {
			new Setting(buttonContainer)
				.addButton((btn) =>
					btn
						.setButtonText("Delete note + unique attachments")
						.onClick(() => {
							this.close();
							this.onConfirm(false);
						})
				)
				.addButton((btn) =>
					btn
						.setButtonText("Delete ALL (including shared)")
						.setWarning()
						.onClick(() => {
							this.close();
							this.onConfirm(true);
						})
				);
		} else {
			new Setting(buttonContainer).addButton((btn) =>
				btn
					.setButtonText("Delete")
					.setWarning()
					.onClick(() => {
						this.close();
						this.onConfirm(false);
					})
			);
		}

		new Setting(buttonContainer).addButton((btn) =>
			btn.setButtonText("Cancel").onClick(() => {
				this.close();
			})
		);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

export default class DeleteNoteAndAttachmentsPlugin extends Plugin {
	onload() {
		// Register file menu event (right-click on file in explorer)
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (file instanceof TFile && file.extension === "md") {
					menu.addItem((item) => {
						item
							.setTitle("Delete note and attachments")
							.setIcon("trash-2")
							.setSection("danger")
							.onClick(() => {
								this.deleteNoteWithAttachments(file);
							});
					});
				}
			})
		);

		this.addCommand({
			id: "delete-current-note-and-attachments",
			name: "Delete current note and attachments",
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile && activeFile.extension === "md") {
					if (!checking) {
						this.deleteNoteWithAttachments(activeFile);
					}
					return true;
				}
				return false;
			},
		});
	}

	/**
	 * Get all attachments embedded or linked in a note (any non-markdown file)
	 */
	private getAttachments(file: TFile): TFile[] {
		const attachments: TFile[] = [];
		const cache = this.app.metadataCache.getFileCache(file);

		if (!cache) return attachments;

		// Get embedded files (images, PDFs, etc.)
		const embeds = cache.embeds || [];
		for (const embed of embeds) {
			const linkedFile = this.app.metadataCache.getFirstLinkpathDest(
				embed.link,
				file.path
			);
			if (linkedFile instanceof TFile && linkedFile.extension !== "md") {
				if (!attachments.some((a) => a.path === linkedFile.path)) {
					attachments.push(linkedFile);
				}
			}
		}

		// Also check links - any non-markdown file is considered an attachment
		const links = cache.links || [];
		for (const link of links) {
			const linkedFile = this.app.metadataCache.getFirstLinkpathDest(
				link.link,
				file.path
			);
			if (linkedFile instanceof TFile && linkedFile.extension !== "md") {
				if (!attachments.some((a) => a.path === linkedFile.path)) {
					attachments.push(linkedFile);
				}
			}
		}

		return attachments;
	}

	/**
	 * Get list of other notes that use this attachment (besides the one being deleted)
	 */
	private getAttachmentUsage(attachment: TFile, excludeFile: TFile): TFile[] {
		const usedBy: TFile[] = [];
		const allFiles = this.app.vault.getMarkdownFiles();
		
		for (const file of allFiles) {
			// Skip the file we're deleting
			if (file.path === excludeFile.path) continue;
			
			const cache = this.app.metadataCache.getFileCache(file);
			if (!cache) continue;
			
			let found = false;
			
			// Check embeds
			const embeds = cache.embeds || [];
			for (const embed of embeds) {
				const linkedFile = this.app.metadataCache.getFirstLinkpathDest(
					embed.link,
					file.path
				);
				if (linkedFile && linkedFile.path === attachment.path) {
					found = true;
					break;
				}
			}
			
			// Check links if not found in embeds
			if (!found) {
				const links = cache.links || [];
				for (const link of links) {
					const linkedFile = this.app.metadataCache.getFirstLinkpathDest(
						link.link,
						file.path
					);
					if (linkedFile && linkedFile.path === attachment.path) {
						found = true;
						break;
					}
				}
			}
			
			if (found) {
				usedBy.push(file);
			}
		}

		return usedBy;
	}

	/**
	 * Delete a note and its attachments
	 */
	private deleteNoteWithAttachments(file: TFile) {
		const attachments = this.getAttachments(file);

		// Check which attachments are shared and get usage info
		const attachmentInfo: AttachmentInfo[] = attachments.map((a) => {
			const usedBy = this.getAttachmentUsage(a, file);
			return {
				file: a,
				isShared: usedBy.length > 0,
				usedBy: usedBy,
			};
		});

		if (attachmentInfo.length === 0) {
			// No attachments, just delete the note
			this.app.vault.trash(file, true);
			new Notice(`Deleted "${file.basename}"`);
			return;
		}

		// Show confirmation modal
		new ConfirmDeleteModal(
			this.app,
			file,
			attachmentInfo,
			(deleteShared: boolean) => {
				let deletedCount = 0;

				// Delete attachments
				for (const info of attachmentInfo) {
					if (!info.isShared || deleteShared) {
						try {
							this.app.vault.trash(info.file, true);
							deletedCount++;
						} catch (e) {
							console.error(`Failed to delete ${info.file.path}:`, e);
						}
					}
				}

				// Delete the note
				try {
					this.app.vault.trash(file, true);
					new Notice(
						`Deleted "${file.basename}" and ${deletedCount} attachment(s)`
					);
				} catch (e) {
					console.error(`Failed to delete ${file.path}:`, e);
					new Notice(`Failed to delete "${file.basename}"`);
				}
			}
		).open();
	}
}
