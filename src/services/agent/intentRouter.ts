import { t, SupportedLanguage } from "../../i18n/translations";
import { ChatMessage } from "../llm";
import { getModelTemporalInfo, isQueryLikelyStale } from "../modelRegistry";
import { NeiAiChatSettings } from "../../../main";

export type ExecutionMode = 'auto' | 'quick' | 'agent';

export interface IntentFeatures {
    hasAttachments: boolean;
    hasVaultKeywords: number;
    hasCreationPatterns: number;
    hasDeletionPatterns: number;
    hasAnalysisPatterns: number;
    hasSearchPatterns: number;
    hasModifyPatterns: number;
    hasQuestionPatterns: number;
    hasCodePatterns: boolean;
    queryLength: number;
    complexityScore: number;
    recentAgentTurns: number;
    recentToolCalls: number;
    isStaleQuery: boolean;
    modelKnowledgeCutoff: string;
    modelSupportsWebSearch: boolean;
    daysSinceCutoff: number;
}

export interface ScoringWeights {
    vaultKeywordWeight: number;      // default: 2.0
    creationPatternWeight: number;   // default: 3.0
    deletionPatternWeight: number;   // default: 4.0
    analysisPatternWeight: number;   // default: 2.5
    searchPatternWeight: number;     // default: 1.5
    modifyPatternWeight: number;     // default: 1.5
    questionPatternWeight: number;   // default: -1.5 (Quick bias)
    codePatternWeight: number;       // default: -1.0 (Quick bias)
    lengthWeight: number;            // default: 0.005
    historyWeight: number;           // default: 0.3
    attachmentWeight: number;        // default: 5.0
    staleQueryWeight: number;        // default: 3.0
    freshnessWeight: number;         // default: 2.0
}

export interface ToolNeeds {
    needsWebSearch: boolean;
    needsVaultSearch: boolean;
    needsVaultWrite: boolean;
    needsCodeExecution: boolean;
    recommendedMode: 'quick' | 'agent';
    confidence: number;
    reasoning: string[];
}

export interface IntentDecision {
    mode: 'quick' | 'agent';
    reason: string;
    confidence: number;        // 0..1 (sigmoid)
    toolNeeds?: ToolNeeds;
    debug?: { features: IntentFeatures; score: number };
}

export class IntentRouter {
    public static estimateComplexity(query: string): number {
        const lower = query.toLowerCase();
        const actionVerbs = ["создай", "найди", "проанализируй", "сравни", "объясни", "напиши", "изучи", "подготовь", "спланируй", "организуй", "create", "find", "analyze", "compare", "explain", "write", "study", "prepare", "plan", "organize"];
        const matchedVerbs = new Set(actionVerbs.filter(v => lower.includes(v)));
        const clauses = (query.match(/[,.]/g) || []).length + 1;
        return matchedVerbs.size * 0.5 + clauses * 0.2;
    }

