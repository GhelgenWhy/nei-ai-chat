import React, { FC, memo } from 'react';
import { OpenRouterModelInfo } from '../services/openrouter';

export interface ModelCapabilityBarProps {
    modelName: string;
    modelDetails: OpenRouterModelInfo | null;
    totalTokens: number;
    contextWindow?: number;
}

function formatTokens(count: number): string {
    if (count >= 1000000) {
        return (count / 1000000).toFixed(1) + 'M';
    }
    if (count >= 1000) {
        return (count / 1000).toFixed(1) + 'k';
    }
    return count.toString();
}

function prettifyName(id: string): string {
    const parts = id.split('/');
    return parts[parts.length - 1] || id;
}

export const ModelCapabilityBar: FC<ModelCapabilityBarProps> = memo(({
    modelName,
    modelDetails,
    totalTokens,
    contextWindow = 128000
}) => {
    const caps = modelDetails?.capabilities || {
        text: true,
        vision: modelDetails?.supportsVision ?? false,
        audio: modelDetails?.supportsAudio ?? false,
        video: modelDetails?.supportsVideo ?? false,
        pdf: modelDetails?.supportsPdf ?? true
    };

    const maxCtx = modelDetails?.contextLength || contextWindow;

    return (
        <div className="nei-capability-bar" style={{
            position: 'sticky',
            top: '38px',
            zIndex: 10,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '6px',
            padding: '3px 8px',
            background: 'var(--background-secondary-alt, var(--background-secondary))',
            borderBottom: '1px solid var(--background-modifier-border)',
            fontSize: '11px',
            lineHeight: '1.2',
            minHeight: '28px',
            boxSizing: 'border-box'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', flexWrap: 'wrap', minWidth: 0, flex: 1 }}>
                <span 
                    title={modelName}
                    style={{ fontWeight: 600, color: 'var(--text-normal)', textOverflow: 'ellipsis', overflow: 'hidden', fontSize: '11px', whiteSpace: 'nowrap', flexShrink: 1 }}
                >
                    Model: {prettifyName(modelName)}
                </span>
                
                <span style={{ opacity: 0.4, flexShrink: 0 }}>•</span>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                    <span title="Text Support" style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '10px', flexShrink: 0 }}>
                        🟢 Text
                    </span>
                    
                    <span title={caps.vision ? "Vision Supported" : "Vision Not Supported"} style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '10px', opacity: caps.vision ? 1 : 0.4, flexShrink: 0 }}>
                        {caps.vision ? '🟡 Vision' : '🔴 Vision'}
                    </span>

                    <span title={caps.audio ? "Audio Input Supported" : "Audio Not Supported"} style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '10px', opacity: caps.audio ? 1 : 0.4, flexShrink: 0 }}>
                        {caps.audio ? '🟢 Audio' : '🔴 Audio'}
                    </span>

                    <span title={caps.video ? "Video Input Supported" : "Video Not Supported"} style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '10px', opacity: caps.video ? 1 : 0.4, flexShrink: 0 }}>
                        {caps.video ? '🟢 Video' : '🔴 Video'}
                    </span>

                    <span title="PDF Text/Document Supported" style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '10px', flexShrink: 0 }}>
                        📄 PDF
                    </span>
                </div>
            </div>

            <div style={{
                fontFamily: 'var(--font-monospace, monospace)',
                fontSize: '10px',
                color: 'var(--text-muted)',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                marginLeft: 'auto'
            }}>
                Context: <strong style={{ color: 'var(--text-normal)' }}>{formatTokens(totalTokens)}</strong> / {formatTokens(maxCtx)} tokens
            </div>
        </div>
    );
});

ModelCapabilityBar.displayName = 'ModelCapabilityBar';
