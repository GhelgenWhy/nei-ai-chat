import { App } from "obsidian";
import { ToolDefinition, ToolExecutor } from "./types";
import { MemoryStore } from "../memory/memoryStore";

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
    save_to_memory: async (app: App, args: { fact: string }) => {
        try {
            await MemoryStore.addFact(app, args.fact);
            return `Успех: Факт '${args.fact}' сохранен в долгосрочную память агента (.nei/memory.json).`;
        } catch (e: any) {
            return `Ошибка сохранения в память: ${e?.message || e}`;
        }
    },

    create_agent_skill: async (app: App, args: { skillName: string; description: string; instructions: string }) => {
        const cleanName = args.skillName.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
        const skillPath = `.nei/skills/${cleanName}/SKILL.md`;

        const content = `---
name: "${cleanName}"
description: "${args.description}"
---

${args.instructions}
`;

        try {
            // Ensure folder exists
            const folderPath = `.nei/skills/${cleanName}`;
            const folder = app.vault.getAbstractFileByPath(folderPath);
            if (!folder) {
                await app.vault.createFolder(folderPath);
            }

            const existingFile = app.vault.getAbstractFileByPath(skillPath);
            if (existingFile) {
                return `Ошибка: Скилл '${cleanName}' уже существует.`;
            }

            await app.vault.create(skillPath, content);
            return `Успех: Создан новый скилл ИИ '${cleanName}' по пути '${skillPath}'.`;
        } catch (e: any) {
            return `Ошибка создания скилла: ${e?.message || e}`;
        }
    }
};
