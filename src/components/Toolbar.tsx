import React from 'react';
import { useCircuitStore } from '../store/circuitStore';
import { ElementType } from '../types/circuit';
import { Zap, Battery, Activity, ArrowRightLeft } from 'lucide-react';

const ITEMS: { type: ElementType; icon: React.ReactNode; label: string }[] = [
    { type: 'Resistor', icon: <Activity size={24} />, label: 'Resistor' },
    { type: 'VoltageSource', icon: <Battery size={24} />, label: 'DC Voltage' },
    { type: 'CurrentSource', icon: <Zap size={24} />, label: 'DC Current' },
    { type: 'VCVS', icon: <ArrowRightLeft size={24} />, label: 'VCVS' },
];

const UNIT: Record<ElementType, string> = {
    Resistor: 'Ω',
    VoltageSource: 'V',
    CurrentSource: 'A',
    VCVS: 'V/V',
};

const STEP: Record<ElementType, number> = {
    Resistor: 100,
    VoltageSource: 0.5,
    CurrentSource: 0.1,
    VCVS: 0.5,
};

export default function Toolbar() {
    const { elements, updateElementValue } = useCircuitStore();

    const handleDragStart = (e: React.DragEvent, type: ElementType) => {
        e.dataTransfer.setData('application/reactflow', type);
        e.dataTransfer.effectAllowed = 'move';
    };

    return (
        <div className="w-[230px] h-full bg-surface-950 text-surface-50 border-r border-surface-800 flex flex-col shadow-xl z-10">
            {/* Header */}
            <div className="p-4 border-b border-surface-800">
                <h1 className="text-xl font-bold tracking-tight text-primary-500">CircuitBuilder</h1>
                <p className="text-sm text-surface-400 mt-0.5">Drag components to canvas</p>
            </div>

            {/* Component palette */}
            <div className="p-4 flex flex-col gap-2">
                {ITEMS.map((item) => (
                    <div
                        key={item.type}
                        className="flex items-center gap-3 p-3 rounded-lg bg-surface-900 border border-surface-800 hover:bg-surface-800 hover:border-surface-700 cursor-grab active:cursor-grabbing transition-colors"
                        draggable
                        onDragStart={(e) => handleDragStart(e, item.type)}
                    >
                        <div className="text-primary-500">{item.icon}</div>
                        <span className="font-medium text-sm">{item.label}</span>
                    </div>
                ))}
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Quick Adjust */}
            {elements.length > 0 && (
                <div className="border-t border-surface-800">
                    <div className="px-4 pt-3 pb-1 flex items-center gap-1.5 opacity-50">
                        <Zap size={11} />
                        <span className="text-[10px] font-semibold uppercase tracking-widest">Quick Adjust</span>
                    </div>
                    <div className="px-3 pb-4 space-y-1.5 max-h-64 overflow-y-auto">
                        {elements.map(el => (
                            <div key={el.id} className="flex items-center gap-2">
                                <span className="text-xs font-mono text-slate-400 w-7 flex-shrink-0">{el.label}</span>
                                <input
                                    type="number"
                                    value={el.value}
                                    onChange={e => updateElementValue(el.id, parseFloat(e.target.value) || 0)}
                                    className="flex-1 min-w-0 bg-surface-900 border border-surface-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-primary-500 font-mono text-right"
                                    step={STEP[el.type]}
                                />
                                <span className="text-[10px] text-slate-500 flex-shrink-0 w-5">{UNIT[el.type]}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