    /**
     * Extracts numerical intent features from user query, attachments, recent conversation history, and model temporal metadata.
     */
    public static extractFeatures(
        userQuery: string,
        hasAttachments: boolean = false,
        chatHistory: ChatMessage[] = [],
        modelId: string = "google/gemini-2.5-flash"
    ): IntentFeatures {
        const queryLower = userQuery.trim().toLowerCase();

        // Keyword & pattern sets
        const vaultKeywords = [
            "ваулт", "vault", "хранилище", "папка", "папке", "заметка", "заметке", "заметки", "файл", "файле",
            "таски", "notes", "folder"
        ];
        const creationPatterns = [
            "создай", "создать", "напиши заметку", "сделай заметку", "сгенерируй заметку", "сохрани", "сохранить",
            "запиши в", "создай в", "create note", "make note", "write note", "save note", "create folder", "create file"
        ];
        const deletionPatterns = [
            "удали", "удалить", "стереть", "сотри", "delete note", "remove note", "delete folder"
        ];
        const analysisPatterns = [
            "проанализируй", "сравни", "сканируй", "скан", "проверь", "структурируй", "обобщи", "analyze", "scan", "check notes", "summarize vault"
        ];
        const searchPatterns = [
            "найди", "поищи", "найди в", "поиск", "search", "find", "lookup"
        ];
        const modifyPatterns = [
            "переименуй", "обнови", "сгруппируй", "измени", "добавь в", "дополни", "update", "rename", "append"
        ];
        const questionPatterns = [
            "что такое", "как сделать", "объясни", "переведи", "перефразируй", "что значит", "какая разница",
            "what is", "how to", "explain", "translate", "why does"
        ];
        const codePatterns = [
            "напиши код", "напиши функцию", "напиши скрипт", "write code", "write script", "code snippet", "```"
        ];

        const countMatches = (patterns: string[]) => patterns.reduce((acc, p) => acc + (queryLower.includes(p) ? 1 : 0), 0);

        const hasVaultKeywords = countMatches(vaultKeywords);
        const hasCreationPatterns = countMatches(creationPatterns);
        const hasDeletionPatterns = countMatches(deletionPatterns);
        const hasAnalysisPatterns = countMatches(analysisPatterns);
        const hasSearchPatterns = countMatches(searchPatterns);
        const hasModifyPatterns = countMatches(modifyPatterns);
        const hasQuestionPatterns = countMatches(questionPatterns);
        const hasCodePatterns = codePatterns.some(p => queryLower.includes(p));

        // Analyze recent chat history (last 5 messages)
        const recentHistory = chatHistory.slice(-5);
        const recentAgentTurns = recentHistory.filter(m => m.role === 'assistant' && (m.tool_calls || m.content.includes("🔧") || m.content.includes("Agent"))).length;
        const recentToolCalls = recentHistory.filter(m => m.role === 'tool' || (m.tool_calls && m.tool_calls.length > 0)).length;

        const complexityScore = (hasCreationPatterns * 2) + (hasDeletionPatterns * 3) + (hasAnalysisPatterns * 2) + (hasModifyPatterns * 1.5) + (hasSearchPatterns * 1);

        // Temporal Intelligence Features
        const temporalInfo = getModelTemporalInfo(modelId);
        const isStaleQuery = isQueryLikelyStale(userQuery, modelId);
        const cutoffDate = new Date(temporalInfo.knowledgeCutoff);
        const daysSinceCutoff = Math.floor((Date.now() - cutoffDate.getTime()) / (1000 * 60 * 60 * 24));

        return {
            hasAttachments,
            hasVaultKeywords,
            hasCreationPatterns,
            hasDeletionPatterns,
            hasAnalysisPatterns,
            hasSearchPatterns,
            hasModifyPatterns,
            hasQuestionPatterns,
            hasCodePatterns,
            queryLength: userQuery.length,
            complexityScore,
            recentAgentTurns,
            recentToolCalls,
            isStaleQuery,
            modelKnowledgeCutoff: temporalInfo.knowledgeCutoff,
            modelSupportsWebSearch: temporalInfo.supportsWebSearch,
            daysSinceCutoff
        };
    }

    /**
     * Computes raw intent score from extracted features and scoring weights.
     */
    public static computeScore(features: IntentFeatures, weights: ScoringWeights): number {
        return (
            (features.hasAttachments ? 1 : 0) * weights.attachmentWeight +
            features.hasVaultKeywords * weights.vaultKeywordWeight +
            features.hasCreationPatterns * weights.creationPatternWeight +
            features.hasDeletionPatterns * weights.deletionPatternWeight +
            features.hasAnalysisPatterns * weights.analysisPatternWeight +
            features.hasSearchPatterns * weights.searchPatternWeight +
            features.hasModifyPatterns * weights.modifyPatternWeight +
            features.hasQuestionPatterns * weights.questionPatternWeight +
            (features.hasCodePatterns ? 1 : 0) * weights.codePatternWeight +
            features.queryLength * weights.lengthWeight +
            (features.recentAgentTurns + features.recentToolCalls * 0.5) * weights.historyWeight +
            (features.isStaleQuery ? 1 : 0) * weights.staleQueryWeight +
            (features.isStaleQuery && features.modelSupportsWebSearch ? 1 : 0) * weights.freshnessWeight
        );
    }

    /**
     * Sigmoid transfer function mapping raw score minus threshold to [0, 1] confidence range.
     */
    public static sigmoid(z: number): number {
        return 1 / (1 + Math.exp(-z));
    }

