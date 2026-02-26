import React from 'react';
import { useCircuitStore } from '../store/circuitStore';
import { CircuitElement, Terminal } from '../types/circuit';

export const TerminalDot = ({ terminal, isMeasureMode, isActiveProbe }: { terminal: Terminal; isMeasureMode?: boolean; isActiveProbe?: boolean }) => {
    const { startWire, finishWire } = useCircuitStore();

    const handlePointerDown = (e: React.PointerEvent) => {
        if (isMeasureMode) return;
        e.stopPropagation();
        const { pan, zoom } = useCircuitStore.getState();
        const svgEl = (e.target as SVGElement).ownerSVGElement;
        const rect = svgEl?.getBoundingClientRect();
        if (!rect) return;
        startWire((e.clientX - rect.left - pan.x) / zoom, (e.clientY - rect.top - pan.y) / zoom, terminal.id);
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (isMeasureMode) return;
        e.stopPropagation();
        finishWire(terminal.id);
    };

    return (
        <g>
            {/* Outer pulse ring when active probe */}
            {isActiveProbe && (
                <circle
                    cx={terminal.x}
                    cy={terminal.y}
                    r="14"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2"
                    opacity="0.7"
                    className="pointer-events-none"
                    style={{ animation: 'probe-pulse 1s ease-out infinite' }}
                />
            )}
            <circle
                cx={terminal.x}
                cy={terminal.y}
                r={isMeasureMode ? 7 : 5}
                data-terminal-id={terminal.id}
                className={`transition-all ${isMeasureMode ? (isActiveProbe ? 'cursor-crosshair' : 'cursor-crosshair') : 'fill-wire-inactive hover:fill-wire-hover cursor-crosshair'}`}
                fill={isMeasureMode ? (isActiveProbe ? '#059669' : '#6ee7b7') : undefined}
                stroke={isMeasureMode ? (isActiveProbe ? '#10b981' : '#34d399') : undefined}
                strokeWidth={isMeasureMode ? (isActiveProbe ? 2.5 : 1.5) : 0}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                pointerEvents="all"
            />
        </g>
    );
};

export const ElementVisualizer = ({ element, showLabel = true, isMeasureMode = false, isMeasured = false, activeProbeIds = [], isShorted = false }: { element: CircuitElement; showLabel?: boolean; isMeasureMode?: boolean; isMeasured?: boolean; activeProbeIds?: string[]; isShorted?: boolean }) => {
    const { selectedElementIds } = useCircuitStore();
    const isSelected = selectedElementIds.includes(element.id);

    // Render specific shape based on type
    const renderShape = () => {
        const strokeColor = isShorted ? '#ef4444' : isMeasured ? '#10b981' : isSelected ? 'var(--color-primary-500)' : 'var(--color-surface-800)';

        switch (element.type) {
            case 'Resistor':
                return (
                    <g>
                        <path d="M 0,-40 L 0,-20 L -10,-15 L 10,-5 L -10,5 L 10,15 L 0,20 L 0,40"
                            fill="none"
                            stroke={strokeColor}
                            strokeWidth="2"
                            strokeLinejoin="miter" />
                    </g>
                );
            case 'VoltageSource':
                return (
                    <g>
                        <circle cx="0" cy="0" r="20" fill="none" stroke={strokeColor} strokeWidth="2" />
                        <path d="M -8,-5 L 8,-5 M 0,-13 L 0,3" stroke={strokeColor} strokeWidth="2" /> {/* + */}
                        <path d="M -8,10 L 8,10" stroke={strokeColor} strokeWidth="2" /> {/* - */}
                        <line x1="0" y1="-40" x2="0" y2="-20" stroke={strokeColor} strokeWidth="2" />
                        <line x1="0" y1="20" x2="0" y2="40" stroke={strokeColor} strokeWidth="2" />
                    </g>
                );
            case 'CurrentSource':
                return (
                    <g>
                        <circle cx="0" cy="0" r="20" fill="none" stroke={strokeColor} strokeWidth="2" />
                        <path d="M 0,10 L 0,-10 M -5,-5 L 0,-10 L 5,-5" fill="none" stroke={strokeColor} strokeWidth="2" /> {/* Arrow */}
                        <line x1="0" y1="-40" x2="0" y2="-20" stroke={strokeColor} strokeWidth="2" />
                        <line x1="0" y1="20" x2="0" y2="40" stroke={strokeColor} strokeWidth="2" />
                    </g>
                );
            case 'VCVS':
                return (
                    <g>
                        <polygon points="0,-20 20,0 0,20 -20,0" fill="none" stroke={strokeColor} strokeWidth="2" />

                        {/* Output terminals (right) */}
                        <line x1="20" y1="-20" x2="40" y2="-20" stroke={strokeColor} strokeWidth="2" />
                        <line x1="20" y1="20" x2="40" y2="20" stroke={strokeColor} strokeWidth="2" />
                        <text x="30" y="-25" fontSize="10" fill={strokeColor} textAnchor="middle">+</text>
                        <text x="30" y="32" fontSize="10" fill={strokeColor} textAnchor="middle">-</text>

                        {/* Input terminals (left) */}
                        <line x1="-20" y1="-20" x2="-40" y2="-20" stroke={strokeColor} strokeWidth="2" />
                        <line x1="-20" y1="20" x2="-40" y2="-20" stroke={strokeColor} strokeWidth="2" />
                        <text x="-30" y="-25" fontSize="10" fill={strokeColor} textAnchor="middle">+in</text>
                        <text x="-30" y="32" fontSize="10" fill={strokeColor} textAnchor="middle">-in</text>

                        <path d="M 5,2 L 5,-8 M 0,-3 L 10,-3" stroke={strokeColor} strokeWidth="1" /> {/* + */}
                        <path d="M -2,7 L 8,7" stroke={strokeColor} strokeWidth="1" /> {/* - */}
                    </g>
                );
            default:
                return <rect x="-20" y="-20" width="40" height="40" fill="none" stroke={strokeColor} />;
        }
    };

    return (
        <g
            transform={`translate(${element.x}, ${element.y}) rotate(${element.rotation})`}
            className={isMeasureMode ? 'cursor-crosshair' : 'cursor-move'}
            pointerEvents="bounding-box"
            data-element-id={element.id}
        >
            {/* Invisible bounding box for easier dragging */}
            <rect x="-30" y="-50" width="60" height="100" fill="transparent" />

            {renderShape()}

            {/* Component Text — only shown when zoomed in enough */}
            {showLabel && (
                <text
                    x={(element.type === 'VCVS' ? 0 : 25)}
                    y={(element.type === 'VCVS' ? -35 : 0)}
                    fill={isSelected ? "var(--color-primary-600)" : "var(--color-surface-900)"}
                    fontSize="12"
                    fontWeight="bold"
                    transform={`rotate(${-element.rotation})`}
                    className="pointer-events-none select-none"
                >
                    {element.label}
                </text>
            )}

            {element.terminals.map(t => (
                <TerminalDot key={t.id} terminal={t} isMeasureMode={isMeasureMode} isActiveProbe={activeProbeIds.includes(t.id)} />
            ))}
        </g>
    );
};
