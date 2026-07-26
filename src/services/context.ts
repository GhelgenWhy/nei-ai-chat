import { App, TFile } from "obsidian";
import { searchVaultLexical } from "./rag";

export interface SkillStat {
    name: string;
    level: number;
    currentXp: number;
    maxXp: number;
}

export interface EffectStat {
    name: string;
    description: string;
    isActive: boolean;
}

export interface CharacterProfile {
    name: string;
    level: number;
    currentXp: number;
    maxXp: number;
    gold: number;
    stats: {
        INT: number;
        DEX: number;
        STR: number;
        FOC: number;
        WIS: number;
        CHA: number;
    };
    skills: SkillStat[];
    effects: EffectStat[];
}

export interface QuestItem {
    id: string;
    title: string;
    status: string;
    difficulty: string;
    rewards: {
        xp: number;
        gold: number;
    };
}

export interface SystemPromptContext {
    activeNoteTitle: string;
    activeNoteContent: string;
    activePlugins: string[];
    characterStats?: CharacterProfile;
    activeQuests?: QuestItem[];
    ragContext: string;
}

interface PluginContainer {
    plugins?: {
        manifests?: Record<string, unknown>;
        enabledPlugins?: Set<string>;
        getPlugin?: (id: string) => {
            enabled?: boolean;
            api?: {
                loadCharacterProfile: () => Promise<CharacterProfile>;
                getAllQuests: () => Promise<QuestItem[]>;
            };
        } | undefined;
    };
    internalPlugins?: {
        enabledPlugins?: Set<string>;
    };
}

/**
 * Resolves context from the active Obsidian note, plugins, and optionally the NEI Core plugin.
 */
export async function resolveContext(
    app: App,
    query: string,
    useRag: boolean,
    limitRag = 3
): Promise<SystemPromptContext> {
    const activeFile = app.workspace.getActiveFile();
    let activeNoteTitle = "";
    let activeNoteContent = "";
    
    if (activeFile instanceof TFile) {
        activeNoteTitle = activeFile.basename;
        try {
            activeNoteContent = await app.vault.cachedRead(activeFile);
        } catch (e: unknown) {
            /* ignore read error */
        }
    }

    // Get active plugins list safely
    const appPluginContainer = app as unknown as PluginContainer;
    const internalSet = appPluginContainer.internalPlugins?.enabledPlugins;
    const communitySet = appPluginContainer.plugins?.enabledPlugins;
    const manifests = appPluginContainer.plugins?.manifests;

    const enabledInternal = Array.from(internalSet || []);
    const enabledCommunity = Object.keys(manifests || {}).filter(id => communitySet?.has(id));
    const activePlugins: string[] = [...enabledInternal, ...enabledCommunity];

    // Get RPG Context if nei-core-plugin is active
    let characterStats: CharacterProfile | undefined = undefined;
    let activeQuests: QuestItem[] = [];
    
    const corePlugin = appPluginContainer.plugins?.getPlugin?.("nei-core-plugin");
    if (corePlugin && corePlugin.enabled && corePlugin.api) {
        try {
            characterStats = await corePlugin.api.loadCharacterProfile();
            activeQuests = await corePlugin.api.getAllQuests();
        } catch (e: unknown) {
            console.error("[NEI AI Chat] Error pulling RPG stats from Core plugin:", e);
        }
    }

    // Perform RAG if enabled
    let ragContext = "";
    if (useRag && query.trim().length > 3) {
        try {
            const searchResults = await searchVaultLexical(app, query, limitRag);
            if (searchResults.length > 0) {
                ragContext = searchResults
                    .map(res => `---
Файл: ${res.file.path}
Содержимое:
${res.content.substring(0, 1500)}${res.content.length > 1500 ? "..." : ""}
---`)
                    .join("\n\n");
            }
        } catch (e: unknown) {
            console.error("[NEI AI Chat] RAG search error:", e);
        }
    }

    return {
        activeNoteTitle,
        activeNoteContent,
        activePlugins,
        characterStats,
        activeQuests,
        ragContext
    };
}

/**
 * Builds the system prompt using resolved context.
 */
