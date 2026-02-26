import { useMemo } from 'react';
import { useCircuitStore } from '../store/circuitStore';
import { Settings, RotateCw, Trash2, ChevronRight, Sparkles, Activity } from 'lucide-react';
import { solveCircuit } from '../engine/solver';
import { extractNodes } from '../engine/graph';

function StatRow({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <div className="flex justify-between items-center py-1.5 border-b border-surface-100 last:border-0">
            <span className="text-xs text-surface-500">{label}</span>
            <span className="text-xs font-mono font-bold" style={{ color }}>{value}</span>
        </div>
    );
}

function CircuitSummary() {
    const { elements, wires } = useCircuitStore();

    const stats = useMemo(() => {
        if (elements.length === 0) return null;
        try {
            const fw = wires.filter(w => w.startTerminalId && w.endTerminalId);
            const { nodeVoltages, elementCurrents } = solveCircuit(elements, fw);
            const nodes = extractNodes(elements, wires);

            const getV = (tid: string) => {
                const n = nodes.find(n => n.terminals.some(t => t.id === tid));
                return n ? (nodeVoltages?.[n.id] ?? 0) : 0;
            };

            const sources = elements.filter(e => e.type === 'VoltageSource');
            const totalV = sources.reduce((s, e) => s + e.value, 0);
            const totalI = sources.reduce((s, el) => s + Math.abs(elementCurrents?.[el.id] ?? 0), 0);
            const totalR = totalI > 1e-12 ? totalV / totalI : Infinity;
            const totalP = Object.entries(elementCurrents ?? {}).reduce((s, [id, i]) => {
                const el = elements.find(e => e.id === id);
                if (!el) return s;
                return s + Math.abs(getV(el.terminals[0]?.id) - getV(el.terminals[1]?.id)) * Math.abs(i);
            }, 0);

            const hasNaN = Object.values(nodeVoltages ?? {}).some(v => isNaN(v) || !isFinite(v));
            const nodeCount = nodes.length;
            const branchCount = fw.length + elements.length;

            return { totalV, totalI, totalR, totalP, nodeCount, branchCount, elementCount: elements.length, hasNaN };
        } catch {
            return null;
        }
    }, [elements, wires]);

    if (!stats) return null;

    return (
        <div className="border-t border-surface-200 bg-white">
            <div className="px-4 pt-3 pb-1 flex items-center gap-1.5 text-surface-400">
                <Activity size={11} />
                <span className="text-[10px] font-semibold uppercase tracking-widest">Circuit Summary</span>
            </div>
            <div className="px-4 pb-4">
                {stats.hasNaN ? (
                    <div className="flex items-center gap-2 py-2 px-3 bg-red-50 border border-red-200 rounded-lg">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                        <span className="text-xs text-red-600 font-medium">Short circuit detected</span>
                    </div>
                ) : (
                    <>
                        <StatRow label="Source Voltage" value={`${stats.totalV.toFixed(2)} V`} color="#059669" />
                        <StatRow label="Total Current" value={`${stats.totalI.toFixed(4)} A`} color="#2563eb" />
                        <StatRow label="Equiv. Resistance" value={isFinite(stats.totalR) ? `${stats.totalR.toFixed(2)} Ω` : '∞ Ω'} color="#d97706" />
                        <StatRow label="Total Power" value={`${stats.totalP.toFixed(4)} W`} color="#dc2626" />
                        <div className="mt-2 flex gap-3 text-[10px] text-surface-400 font-mono">
                            <span>{stats.elementCount} elements</span>
                            <span>·</span>
                            <span>{stats.nodeCount} nodes</span>
                            <span>·</span>
                            <span>{stats.branchCount} branches</span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export default function PropertiesPanel() {
    const { elements, selectedElementIds, updateElementValue, rotateElement, deleteSelection, measurePanelData, mergeNearbyTerminals } = useCircuitStore();

    const selectedElement =
        selectedElementIds.length === 1
            ? elements.find(e => e.id === selectedElementIds[0])
            : null;

    /* ── Measurement derivation view ──────────────────────── */
    if (measurePanelData) {
        return (
            <div className="w-[320px] h-full bg-slate-900 border-l border-slate-700 flex flex-col overflow-hidden text-white">
                {/* Summary card */}
                <div className="border-b border-slate-700 px-5 py-4" style={{ borderLeft: '4px solid #10b981' }}>
                    <div className="text-xs text-slate-400 uppercase tracking-wider mb-2 font-semibold">{measurePanelData.title}</div>
                    <div className="space-y-1.5">
                        {measurePanelData.rows.map((r, i) => (
                            <div key={i} className="flex justify-between items-center">
                                <span className="text-xs text-slate-300">{r.label}</span>
                                <span className="text-sm font-bold font-mono" style={{ color: r.color }}>{r.value}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Step-by-step derivation */}
                <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-700/60">
                    <Sparkles size={13} className="text-emerald-400" />
                    <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">How it's calculated</span>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                    {measurePanelData.steps.map(step => (
                        <div key={step.num}>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">{step.num}</span>
                                <span className="text-xs font-semibold text-slate-200">{step.title}</span>
                            </div>
                            <div className="ml-7 space-y-1 font-mono">
                                {step.lines.map((line, li) => (
                                    <div key={li} className="flex items-start gap-1 text-xs leading-relaxed">
                                        {line.result ? (
                                            <>
                                                <span className="text-slate-400 flex-1 min-w-0 break-words">{line.expr}</span>
                                                <ChevronRight size={10} className="text-slate-600 flex-shrink-0 mt-0.5" />
                                                <span className="text-emerald-400 font-bold flex-shrink-0">{line.result}</span>
                                            </>
                                        ) : (
                                            <span className="text-slate-300 break-words">{line.expr}</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    /* ── No selection ──────────────────────────────────────── */
    if (!selectedElement) {
        return (
            <div className="w-[300px] h-full bg-surface-50 border-l border-surface-200 flex flex-col">
                <div className="flex-1 flex flex-col items-center justify-center text-surface-400 text-center p-6">
                    <Settings size={32} className="mb-4 opacity-50" />
                    <p className="font-medium">No Element Selected</p>
                    <p className="text-sm mt-1">Click a component to view its properties.</p>
                    <button
                        onClick={mergeNearbyTerminals}
                        className="mt-6 flex items-center gap-2 px-4 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-sm font-medium transition-colors shadow-sm"
                        title="Auto-connect overlapping terminals"
                    >
                        <Sparkles size={15} />
                        Clean Circuit
                    </button>
                    <p className="text-xs text-surface-300 mt-1">Merges overlapping nodes</p>
                </div>
                <CircuitSummary />
            </div>
        );
    }

    /* ── Element selected ──────────────────────────────────── */
    const getUnit = () => {
        switch (selectedElement.type) {
            case 'Resistor': return 'Ω';
            case 'VoltageSource': return 'V';
            case 'CurrentSource': return 'A';
            case 'VCVS': return 'V/V';
            default: return '';
        }
    };

    const getLabel = () => {
        switch (selectedElement.type) {
            case 'Resistor': return 'Resistance';
            case 'VoltageSource': return 'DC Voltage';
            case 'CurrentSource': return 'DC Current';
            case 'VCVS': return 'Voltage Gain';
            default: return 'Value';
        }
    };

    return (
        <div className="w-[300px] h-full bg-surface-50 border-l border-surface-200 shadow-xl z-10 flex flex-col">
            <div className="p-4 border-b border-surface-200">
                <h2 className="text-lg font-bold text-surface-900 flex items-center gap-2">
                    {selectedElement.type}
                    <span className="text-sm font-medium px-2 py-0.5 bg-primary-100 text-primary-700 rounded-full">
                        {selectedElement.label}
                    </span>
                </h2>
            </div>

            <div className="p-4 space-y-6 flex-1">
                <div>
                    <label className="block text-sm font-medium text-surface-700 mb-1">{getLabel()}</label>
                    <div className="flex items-center border border-surface-300 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-primary-400">
                        <input
                            type="number"
                            value={selectedElement.value}
                            onChange={e => updateElementValue(selectedElement.id, parseFloat(e.target.value) || 0)}
                            className="flex-1 p-3 bg-white text-surface-900 outline-none text-sm"
                        />
                        <span className="px-3 text-surface-500 text-sm bg-surface-100 h-full flex items-center border-l border-surface-300">{getUnit()}</span>
                    </div>
                </div>

                <div>
                    <p className="text-sm font-medium text-surface-700 mb-2">Actions</p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => rotateElement(selectedElement.id)}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white hover:bg-surface-100 text-surface-700 border border-surface-300 rounded-xl text-sm font-medium transition-colors"
                        >
                            <RotateCw size={16} /> Rotate 90°
                        </button>
                        <button
                            onClick={deleteSelection}
                            className="p-2.5 bg-white hover:bg-red-50 text-red-400 hover:text-red-600 border border-surface-300 rounded-xl transition-colors"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                    <p className="text-xs text-surface-400 mt-2 text-center">
                        [R] rotate · [Delete] delete
                    </p>
                </div>

                <button
                    onClick={mergeNearbyTerminals}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-sm font-medium transition-colors"
                >
                    <Sparkles size={15} />
                    Clean Circuit
                </button>
            </div>

            {/* Circuit summary always at bottom */}
            <CircuitSummary />
        </div>
    );
}
