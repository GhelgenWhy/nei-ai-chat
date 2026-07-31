import { describe, it, expect } from 'vitest';

interface NeiAiChatSettingsV0 {
    model: string;
    apiKey: string;
}

interface NeiAiChatSettingsV1 extends NeiAiChatSettingsV0 {
    maxAttachmentSizeBytes: number;
    settingsVersion: number;
}

function migrateSettings(v0Settings: Partial<NeiAiChatSettingsV0> & { settingsVersion?: number }): NeiAiChatSettingsV1 {
    const defaultSettings: NeiAiChatSettingsV1 = {
        model: 'google/gemini-2.5-flash',
        apiKey: '',
        maxAttachmentSizeBytes: 512000,
        settingsVersion: 1
    };

    if (!v0Settings.settingsVersion || v0Settings.settingsVersion < 1) {
        v0Settings.settingsVersion = 1;
        if (!v0Settings.maxAttachmentSizeBytes) {
            (v0Settings as NeiAiChatSettingsV1).maxAttachmentSizeBytes = 512000;
        }
    }

    return Object.assign({}, defaultSettings, v0Settings as NeiAiChatSettingsV1);
}

describe('Settings Export/Import & Version Migration', () => {
    it('should migrate v0 settings without settingsVersion to v1', () => {
        const oldSettings: Partial<NeiAiChatSettingsV0> = {
            model: 'openai/gpt-4o',
            apiKey: 'sk-test'
        };

        const migrated = migrateSettings(oldSettings);
        expect(migrated.settingsVersion).toBe(1);
        expect(migrated.maxAttachmentSizeBytes).toBe(512000);
        expect(migrated.model).toBe('openai/gpt-4o');
    });
});