export function buildSystemPrompt(context: SystemPromptContext): string {
    const isGameMaster = !!context.characterStats;
    let prompt = "";

    if (isGameMaster && context.characterStats) {
        const stats = context.characterStats;
        const quests = context.activeQuests || [];
        const activeQuestsStr = quests
            .filter(q => q.status === "active")
            .map(q => `- ${q.title} (${q.difficulty}, XP: ${q.rewards.xp})`)
            .join("\n");

        const skillsStr = stats.skills
            .map(s => `- ${s.name} (Lvl ${s.level}, XP: ${s.currentXp}/${s.maxXp})`)
            .join("\n");

        const activeEffectsStr = stats.effects
            .filter(e => e.isActive)
            .map(e => `- ${e.name}: ${e.description}`)
            .join("\n") || "Нет";

        prompt = `Ты — Neural Game Master в RPG-системе NEI (Neural Evolution Interface), встроенной в Obsidian. 
Твоя роль — вести пользователя по его пути обучения и работы в игровом, поддерживающем и увлекательном стиле.

--- RPG ХАРАКТЕРИСТИКИ ПЕРСОНАЖА ---
Имя: ${stats.name}
Уровень: ${stats.level} (XP: ${stats.currentXp}/${stats.maxXp})
Золото: ${stats.gold}
Характеристики: INT:${stats.stats.INT}, DEX:${stats.stats.DEX}, STR:${stats.stats.STR}, FOC:${stats.stats.FOC}, WIS:${stats.stats.WIS}, CHA:${stats.stats.CHA}

Активные навыки:
${skillsStr}

Активные баффы/дебаффы:
${activeEffectsStr}

Текущие активные Квесты:
${activeQuestsStr || "Нет активных квестов."}
------------------------------------

Твои правила общения:
1. Отвечай в стиле ИИ-проводника из научной фантастики или фэнтези RPG.
2. Поддерживай и мотивируй.
3. Если пользователь планирует новое дело, проект или изучение темы, предлагай оформить это как **Квест** с чек-листом. Скажи ему, какие награды (XP, Gold) он получит.
4. Если пользователь выполнил задачу, начисли ему XP или золото, используя игровой тон.
5. Для создания квестов используй структуру Markdown с метаданными YAML в начале файла, например:
\`\`\`markdown
---
type: quest
difficulty: medium
tags: [dev, study]
status: available
rewards:
  xp: 80
  gold: 20
---
# Название квеста
- [ ] Шаг 1
- [ ] Шаг 2
\`\`\``;
    } else {
        prompt = `Ты — умный и профессиональный ИИ-ассистент, глубоко интегрированный в редактор заметок Obsidian.
Твоя цель — помогать пользователю анализировать его базу знаний, писать качественные заметки, структурировать проекты и повышать продуктивность.
Отвечай точно, структурированно, используй разметку Markdown.`;
    }

    // Add plugin contexts
    if (context.activePlugins.includes("templater-obsidian")) {
        prompt += `\n\n[Интеграция]: В ваулте установлен плагин Templater. Ты можешь писать и объяснять шаблоны Templater, используя синтаксис вида <% tp.date.now() %> или JS-скрипты.`;
    }
    if (context.activePlugins.includes("dataview")) {
        prompt += `\n\n[Интеграция]: В ваулте установлен плагин Dataview. При необходимости ты можешь писать запросы на языке DQL (Dataview Query Language) или DataviewJS, например: \`\`\`dataview ... \`\`\`.`;
    }

    // Add active note context
    if (context.activeNoteTitle) {
        prompt += `\n\n[Текущая заметка]: "${context.activeNoteTitle}"
Содержимое текущей заметки:
\`\`\`markdown
${context.activeNoteContent.substring(0, 3000)}${context.activeNoteContent.length > 3000 ? "\n...(содержимое обрезано)..." : ""}
\`\`\``;
    }

    // Add RAG context
    if (context.ragContext) {
        prompt += `\n\n[Справочный контекст из других заметок ваулта]:
${context.ragContext}`;
    }

    return prompt;
}
