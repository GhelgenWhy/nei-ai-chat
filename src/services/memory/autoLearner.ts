import { App } from 'obsidian';
import { ChatMessage, sendChatRequest, LlmConfig } from '../llm';
import { MemoryStore, NeiMemory } from './memoryStore';
import { NeiAiChatSettings } from '../../../main';

export interface LearningProposal {
    facts: string[];
    preferences: Record<string, string>;
    skillIdeas: Array<{ name: string; description: string; instructions: string }>;
}

export class AutoLearner {
    private static EXTRACT_PROMPT = `Analyze this conversation and extract useful information. Return ONLY valid JSON with this structure:
{
  "facts": ["specific fact 1", "specific fact 2"],
  "preferences": { "key": "value" },
  "skillIdeas": [{ "name": "snake_case_name", "description": "what it does", "instructions": "step by step" }]
}

Rules:
- Only extract genuinely useful, specific facts (not generic statements)
- Preferences should capture user's working style, formatting preferences, etc.
- Skill ideas should be for repetitive tasks that could be automated
- If nothing useful to extract, return { "facts": [], "preferences": {}, "skillIdeas": [] }`;

    static async extractAndPropose(
        config: LlmConfig,
        messages: ChatMessage[]
    ): Promise<LearningProposal | null> {
        // Need at least 4 messages for meaningful extraction
        if (messages.length < 4) return null;

        // Take last 20 messages max to save tokens
        const recentMessages = messages.slice(-20);
        const conversationText = recentMessages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => `${m.role}: ${typeof m.content === 'string' ? m.content.substring(0, 500) : ''}`)
            .join('\n\n');

        if (conversationText.length < 100) return null;

        try {
            const result = await sendChatRequest(config, [
                { role: 'system', content: AutoLearner.EXTRACT_PROMPT },
                { role: 'user', content: conversationText }
            ]);

            // Parse JSON from response (handle markdown code blocks)
            let jsonStr = result.content.trim();
            const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) jsonStr = jsonMatch[1].trim();

            const proposal = JSON.parse(jsonStr) as LearningProposal;

            // Validate structure
            if (!Array.isArray(proposal.facts)) proposal.facts = [];
            if (!proposal.preferences || typeof proposal.preferences !== 'object') proposal.preferences = {};
            if (!Array.isArray(proposal.skillIdeas)) proposal.skillIdeas = [];

            // Filter empty results
            if (proposal.facts.length === 0 && proposal.skillIdeas.length === 0 && Object.keys(proposal.preferences).length === 0) {
                return null;
            }

            return proposal;
        } catch (e) {
            console.warn('[AutoLearner] Extraction failed:', e);
            return null;
        }
    }

    static async applyProposal(
        app: App,
        settings: NeiAiChatSettings,
        proposal: LearningProposal
    ): Promise<number> {
        let applied = 0;

        // Save facts to memory
        for (const fact of proposal.facts) {
            if (fact && fact.trim().length > 5) {
                await MemoryStore.addFact(app, settings, fact.trim());
                applied++;
            }
        }

        // Save preferences to memory
        if (Object.keys(proposal.preferences).length > 0) {
            const memory = await MemoryStore.loadMemory(app, settings);
            memory.userPreferences = { ...memory.userPreferences, ...proposal.preferences };
            await MemoryStore.saveMemory(app, settings, memory);
            applied += Object.keys(proposal.preferences).length;
        }

        return applied;
    }
}
