import React from 'react';

const TAGLINE = 'CAR ACCESSORIES · HARDWARE · WORKSHOP TOOLS';

export default function SktopLogo({
    size = 'md',
    showTagline = true,
    className = '',
    onClick,
    as: Component = 'div',
}) {
    const sizeClass = size === 'lg' ? 'sktop-logo--lg' : size === 'sm' ? 'sktop-logo--sm' : 'sktop-logo--md';
    const interactive = typeof onClick === 'function';

    return (
        <Component
            className={`sktop-logo ${sizeClass}${showTagline ? '' : ' sktop-logo--mark-only'} ${className}`.trim()}
            onClick={onClick}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            onKeyDown={
                interactive
                    ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onClick(e);
                          }
                      }
                    : undefined
            }
        >
            <span className="sktop-logo-mark">
                <span className="sktop-logo-wordmark">SKTOP</span>
            </span>
            {showTagline && <span className="sktop-logo-tagline">{TAGLINE}</span>}
        </Component>
    );
}
