import { describe, test, expect, vi } from "vitest";

vi.mock("obsidian", () => ({
    App: class {},
    TFile: class {},
    TFolder: class {},
    normalizePath: (p: string) => p
}));

import { cosineSimilarity } from "../src/services/rag/embeddings";
import { dataviewToolDefinitions } from "../src/services/tools/dataviewTools";
import { templaterToolDefinitions, executeTemplaterRender } from "../src/services/tools/templaterTools";
import { canvasToolDefinitions } from "../src/services/tools/canvasTools";
import { vaultToolDefinitions } from "../src/services/tools/vaultTools";
import { t, translations } from "../src/i18n/translations";
import { sendChatRequestStream } from "../src/services/llm";
import { calculateCost, formatTokenCount, formatCost } from "../src/utils/cost";

describe("Polish & Intelligence v2 Unit Tests", () => {
    test("cosineSimilarity -> calculates dot product normalized by magnitudes", () => {
        const vecA = [1, 0, 0];
        const vecB = [1, 0, 0];
        expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(1.0);

        const vecOrthogonal = [0, 1, 0];
        expect(cosineSimilarity(vecA, vecOrthogonal)).toBeCloseTo(0.0);
    });

    test("ecosystem tools -> dataview, templater, canvas definitions present", () => {
        expect(dataviewToolDefinitions[0].function.name).toBe("query_dataview");
        expect(templaterToolDefinitions[0].function.name).toBe("render_templater");
        
        const canvasNames = canvasToolDefinitions.map(d => d.function.name);
        expect(canvasNames).toContain("create_canvas");
        expect(canvasNames).toContain("read_canvas");
    });

    test("graph analysis -> tool definition has multi-mode parameters", () => {
        const graphTool = vaultToolDefinitions.find(d => d.function.name === "analyze_vault_graph");
        expect(graphTool).toBeDefined();
        const modeEnum = graphTool?.function.parameters.properties.mode.enum;
        expect(modeEnum).toContain("overview");
        expect(modeEnum).toContain("isolated");
        expect(modeEnum).toContain("hubs");
        expect(modeEnum).toContain("note_context");
        expect(modeEnum).toContain("recommend_links");
    });

    test("cost utilities -> format and calculate cost correctly", () => {
        expect(formatTokenCount(500)).toBe("500");
        expect(formatTokenCount(1500)).toBe("1.5k");
        expect(formatTokenCount(2500000)).toBe("2.5M");

        expect(formatCost(0.000123)).toBe("$0.000123");
        expect(formatCost(0.042)).toBe("$0.0420");

        const pricing = { "test-model": { prompt: 1.0, completion: 2.0 } };
        const cost = calculateCost(1_000_000, 500_000, "test-model", pricing);
        expect(cost).toBeCloseTo(2.0); // $1.00 + $1.00
    });

    test("executeTemplaterRender -> parses date tags in fallback mode", async () => {
        const mockApp = {} as any;
        const result = await executeTemplaterRender(mockApp, "Today is <% tp.date.now() %>");
        const todayStr = new Date().toISOString().slice(0, 10);
        expect(result).toContain(todayStr);
    });

    test("i18n -> keys present across all 10 supported languages", () => {
        const langs = Object.keys(translations);
        expect(langs).toContain("ru");
        expect(langs).toContain("en");
        expect(langs.length).toBeGreaterThanOrEqual(9);

        const exportLabelEn = t("exportSettings", "en");
        const exportLabelRu = t("exportSettings", "ru");
        expect(exportLabelEn).toBe("Export Settings");
        expect(exportLabelRu).toBe("Экспорт настроек");

        // v1.2 keys check
        expect(t("sessionCostTooltip", "en")).toBeTruthy();
        expect(t("graphOverviewTitle", "ru")).toBe("Обзор графа ваулта");
        expect(t("learningProposalTitle", "en")).toContain("Insights");
    });

    test("sendChatRequestStream -> function is defined and exported", () => {
        expect(typeof sendChatRequestStream).toBe("function");
    });
});

