import { App, TFile, TFolder } from "obsidian";
import { NeiAiChatSettings } from "../../../main";

export interface NeiSkill {
    name: string;
    description: string;
    instructions: string;
    path: string;
}

export class SkillsLoader {
    private static getSkillsRoot(settings: NeiAiChatSettings): string {
        return settings.skillsFolder || ".nei/skills";
    }

    public static async loadSkills(app: App, settings: NeiAiChatSettings): Promise<NeiSkill[]> {
        const skills: NeiSkill[] = [];
        const rootPath = this.getSkillsRoot(settings);
        const root = app.vault.getAbstractFileByPath(rootPath);
        
        if (!(root instanceof TFolder)) {
            return skills;
        }

        for (const child of root.children) {
            if (child instanceof TFolder) {
                const skillFile = app.vault.getAbstractFileByPath(`${child.path}/SKILL.md`);
                if (skillFile instanceof TFile) {
                    try {
                        const content = await app.vault.read(skillFile);
                        const parsed = this.parseSkillMarkdown(content, child.name, skillFile.path);
                        if (parsed) skills.push(parsed);
                    } catch (e) {
                        console.error(`[NEI Skills] Error loading skill ${child.name}:`, e);
                    }
                }
            }
        }

        return skills;
    }

    private static parseSkillMarkdown(content: string, folderName: string, path: string): NeiSkill | null {
        let name = folderName;
        let description = "";
        let instructions = content;

        // Extract Frontmatter if exists
        const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
        if (frontmatterMatch) {
            const yaml = frontmatterMatch[1];
            instructions = frontmatterMatch[2].trim();

            const nameMatch = yaml.match(/^name:\s*(.+)$/m);
            if (nameMatch) name = nameMatch[1].trim().replace(/^['"]|['"]$/g, "");

            const descMatch = yaml.match(/^description:\s*(.+)$/m);
            if (descMatch) description = descMatch[1].trim().replace(/^['"]|['"]$/g, "");
        }

        return {
            name,
            description: description || `Custom skill from ${folderName}`,
            instructions,
            path
        };
    }
}
