import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useCircuitStore } from '../store/circuitStore';
import { ElementVisualizer } from './ElementVisualizer';
import { Wire } from '../types/circuit';
import { solveCircuit } from '../engine/solver';
import { extractNodes } from '../engine/graph';
import { ZoomIn, ZoomOut, Maximize, Target, Ruler, Minus, CornerDownRight, X } from 'lucide-react';
import { buildCircuitExplanation, DerivationStep as Step } from '../engine/explanation';

type ToolMode = 'select' | 'measure';

type MeasureResult =
    | { kind: 'element'; label: string; elementType?: string; voltage: number; current: number | null; resistance: number | null; power: number | null; signedPower?: number | null; steps: Step[] }
    | { kind: 'wire'; wireId: string; current: number; steps: Step[] }
    | { kind: 'node1'; terminalId: string; voltage: number; label: string }
    | { kind: 'node2'; probe1: { voltage: number; label: string }; probe2: { voltage: number; label: string }; delta: number; steps: Step[] };

export default function Canvas() {
    const {
        elements, wires, drawingWire, pan, zoom,
        setPan, setZoom, selectItem, clearSelection, moveElement, updateDrawingWire, cancelWire,
        wireStyle, toggleWireStyle, setMeasurePanelData
    } = useCircuitStore();

    const svgRef = useRef<SVGSVGElement>(null);
    const [isPanning, setIsPanning] = useState(false);
    const [isDraggingElement, setIsDraggingElement] = useState<string | null>(null);
    const lastMousePos = useRef({ x: 0, y: 0 });

    const [toolMode, setToolMode] = useState<ToolMode>('select');
    const [measureResult, setMeasureResult] = useState<MeasureResult | null>(null);
    const [measuredElementId, setMeasuredElementId] = useState<string | null>(null);
    const [measuredWireId, setMeasuredWireId] = useState<string | null>(null);
    const [probe1, setProbe1] = useState<{ terminalId: string; voltage: number; label: string } | null>(null);

    const solverResult = useMemo(() => {
        const fw = wires.filter(w => w.startTerminalId && w.endTerminalId);
        return solveCircuit(elements, fw);
    }, [elements, wires]);
    const { nodeVoltages, elementCurrents } = solverResult;
    const nodes = useMemo(() => extractNodes(elements, wires), [elements, wires]);



    // ── Short circuit detection ────────────────────────────
    const isShortCircuit = useMemo(() => {
        const vArr = Object.values(nodeVoltages ?? {});
        const iArr = Object.values(elementCurrents ?? {});
        return vArr.some(v => isNaN(v) || !isFinite(v)) ||
            iArr.some(c => isNaN(c) || !isFinite(c) || Math.abs(c) > 9999);
    }, [nodeVoltages, elementCurrents]);

    // Identify shorted wires: those with current > 9999 OR in a NaN circuit
    const shortedWireIds = useMemo(() => {
        if (!isShortCircuit) return new Set<string>();
        // If circuit is NaN: all wires that connect voltage source terminals are suspect
        const shorts = new Set<string>();
        const vSrcTermIds = new Set(elements.filter(e => e.type === 'VoltageSource').flatMap(e => e.terminals.map(t => t.id)));
        for (const w of wires) {
            if ((w.startTerminalId && vSrcTermIds.has(w.startTerminalId)) ||
                (w.endTerminalId && vSrcTermIds.has(w.endTerminalId))) {
                shorts.add(w.id);
            }
        }
        // Also mark all wires if solver completely failed
        const hasNaN = Object.values(nodeVoltages ?? {}).some(v => isNaN(v));
        if (hasNaN) wires.forEach(w => shorts.add(w.id));
        return shorts;
    }, [isShortCircuit, elements, wires, nodeVoltages]);

    const shortedElementIds = useMemo(() => {
        if (!isShortCircuit) return new Set<string>();
        // All elements are affected by a short circuit
        return new Set(elements.map(e => e.id));
    }, [isShortCircuit, elements]);

    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            if (e.key === 'Delete' || e.key === 'Backspace') useCircuitStore.getState().deleteSelection();
            if (e.key === 'Escape') { cancelWire(); clearSelection(); clearMeasure(); setToolMode('select'); }
            if (e.key === 'r' || e.key === 'R') {
                const ids = useCircuitStore.getState().selectedElementIds;
                if (ids.length === 1) useCircuitStore.getState().rotateElement(ids[0]);
            }
        };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, []);

    const clearMeasure = () => {
        setMeasureResult(null); setProbe1(null);
        setMeasuredElementId(null); setMeasuredWireId(null);
        setMeasurePanelData(null);
    };

    const pushToPanel = (result: MeasureResult) => {
        // Build rows for summary card
        type Row = { label: string; value: string; color: string };
        const rows: Row[] = [];
        let title = '';
        let steps: Step[] = [];

        if (result.kind === 'element') {
            title = result.label;
            rows.push({ label: 'Voltage', value: `${result.voltage.toFixed(4)} V`, color: '#059669' });
            if (result.current !== null) rows.push({ label: 'Current', value: `${result.current.toFixed(4)} A`, color: '#2563eb' });
            if (result.resistance !== null) rows.push({ label: 'Resistance', value: `${result.resistance} Ω`, color: '#d97706' });
            if (result.power !== null && Math.abs(result.power) > 1e-9) {
                const isSource = result.elementType === 'VoltageSource' || result.elementType === 'CurrentSource';
                const signedP = result.signedPower ?? result.power;
                const isSupplying = isSource && signedP < -1e-9;
                const powerLabel = isSource ? (isSupplying ? '⚡ Supplying' : '⇩ Absorbing') : '→ Dissipating';
                const powerColor = isSupplying ? '#10b981' : '#dc2626';
                rows.push({ label: powerLabel, value: `${Math.abs(result.power).toFixed(4)} W`, color: powerColor });
            }
            steps = result.steps;
        } else if (result.kind === 'wire') {
            title = 'Wire';
            rows.push({ label: 'Current', value: `${result.current.toFixed(4)} A`, color: '#2563eb' });
            steps = result.steps;
        } else if (result.kind === 'node1') {
            title = result.label;
            rows.push({ label: '① Voltage', value: `${result.voltage.toFixed(4)} V`, color: '#059669' });
            rows.push({ label: '', value: 'Click a second terminal…', color: '#94a3b8' });
        } else if (result.kind === 'node2') {
            title = `${result.probe1.label} → ${result.probe2.label}`;
            rows.push({ label: `① ${result.probe1.label}`, value: `${result.probe1.voltage.toFixed(4)} V`, color: '#64748b' });
            rows.push({ label: `② ${result.probe2.label}`, value: `${result.probe2.voltage.toFixed(4)} V`, color: '#64748b' });
            rows.push({ label: 'ΔVoltage', value: `${result.delta.toFixed(4)} V`, color: '#059669' });
            steps = result.steps;
        }

        setMeasurePanelData({ title, rows, steps });
    };

    const getSVGPoint = (e: React.PointerEvent | React.DragEvent) => {
        if (!svgRef.current) return { x: 0, y: 0 };
        const rect = svgRef.current.getBoundingClientRect();
        return { x: (e.clientX - rect.left - pan.x) / zoom, y: (e.clientY - rect.top - pan.y) / zoom };
    };

    const getTerminalInfo = (tid: string) => {
        const n = nodes.find(n => n.terminals.some(t => t.id === tid));
        return { voltage: n ? (nodeVoltages?.[n.id] ?? 0) : 0, nodeId: n?.id ?? -1, label: !n ? 'Float' : n.id === 0 ? 'GND' : `N${n.id}` };
    };

    const resolveTerminalPos = (tid: string) => {
        for (const el of elements) {
            const t = el.terminals.find(t => t.id === tid);
            if (t) { const rad = el.rotation * Math.PI / 180; return { x: el.x + t.x * Math.cos(rad) - t.y * Math.sin(rad), y: el.y + t.x * Math.sin(rad) + t.y * Math.cos(rad) }; }
        }
        return null;
    };

    const getCircuitSteps = () => buildCircuitExplanation(elements, nodes, nodeVoltages ?? {}, elementCurrents ?? {});

    /* ── Measure actions ──────────────────────────────────── */
    const measureElement = (id: string) => {
        const el = elements.find(e => e.id === id);
        if (!el) return;
        const rawI = elementCurrents?.[id] ?? null;
        const ti1 = getTerminalInfo(el.terminals[0]?.id);
        const ti2 = getTerminalInfo(el.terminals[1]?.id);
        const v1 = ti1.voltage, v2 = ti2.voltage;
        const V = Math.abs(v1 - v2);
        const rawI_signed = elementCurrents?.[el.id] ?? null;   // signed from solver
        const I = rawI !== null ? Math.abs(rawI) : null;
        const R = el.type === 'Resistor' ? el.value : null;
        const signedP = (rawI_signed !== null) ? (v1 - v2) * rawI_signed : null;
        const P = I !== null ? V * I : null;

        const circSteps = getCircuitSteps();
        const offset = circSteps.length;
        const steps: Step[] = [...circSteps];
        steps.push({
            num: offset + 1, title: `${el.label} — Nodes Used`, lines: [
                { expr: `V(${ti1.label}) = ${v1.toFixed(4)} V  (from circuit analysis above)` },
                { expr: `V(${ti2.label}) = ${v2.toFixed(4)} V  (from circuit analysis above)` },
            ]
        });
        steps.push({
            num: offset + 2, title: 'Voltage Drop', lines: [
                { expr: `V = |V(${ti1.label}) − V(${ti2.label})|` },
                { expr: `V = |${v1.toFixed(4)} − ${v2.toFixed(4)}|`, result: `${V.toFixed(4)} V` },
            ]
        });
        if (I !== null) {
            if (R !== null) {
                steps.push({
                    num: offset + 3, title: "Current — Ohm's Law", lines: [
                        { expr: `I = V / R` },
                        { expr: `I = ${V.toFixed(4)} / ${R}`, result: `${I.toFixed(4)} A` },
                    ]
                });
            } else {
                steps.push({ num: offset + 3, title: 'Current (from solver)', lines: [{ expr: `I = ${I.toFixed(4)} A  (KCL / MNA)` }] });
            }
        }
        if (P !== null) {
            const isSource = el.type === 'VoltageSource' || el.type === 'CurrentSource';
            const isSupplying = isSource && (signedP ?? 0) < -1e-9;
            const powerTitle = isSource
                ? (isSupplying ? '⚡ Power Supplied (Source delivering energy)' : '⇩ Power Absorbed (Source consuming energy)')
                : '→ Power Dissipated (Passive element converting to heat)';
            steps.push({
                num: steps.length + 1, title: powerTitle, lines: [
                    { expr: `P = V × I` },
                    { expr: `P = ${V.toFixed(4)} × ${(I ?? 0).toFixed(4)}`, result: `${P.toFixed(4)} W` },
                    { expr: isSource && signedP !== null ? `(P_signed = ${signedP.toFixed(4)} W — negative = supplying)` : '' }
                ].filter(l => l.expr)
            });
        }

        const result: MeasureResult = { kind: 'element', label: el.label, elementType: el.type, voltage: V, current: I, resistance: R, power: P, signedPower: signedP, steps };
        setMeasuredElementId(id); setMeasuredWireId(null); setProbe1(null);
        setMeasureResult(result); pushToPanel(result);
    };

    const measureWire = (wireId: string) => {
        const wire = wires.find(w => w.id === wireId);
        if (!wire) return;
        let current = 0, elementLabel = '?';
        for (const el of elements) {
            if (el.terminals.some(t => t.id === wire.startTerminalId || t.id === wire.endTerminalId)) {
                current = Math.abs(elementCurrents?.[el.id] ?? 0); elementLabel = el.label; break;
            }
        }
        const circSteps2 = getCircuitSteps();
        const offset2 = circSteps2.length;
        const steps: Step[] = [
            ...circSteps2,
            { num: offset2 + 1, title: 'Series Circuit', lines: [{ expr: `Wire is in series with ${elementLabel}` }] },
            {
                num: offset2 + 2, title: 'Current (KCL)', lines: [
                    { expr: `I_wire = I_${elementLabel}` },
                    { expr: `I_wire =`, result: `${current.toFixed(4)} A` },
                ]
            },
        ];
        const result: MeasureResult = { kind: 'wire', wireId, current, steps };
        setMeasuredWireId(wireId); setMeasuredElementId(null); setProbe1(null);
        setMeasureResult(result); pushToPanel(result);
    };

    const measureTerminal = (terminalId: string) => {
        const { voltage, label } = getTerminalInfo(terminalId);
        setMeasuredElementId(null); setMeasuredWireId(null);

        if (!probe1) {
            setProbe1({ terminalId, voltage, label });
            const result: MeasureResult = { kind: 'node1', terminalId, voltage, label };
            setMeasureResult(result); pushToPanel(result);
        } else if (probe1.terminalId === terminalId) {
            clearMeasure();
        } else {
            const delta = Math.abs(probe1.voltage - voltage);
            const circSteps3 = getCircuitSteps();
            const offset3 = circSteps3.length;
            const steps: Step[] = [
                ...circSteps3,
                { num: offset3 + 1, title: 'Point ① Voltage', lines: [{ expr: `V₁ = V(${probe1.label})`, result: `${probe1.voltage.toFixed(4)} V` }] },
                { num: offset3 + 2, title: 'Point ② Voltage', lines: [{ expr: `V₂ = V(${label})`, result: `${voltage.toFixed(4)} V` }] },
                {
                    num: offset3 + 3, title: 'Voltage Difference', lines: [
                        { expr: `ΔV = |V₁ − V₂|` },
                        { expr: `ΔV = |${probe1.voltage.toFixed(4)} − ${voltage.toFixed(4)}|`, result: `${delta.toFixed(4)} V` },
                    ]
                },
            ];
            const result: MeasureResult = { kind: 'node2', probe1, probe2: { voltage, label }, delta, steps };
            setMeasureResult(result); pushToPanel(result);
            setProbe1(null);
        }
    };

    /* ── Pointer handlers ──────────────────────────────────── */
    const handlePointerDown = (e: React.PointerEvent) => {
        if (e.button === 1 || e.buttons === 4 || e.altKey) { setIsPanning(true); lastMousePos.current = { x: e.clientX, y: e.clientY }; return; }
        const target = e.target as Element;
        const elemNode = target.closest('[data-element-id]');
        const wireNode = target.closest('[data-wire-id]');
        const termAttr = target.getAttribute('data-terminal-id');

        if (toolMode === 'measure') {
            if (termAttr) { measureTerminal(termAttr); return; }
            if (elemNode) { measureElement(elemNode.getAttribute('data-element-id')!); return; }
            if (wireNode) { measureWire(wireNode.getAttribute('data-wire-id')!); return; }
            clearMeasure(); return;
        }

        if (wireNode) { selectItem(wireNode.getAttribute('data-wire-id')!, e.shiftKey, true); return; }
        if (elemNode) {
            const id = elemNode.getAttribute('data-element-id')!;
            if (!useCircuitStore.getState().selectedElementIds.includes(id)) selectItem(id, e.shiftKey, false);
            setIsDraggingElement(id); lastMousePos.current = getSVGPoint(e); target.setPointerCapture(e.pointerId); return;
        }
        clearSelection();
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (isPanning) { setPan(pan.x + e.clientX - lastMousePos.current.x, pan.y + e.clientY - lastMousePos.current.y); lastMousePos.current = { x: e.clientX, y: e.clientY }; }
        else if (isDraggingElement) { const pt = getSVGPoint(e); moveElement(isDraggingElement, pt.x - lastMousePos.current.x, pt.y - lastMousePos.current.y); lastMousePos.current = pt; }
        else if (drawingWire) { const pt = getSVGPoint(e); updateDrawingWire(pt.x, pt.y); }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        setIsPanning(false);
        if (isDraggingElement) { const el = elements.find(el => el.id === isDraggingElement); if (el) moveElement(isDraggingElement, Math.round(el.x / 10) * 10 - el.x, Math.round(el.y / 10) * 10 - el.y); }
        setIsDraggingElement(null);
        const target = e.target as SVGElement;
        if (target.hasPointerCapture?.(e.pointerId)) target.releasePointerCapture(e.pointerId);
        if (drawingWire && !target.hasAttribute('data-terminal-id')) cancelWire();
    };

    const handleWheel = (e: React.WheelEvent) => { e.preventDefault(); e.ctrlKey ? setZoom(Math.max(0.1, Math.min(5, zoom * (e.deltaY > 0 ? 0.9 : 1.1)))) : setPan(pan.x - e.deltaX, pan.y - e.deltaY); };

    const handleLocate = () => {
        if (!elements.length) { setZoom(1); setPan(0, 0); return; }
        let [mx, my, Mx, My] = [Infinity, Infinity, -Infinity, -Infinity];
        elements.forEach(el => { mx = Math.min(mx, el.x - 70); Mx = Math.max(Mx, el.x + 70); my = Math.min(my, el.y - 70); My = Math.max(My, el.y + 70); });
        const pad = 80, vw = svgRef.current?.clientWidth || 800, vh = svgRef.current?.clientHeight || 600;
        const nz = Math.max(0.1, Math.min(2, Math.min((vw - pad * 2) / (Mx - mx || 1), (vh - pad * 2) / (My - my || 1))));
        setZoom(nz); setPan(vw / 2 - (mx + (Mx - mx) / 2) * nz, vh / 2 - (my + (My - my) / 2) * nz);
    };

    /* ── Wire rendering ──────────────────────────────────── */
    const renderWire = (wire: Wire) => {
        if (wire.points.length < 2) return null;
        let s = wire.points[0], e2 = wire.points[wire.points.length - 1];
        if (wire.startTerminalId) { const p = resolveTerminalPos(wire.startTerminalId); if (p) s = p; }
        if (wire.endTerminalId) { const p = resolveTerminalPos(wire.endTerminalId); if (p) e2 = p; }
        const mid = s.x + (e2.x - s.x) / 2;
        const d = wireStyle === 'straight' ? `M ${s.x},${s.y} L ${e2.x},${e2.y}` : `M ${s.x},${s.y} L ${mid},${s.y} L ${mid},${e2.y} L ${e2.x},${e2.y}`;
        if (!wire.startTerminalId || !wire.endTerminalId) return <g key={wire.id} className="pointer-events-none"><path d={d} fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="6 3" /></g>;
        const { selectedWireIds } = useCircuitStore.getState();
        const isSelected = selectedWireIds.includes(wire.id);
        const isMeasured = measuredWireId === wire.id;
        const isShorted = shortedWireIds.has(wire.id);
        const color = isShorted ? '#ef4444' : isMeasured ? '#10b981' : isSelected ? '#3b82f6' : '#1e293b';
        const width = (isShorted || isMeasured || isSelected) ? 3 : 2;
        return (
            <g key={wire.id} data-wire-id={wire.id} style={{ cursor: toolMode === 'measure' ? 'crosshair' : 'pointer', pointerEvents: 'all' }}>
                <path d={d} fill="none" stroke="transparent" strokeWidth="16" />
                <path d={d} fill="none" stroke={color} strokeWidth={width} className="pointer-events-none" />
                {isShorted && <path d={d} fill="none" stroke="#fca5a5" strokeWidth="6" opacity="0.35" className="pointer-events-none" />}
                {isMeasured && <path d={d} fill="none" stroke="#10b981" strokeWidth="1" strokeDasharray="4 3" opacity="0.5" className="pointer-events-none" />}
            </g>
        );
    };

    const showLabels = zoom >= 0.5;
    const activeProbeIds = probe1 ? [probe1.terminalId] : [];

    return (
        <div className={`w-full h-full relative ${toolMode === 'measure' ? 'cursor-crosshair' : ''}`}
            onWheel={handleWheel}
            onDrop={e => { e.preventDefault(); const type = e.dataTransfer.getData('application/reactflow') as import('../types/circuit').ElementType; if (type) { const pt = getSVGPoint(e); useCircuitStore.getState().addElement(type, Math.round(pt.x / 10) * 10, Math.round(pt.y / 10) * 10); } }}
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}>

            <div className="absolute inset-0 pointer-events-none opacity-20" style={{ backgroundImage: 'radial-gradient(circle, #334155 1px, transparent 1px)', backgroundSize: `${20 * zoom}px ${20 * zoom}px`, backgroundPosition: `${pan.x}px ${pan.y}px` }} />

            <svg ref={svgRef} className="w-full h-full outline-none touch-none" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onContextMenu={e => e.preventDefault()} tabIndex={0}>
                <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                    {wires.map(w => renderWire(w))}
                    {drawingWire && renderWire(drawingWire)}
                    {elements.map(el => (
                        <ElementVisualizer key={el.id} element={el} showLabel={showLabels} isMeasureMode={toolMode === 'measure'} isMeasured={measuredElementId === el.id} activeProbeIds={activeProbeIds} isShorted={shortedElementIds.has(el.id)} />
                    ))}
                </g>
            </svg>

            {/* Short circuit warning */}
            {isShortCircuit && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-red-50 border border-red-300 text-red-700 text-xs font-semibold px-4 py-2.5 rounded-full shadow-lg pointer-events-none select-none z-20">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                    SHORT CIRCUIT — Direct path across voltage source
                </div>
            )}

            {/* Hint banner */}
            {toolMode === 'measure' && !isShortCircuit && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-emerald-50 border border-emerald-300 text-emerald-700 text-xs font-medium px-4 py-2 rounded-full shadow pointer-events-none select-none z-10">
                    {!probe1 ? 'Click component, wire, or terminal dot' : '① set — click second terminal for ΔV'}
                </div>
            )}

            {/* Compact measure badge (top-left of canvas, only node1 needs status) */}
            {measureResult?.kind === 'node1' && (
                <div className="absolute top-4 right-4 bg-white rounded-xl shadow-lg border-l-4 border-emerald-500 px-4 py-2 z-20 pointer-events-auto flex items-center gap-3">
                    <span className="text-sm font-bold text-emerald-700">① {measureResult.label}: {measureResult.voltage.toFixed(4)} V</span>
                    <button onClick={clearMeasure} className="text-slate-400 hover:text-slate-700"><X size={13} /></button>
                </div>
            )}

            {/* Clear measure button when active */}
            {measureResult && measureResult.kind !== 'node1' && (
                <div className="absolute top-4 right-4 z-20 pointer-events-auto">
                    <button onClick={clearMeasure} className="bg-white border border-surface-200 shadow-md rounded-full p-2 text-surface-400 hover:text-surface-700 transition-colors">
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* Mode toggles */}
            <div className="absolute bottom-6 left-6 z-10 flex flex-col gap-2 pointer-events-auto">
                <div className="flex gap-2 items-center bg-surface-50 p-2 rounded-xl shadow-lg border border-surface-200">
                    <button onClick={() => { setToolMode('select'); clearMeasure(); }} className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${toolMode === 'select' ? 'bg-primary-100 text-primary-700' : 'text-surface-600 hover:bg-surface-100'}`}>Select</button>
                    <button onClick={() => { setToolMode(t => t === 'measure' ? 'select' : 'measure'); clearMeasure(); }} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${toolMode === 'measure' ? 'bg-emerald-100 text-emerald-700' : 'text-surface-600 hover:bg-surface-100'}`}><Ruler size={16} />Measure</button>
                    <div className="w-px h-6 bg-surface-200" />
                    <button onClick={toggleWireStyle} className="flex items-center gap-2 px-3 py-2 text-surface-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg text-sm font-medium transition-colors">
                        {wireStyle === 'orthogonal' ? <CornerDownRight size={16} /> : <Minus size={16} />}{wireStyle === 'orthogonal' ? 'Orthogonal' : 'Straight'}
                    </button>
                </div>
            </div>

            <div className="absolute bottom-6 right-6 flex flex-col gap-1 bg-surface-50 p-2 rounded-xl shadow-lg border border-surface-200 pointer-events-auto z-10">
                <button onClick={() => setZoom(Math.min(5, zoom * 1.2))} className="p-2 text-surface-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"><ZoomIn size={18} /></button>
                <div className="h-px bg-surface-200" />
                <button onClick={() => setZoom(Math.max(0.1, zoom / 1.2))} className="p-2 text-surface-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"><ZoomOut size={18} /></button>
                <div className="h-px bg-surface-200" />
                <button onClick={() => { setZoom(1); setPan(0, 0); }} className="p-2 text-surface-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"><Maximize size={18} /></button>
                <div className="h-px bg-surface-200" />
                <button onClick={handleLocate} className="p-2 text-surface-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"><Target size={18} /></button>
            </div>

            <div className="absolute bottom-7 left-1/2 -translate-x-1/2 bg-surface-50/80 backdrop-blur-sm px-3 py-1 rounded-full border border-surface-200 text-xs text-surface-400 pointer-events-none z-10">
                {Math.round(zoom * 100)}%
            </div>
        </div>
    );
}
