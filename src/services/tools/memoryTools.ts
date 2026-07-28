import { App } from "obsidian";
import { ToolDefinition, ToolExecutor } from "./types";
import { MemoryStore } from "../memory/memoryStore";
import { ensureFolderExists } from "./vaultTools";
import { NeiAiChatPlugin } from "../../../main";

export const memoryToolDefinitions: ToolDefinition[] = [
    {
        type: "function",
        function: {
            name: "save_to_memory",
            description: "Запомнить важный факт, правило или предпочтение пользователя в долгосрочную память (.nei/memory.json).",
            parameters: {
                type: "object",
                properties: {
                    fact: {
                        type: "string",
                        description: "Текст факта или предпочтения для запоминания"
                    }
                },
                required: ["fact"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "create_agent_skill",
            description: "Обучить агента новому скиллу (создать скилл в .nei/skills/<skill_name>/SKILL.md).",
            parameters: {
                type: "object",
                properties: {
                    skillName: {
                        type: "string",
                        description: "Имя скилла без пробелов (например, 'summarize_meetings')"
                    },
                    description: {
                        type: "string",
                        description: "Краткое описание скилла"
                    },
                    instructions: {
                        type: "string",
                        description: "Полные подробные инструкции работы скилла"
                    }
                },
                required: ["skillName", "description", "instructions"]
            }
        }
    }
];

export const memoryExecutors: Record<string, ToolExecutor> = {
    save_to_memory: async (app: App, rawArgs: Record<string, unknown>, plugin?: NeiAiChatPlugin) => {
        const args = rawArgs as { fact: string };
        try {
            await MemoryStore.addFact(app, plugin ? plugin.settings : undefined, args.fact);
            return `Успех: Факт '${args.fact}' сохранен в долгосрочную память агента.`;
        } catch (e: unknown) {
            const err = e as { message?: string };
            return `Ошибка сохранения в память: ${err?.message || String(e)}`;
        }
    },

    create_agent_skill: async (app: App, rawArgs: Record<string, unknown>, plugin?: NeiAiChatPlugin) => {
        const args = rawArgs as { skillName: string; description: string; instructions: string };
        const cleanName = args.skillName.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
        const skillsRoot = plugin ? plugin.settings.skillsFolder || ".nei/skills" : ".nei/skills";
        const skillPath = `${skillsRoot}/${cleanName}/SKILL.md`;

        const content = `---
name: "${cleanName}"
description: "${args.description}"
---

${args.instructions}
`;

        try {
            // Recursively ensure all parent folders exist
            await ensureFolderExists(app, `${skillsRoot}/${cleanName}`);

            const existingFile = app.vault.getAbstractFileByPath(skillPath);
            if (existingFile) {
                return `Ошибка: Скилл '${cleanName}' уже существует.`;
            }

            await app.vault.create(skillPath, content);
            return `Успех: Создан новый скилл ИИ '${cleanName}' по пути '${skillPath}'.`;
        } catch (e: unknown) {
            const err = e as { message?: string };
            return `Ошибка создания скилла: ${err?.message || String(e)}`;
        }
    }
};