    /**
     * Classifies precise tool requirements for a given query and intent features.
     */
    public static classifyToolNeeds(
        userQuery: string,
        features: IntentFeatures,
        modelId: string
    ): ToolNeeds {
        const reasons: string[] = [];
        let needsWebSearch = false;
        let needsVaultSearch = false;
        let needsVaultWrite = false;

        const temporalInfo = getModelTemporalInfo(modelId);
        const isStale = features.isStaleQuery;
        const hasVaultKeywords = features.hasVaultKeywords > 0;
        const hasCreationPatterns = features.hasCreationPatterns > 0;
        const hasDeletionPatterns = features.hasDeletionPatterns > 0;
        const hasAnalysisPatterns = features.hasAnalysisPatterns > 0;
        const hasSearchPatterns = features.hasSearchPatterns > 0;

        // 1. WEB SEARCH NEEDED?
        if (isStale && temporalInfo.supportsWebSearch) {
            needsWebSearch = true;
            reasons.push(`Time-sensitive query (model cutoff: ${temporalInfo.knowledgeCutoff})`);
        }
        if (hasSearchPatterns && !hasVaultKeywords) {
            needsWebSearch = true;
            reasons.push("Explicit search intent without vault references");
        }
        if (features.queryLength > 200 && isStale) {
            needsWebSearch = true;
            reasons.push("Complex time-sensitive query");
        }

        // 2. VAULT SEARCH NEEDED?
        if (hasVaultKeywords || hasAnalysisPatterns || (hasSearchPatterns && hasVaultKeywords)) {
            needsVaultSearch = true;
            reasons.push("Vault references or analysis intent detected");
        }

        // 3. VAULT WRITE NEEDED?
        if (hasCreationPatterns || hasDeletionPatterns) {
            needsVaultWrite = true;
            needsVaultSearch = true;  // write implies read context
            reasons.push("Creation/deletion intent detected");
        }

        // 4. RECOMMENDED MODE
        let recommendedMode: 'quick' | 'agent' = 'quick';
        if (needsWebSearch || needsVaultSearch || needsVaultWrite || features.hasAttachments) {
            recommendedMode = 'agent';
        } else if (features.hasQuestionPatterns > 0 && features.queryLength < 150 && !isStale) {
            recommendedMode = 'quick';
        } else if (features.queryLength > 150 || features.complexityScore > 3) {
            recommendedMode = 'agent';
        }

        // Confidence heuristic
        let confidence = 0.5;
        if (needsWebSearch && temporalInfo.supportsWebSearch) confidence += 0.3;
        if (needsVaultSearch && hasVaultKeywords) confidence += 0.2;
        if (needsVaultWrite) confidence += 0.3;
        if (recommendedMode === 'agent' && features.hasAttachments) confidence += 0.2;
        confidence = Math.min(0.95, confidence);

        return { needsWebSearch, needsVaultSearch, needsVaultWrite, needsCodeExecution: false, recommendedMode, confidence, reasoning: reasons };
    }

    /**
     * Main entry point for intent classification.
     */
    public static classifyIntent(
        userQuery: string,
        hasAttachments: boolean = false,
        language: SupportedLanguage = "auto",
        chatHistory: ChatMessage[] = [],
        settings?: Partial<NeiAiChatSettings>
    ): IntentDecision {
        const threshold = settings?.intentRoutingThreshold ?? 2.5;
        const modelId = settings?.model || "google/gemini-2.5-flash";

        const weights: ScoringWeights = {
            vaultKeywordWeight: settings?.intentVaultKeywordWeight ?? 2.0,
            creationPatternWeight: settings?.intentCreationWeight ?? 3.0,
            deletionPatternWeight: settings?.intentDeletionWeight ?? 4.0,
            analysisPatternWeight: settings?.intentAnalysisWeight ?? 2.5,
            searchPatternWeight: settings?.intentSearchWeight ?? 1.5,
            modifyPatternWeight: settings?.intentModifyWeight ?? 1.5,
            questionPatternWeight: settings?.intentQuestionWeight ?? -1.5,
            codePatternWeight: settings?.intentCodeWeight ?? -1.0,
            lengthWeight: settings?.intentLengthWeight ?? 0.005,
            historyWeight: settings?.intentHistoryWeight ?? 0.3,
            attachmentWeight: settings?.intentAttachmentWeight ?? 5.0,
            staleQueryWeight: settings?.intentStaleQueryWeight ?? 3.0,
            freshnessWeight: settings?.intentFreshnessWeight ?? 2.0,
        };

        const features = this.extractFeatures(userQuery, hasAttachments, chatHistory, modelId);
        const score = this.computeScore(features, weights);
        const confidence = this.sigmoid(score - threshold);

        const isAgentMode = score >= threshold;
        const mode = isAgentMode ? 'agent' : 'quick';
        const toolNeeds = this.classifyToolNeeds(userQuery, features, modelId);

        // Reason determination
        let reason = t("intentDefaultQuickReason", language);

        if (features.hasAttachments) {
            reason = t("intentAttachmentsReason", language);
        } else if (features.isStaleQuery && isAgentMode) {
            reason = t("intentStaleReason", language);
        } else if (features.hasDeletionPatterns > 0) {
            reason = t("intentDeletionReason", language);
        } else if (features.hasCreationPatterns > 0) {
            reason = t("intentCreationReason", language);
        } else if (features.hasAnalysisPatterns > 0) {
            reason = t("intentAnalysisReason", language);
        } else if (features.hasSearchPatterns > 0) {
            reason = t("intentSearchReason", language);
        } else if (features.hasModifyPatterns > 0) {
            reason = t("intentModifyReason", language);
        } else if (features.hasVaultKeywords > 0) {
            reason = t("intentVaultActionReason", language, { keyword: "vault" });
        } else if (features.recentAgentTurns > 0) {
            reason = t("intentHistoryReason", language);
        } else if (!isAgentMode && features.hasQuestionPatterns > 0) {
            reason = t("intentQuickReason", language);
        } else if (isAgentMode && features.queryLength > 150) {
            reason = t("intentLongQueryReason", language);
        }

        return {
            mode,
            reason,
            confidence,
            toolNeeds,
            debug: { features, score }
        };
    }
}

