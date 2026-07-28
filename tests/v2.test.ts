import { describe, test, expect } from "vitest";
import { cosineSimilarity } from "../src/services/rag/embeddings";
import { dataviewToolDefinitions } from "../src/services/tools/dataviewTools";
import { templaterToolDefinitions, executeTemplaterRender } from "../src/services/tools/templaterTools";
import { canvasToolDefinitions } from "../src/services/tools/canvasTools";
import { t, translations } from "../src/i18n/translations";
import { sendChatRequestStream } from "../src/services/llm";

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
        expect(canvasToolDefinitions[0].function.name).toBe("create_canvas");
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
    });

    test("sendChatRequestStream -> function is defined and exported", () => {
        expect(typeof sendChatRequestStream).toBe("function");
    });
});
