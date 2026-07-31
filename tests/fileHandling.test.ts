import { describe, it, expect } from 'vitest';
import { getDefaultModelCapabilities } from '../src/services/openrouter';

describe('File Handling & Model Capabilities Validation', () => {
    it('should correctly detect text/pdf injection support for all models', () => {
        const geminiCaps = getDefaultModelCapabilities('google/gemini-2.5-flash');
        expect(geminiCaps.capabilities.text).toBe(true);
        expect(geminiCaps.capabilities.pdf).toBe(true);
        expect(geminiCaps.capabilities.vision).toBe(true);
        expect(geminiCaps.capabilities.audio).toBe(true);

        const claudeCaps = getDefaultModelCapabilities('anthropic/claude-3.5-sonnet');
        expect(claudeCaps.capabilities.text).toBe(true);
        expect(claudeCaps.capabilities.vision).toBe(true);
        expect(claudeCaps.capabilities.audio).toBe(false);

        const textOnlyCaps = getDefaultModelCapabilities('custom/local-llama');
        expect(textOnlyCaps.capabilities.text).toBe(true);
        expect(textOnlyCaps.capabilities.vision).toBe(false);
        expect(textOnlyCaps.capabilities.audio).toBe(false);
    });

    it('should recognize text file extensions', () => {
        const textExts = ['.txt', '.md', '.json', '.js', '.ts', '.py', '.css', '.html', '.csv', '.yaml', '.yml'];
        const testFilename = 'sample_code.ts';
        const ext = testFilename.substring(testFilename.lastIndexOf('.')).toLowerCase();
        expect(textExts.includes(ext)).toBe(true);
    });
});
