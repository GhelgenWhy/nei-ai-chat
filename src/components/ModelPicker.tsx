import React, { FC, useState, useMemo, ChangeEvent, MouseEvent } from 'react';
import { getModelTemporalInfo } from '../services/modelRegistry';
import { SupportedLanguage } from '../i18n/translations';

export interface ModelPickerProps {
    models: string[];
    selectedModel: string;
    onSelect: (model: string) => void;
    language: SupportedLanguage;
    apiKey?: string;
    endpointUrl?: string;
}

function prettifyModelName(modelId: string): string {
    const parts = modelId.split('/');
    const name = parts[parts.length - 1];
    return name
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

export const ModelPicker: FC<ModelPickerProps> = ({
    models,
    selectedModel,
    onSelect,
    language,
    apiKey,
    endpointUrl
}) => {
    const [searchQuery, setSearchQuery] = useState<string>('');

    const filteredModels = useMemo<string[]>(() => {
        const query = searchQuery.toLowerCase();
        return models.filter(m => 
            m.toLowerCase().includes(query) || 
            prettifyModelName(m).toLowerCase().includes(query)
        );
    }, [models, searchQuery]);

    return (
        <div className="nei-model-picker" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input
                type="text"
                placeholder="Search models..."
                value={searchQuery}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: '4px',
                    border: '1px solid var(--background-modifier-border)',
                    background: 'var(--background-primary)',
                    color: 'var(--text-normal)',
                    fontSize: '12px'
                }}
            />
            <div style={{
                maxHeight: '200px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                border: '1px solid var(--background-modifier-border)',
                borderRadius: '4px',
                padding: '4px',
                background: 'var(--background-secondary)'
            }}>
                {filteredModels.length === 0 ? (
                    <div style={{ padding: '8px', textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
                        No models found.
                    </div>
                ) : (
                    filteredModels.map(modelId => {
                        const isSelected = modelId === selectedModel;
                        const temporalInfo = getModelTemporalInfo(modelId);
                        const isLive = temporalInfo.supportsWebSearch;
                        
                        return (
                            <button
                                key={modelId}
                                onClick={(e: MouseEvent<HTMLButtonElement>) => {
                                    e.preventDefault();
                                    onSelect(modelId);
                                }}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'flex-start',
                                    padding: '6px 8px',
                                    background: isSelected ? 'var(--interactive-accent)' : 'var(--background-primary)',
                                    color: isSelected ? 'var(--text-on-accent)' : 'var(--text-normal)',
                                    border: '1px solid',
                                    borderColor: isSelected ? 'var(--interactive-accent)' : 'var(--background-modifier-border)',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    textAlign: 'left'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginBottom: '2px' }}>
                                    <span style={{ fontWeight: 600, fontSize: '12px' }}>
                                        {prettifyModelName(modelId)}
                                    </span>
                                    <span style={{ 
                                        fontSize: '10px', 
                                        padding: '2px 4px', 
                                        borderRadius: '3px',
                                        background: isSelected ? 'rgba(0,0,0,0.2)' : 'var(--background-secondary-alt)',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}>
                                        {isLive ? '🌐 Live' : `🔒 ${temporalInfo.knowledgeCutoff}`}
                                    </span>
                                </div>
                                <div style={{ 
                                    fontFamily: 'monospace', 
                                    fontSize: '10px', 
                                    opacity: isSelected ? 0.9 : 0.6 
                                }}>
                                    {modelId}
                                </div>
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );
};
