import * as React from 'react';
import { t, SupportedLanguage } from '../i18n/translations';

export interface ReasoningStep {
    id: string;
    type: 'reasoning' | 'tool_call' | 'tool_result' | 'thought' | 'prefetch' | string;
    title: string;
    detail?: string;
    status: 'running' | 'completed' | 'failed';
    meta?: Record<string, unknown>;
}

interface ReasoningPanelProps {
    steps: ReasoningStep[];
    language: SupportedLanguage;
    isExpanded: boolean;
    onToggle: () => void;
}

export const ReasoningPanel: React.FC<ReasoningPanelProps> = ({ steps, language, isExpanded, onToggle }) => {
    if (steps.length === 0) return null;

    const getStepIcon = (type: string, status: string) => {
        if (status === 'running') return '⏳';
        if (status === 'failed') return '❌';
        switch (type) {
            case 'reasoning': return '🤔';
            case 'thought': return '💭';
            case 'tool_call': return '🔧';
            case 'tool_result': return '📥';
            case 'prefetch': return '📚';
            default: return '✅';
        }
    };

    const getStepColor = (type: string) => {
        switch (type) {
            case 'reasoning': case 'thought': return 'var(--interactive-accent)';
            case 'tool_call': return 'var(--text-warning, #e0a030)';
            case 'tool_result': return 'var(--text-success, #30a060)';
            case 'prefetch': return 'var(--text-accent, #7070e0)';
            default: return 'var(--text-muted)';
        }
    };

    const runningCount = steps.filter(s => s.status === 'running').length;
    const completedCount = steps.filter(s => s.status === 'completed').length;

    return (
        <div className="nei-reasoning-panel" style={{
            background: 'var(--background-secondary-alt)',
            border: '1px solid var(--background-modifier-border)',
            borderRadius: '8px',
            overflow: 'hidden',
            marginTop: '4px',
            transition: 'all 0.2s ease'
        }}>
            <button
                onClick={onToggle}
                style={{
                    width: '100%',
                    padding: '6px 12px',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--interactive-accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}
            >
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    ⚡ {t('agentReasoningLog', language)}
                    <span style={{ fontSize: '10px', opacity: 0.7, fontWeight: 'normal' }}>
                        ({completedCount}/{steps.length}{runningCount > 0 ? ` • ${runningCount} running` : ''})
                    </span>
                </span>
                <span style={{ fontSize: '10px' }}>{isExpanded ? '▲' : '▼'}</span>
            </button>

            {isExpanded && (
                <div style={{ padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {steps.map((step) => (
                        <details key={step.id} style={{ marginBottom: '2px' }}>
                            <summary style={{
                                cursor: 'pointer',
                                padding: '4px 8px',
                                background: 'var(--background-primary)',
                                borderRadius: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '11px',
                                fontWeight: 500,
                                opacity: step.status === 'running' ? 1 : 0.85
                            }}>
                                <span>{getStepIcon(step.type, step.status)}</span>
                                <span style={{ color: getStepColor(step.type), flex: 1 }}>
                                    {step.title}
                                </span>
                                {step.meta && typeof step.meta === 'object' && 'tokensUsed' in step.meta && (
                                    <span style={{ fontSize: '9px', opacity: 0.6, fontFamily: 'monospace' }}>
                                        {String(step.meta.tokensUsed)} tok
                                    </span>
                                )}
                            </summary>
                            {step.detail && (
                                <div style={{
                                    color: 'var(--text-muted)',
                                    fontSize: '10px',
                                    marginTop: '2px',
                                    fontFamily: 'monospace',
                                    whiteSpace: 'pre-wrap',
                                    maxHeight: '150px',
                                    overflowY: 'auto',
                                    padding: '6px 8px',
                                    background: 'var(--background-primary)',
                                    borderRadius: '4px',
                                    marginLeft: '24px'
                                }}>
                                    {step.detail}
                                </div>
                            )}
                            {step.meta && Object.keys(step.meta).length > 0 && (
                                <div style={{
                                    marginTop: '2px',
                                    fontSize: '9px',
                                    opacity: 0.6,
                                    fontFamily: 'monospace',
                                    marginLeft: '24px',
                                    padding: '2px 8px'
                                }}>
                                    {JSON.stringify(step.meta)}
                                </div>
                            )}
                        </details>
                    ))}
                </div>
            )}
        </div>
    );
};
