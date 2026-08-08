import React, { FC } from 'react';

export interface CapabilityWarningModalProps {
    unsupportedTypes: string[];
    modelName: string;
    onProceedTextOnly: () => void;
    onRemoveAttachments: () => void;
    onCancel: () => void;
}

export const CapabilityWarningModal: FC<CapabilityWarningModalProps> = ({
    unsupportedTypes,
    modelName,
    onProceedTextOnly,
    onRemoveAttachments,
    onCancel
}) => {
    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'env(safe-area-inset-top, 16px) env(safe-area-inset-right, 16px) env(safe-area-inset-bottom, 16px) env(safe-area-inset-left, 16px)',
            overflow: 'auto'
        }}>
            <div style={{
                background: 'var(--background-primary)',
                border: '1px solid var(--background-modifier-border)',
                borderRadius: '8px',
                padding: '16px',
                maxWidth: 'min(380px, calc(100vw - 32px))',
                width: '100%',
                maxHeight: 'min(90vh, calc(100vh - 32px))',
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                fontSize: '12px',
                overflow: 'auto'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', fontSize: '13px', color: 'var(--text-warning, #ffaa00)' }}>
                    ⚠️ Model Capability Mismatch
                </div>

                <div style={{ color: 'var(--text-normal)', lineHeight: '1.4' }}>
                    The model <strong>{modelName}</strong> does not support the following attached media format(s):
                    <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                        {unsupportedTypes.map((t: string) => (
                            <li key={t} style={{ fontWeight: 600 }}>{t.toUpperCase()}</li>
                        ))}
                    </ul>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                    <button
                        onClick={onProceedTextOnly}
                        style={{
                            background: 'var(--interactive-accent)',
                            color: 'var(--text-on-accent)',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '6px 12px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            fontSize: '11px',
                            textAlign: 'left'
                        }}
                    >
                        📄 Send as extracted text / text description
                    </button>

                    <button
                        onClick={onRemoveAttachments}
                        style={{
                            background: 'var(--background-secondary)',
                            color: 'var(--text-normal)',
                            border: '1px solid var(--background-modifier-border)',
                            borderRadius: '4px',
                            padding: '6px 12px',
                            cursor: 'pointer',
                            fontSize: '11px',
                            textAlign: 'left'
                        }}
                    >
                        🗑️ Remove incompatible attachment(s) and send
                    </button>

                    <button
                        onClick={onCancel}
                        style={{
                            background: 'transparent',
                            color: 'var(--text-muted)',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '4px 12px',
                            cursor: 'pointer',
                            fontSize: '11px',
                            textAlign: 'center'
                        }}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};
