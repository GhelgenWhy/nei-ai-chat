import * as React from "react";
import { t, SupportedLanguage, Translations } from "../i18n/translations";

export interface TooltipProps {
    children: React.ReactElement;
    titleKey: keyof Translations;
    descriptionKey?: keyof Translations;
    language: SupportedLanguage;
    position?: 'top' | 'bottom' | 'left' | 'right';
    showIcon?: boolean;
}

export const Tooltip: React.FC<TooltipProps> = ({
    children,
    titleKey,
    descriptionKey,
    language,
    position = 'top',
    showIcon = true
}) => {
    const [visible, setVisible] = React.useState(false);
    const ref = React.useRef<HTMLDivElement>(null);

    const title = t(titleKey, language);
    const description = descriptionKey ? t(descriptionKey, language) : '';

    React.useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) {
                setVisible(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const isTop = position === 'top';
    const isBottom = position === 'bottom';
    const isLeft = position === 'left';

    return (
        <div ref={ref} className="nei-tooltip-wrapper" style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}>
            {children}
            {showIcon && (
                <span
                    className="nei-tooltip-trigger"
                    onClick={(e) => { e.stopPropagation(); setVisible(v => !v); }}
                    onMouseEnter={() => setVisible(true)}
                    onMouseLeave={() => setVisible(false)}
                    style={{
                        cursor: 'help',
                        marginLeft: '5px',
                        opacity: 0.7,
                        fontSize: '11px',
                        lineHeight: 1,
                        color: 'var(--text-muted)',
                        userSelect: 'none'
                    }}
                    title={title}
                >
                    ❓
                </span>
            )}
            {visible && (
                <div 
                    className="nei-tooltip-popover" 
                    style={{
                        position: 'absolute',
                        zIndex: 1000,
                        ...(isTop ? { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '6px' } : {}),
                        ...(isBottom ? { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: '6px' } : {}),
                        ...(isLeft ? { right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: '6px' } : {}),
                        ...(position === 'right' ? { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: '6px' } : {}),
                        padding: '8px 10px',
                        background: 'var(--background-primary)',
                        border: '1px solid var(--background-modifier-border)',
                        borderRadius: '6px',
                        boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
                        minWidth: '180px',
                        maxWidth: '280px',
                        fontSize: '11px',
                        lineHeight: '1.4',
                        color: 'var(--text-normal)',
                        pointerEvents: 'none'
                    }}
                >
                    <div style={{ fontWeight: 600, color: 'var(--text-normal)', marginBottom: description ? '4px' : '0' }}>
                        {title}
                    </div>
                    {description && (
                        <div style={{ opacity: 0.85, fontSize: '10px', color: 'var(--text-muted)' }}>
                            {description}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
