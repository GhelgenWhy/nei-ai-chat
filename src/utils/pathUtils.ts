import { normalizePath } from "obsidian";
import { NeiAiChatSettings } from "../../main";

export function getNoteSavePath(settings: NeiAiChatSettings, requestedPath: string): string {
    const defaultFolder = settings.defaultNoteFolder.trim();
    if (defaultFolder && !requestedPath.startsWith(defaultFolder + '/')) {
        return normalizePath(`${defaultFolder}/${requestedPath}`);
    }
    return normalizePath(requestedPath);
}
