import * as React from "react";
import { t, SupportedLanguage } from "../i18n/translations";

export interface WelcomeScreenProps {
    language: SupportedLanguage;
    onClose: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = React.memo(({ language, onClose }) => {
    const [step, setStep] = React.useState(0);

    const steps = [
        {
            title: t("welcomeStep1Title", language),
            desc: t("welcomeStep1Desc", language),
            icon: "🤖"
        },
        {
            title: t("welcomeStep2Title", language),
            desc: t("welcomeStep2Desc", language),
            icon: "⚡"
        },
        {
            title: t("welcomeStep3Title", language),
            desc: t("welcomeStep3Desc", language),
            icon: "🧠"
        },
        {
            title: t("welcomeStep4Title", language),
            desc: t("welcomeStep4Desc", language),
            icon: "🌐"
        }
    ];

    const current = steps[step];

    return (
        <div className="nei-welcome-overlay" style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 10000,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
        }}>
            <div className="nei-welcome-modal" style={{
                background: 'var(--background-primary)',
                border: '1px solid var(--background-modifier-border)',
                borderRadius: '12px',
                padding: '24px',
                maxWidth: '460px',
                width: '100%',
                boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '42px', marginBottom: '8px' }}>{current.icon}</div>
                    <h2 style={{ margin: '0 0 6px 0', fontSize: '18px', color: 'var(--text-normal)' }}>
                        {current.title}
                    </h2>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                        {current.desc}
                    </p>
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', margin: '8px 0' }}>
                    {steps.map((_, i) => (
                        <div 
                            key={i} 
                            onClick={() => setStep(i)}
                            style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: i === step ? 'var(--interactive-accent)' : 'var(--background-modifier-border)',
                                cursor: 'pointer',
                                transition: 'background 0.2s'
                            }} 
                        />
                    ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {step > 0 ? (
                        <button 
                            onClick={() => setStep(s => s - 1)}
                            style={{ padding: '6px 12px', background: 'transparent', border: '1px solid var(--background-modifier-border)', color: 'var(--text-normal)', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                        >
                            ← {t("back", language)}
                        </button>
                    ) : <div />}

                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                            onClick={onClose}
                            style={{ padding: '6px 12px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px' }}
                        >
                            {t("skip", language)}
                        </button>
                        {step < steps.length - 1 ? (
                            <button 
                                onClick={() => setStep(s => s + 1)}
                                style={{ padding: '6px 14px', background: 'var(--interactive-accent)', color: 'var(--text-on-accent)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
                            >
                                {t("next", language)} →
                            </button>
                        ) : (
                            <button 
                                onClick={onClose}
                                style={{ padding: '6px 14px', background: 'var(--interactive-accent)', color: 'var(--text-on-accent)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
                            >
                                🚀 {t("startTour", language)}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
});

WelcomeScreen.displayName = 'WelcomeScreen';
