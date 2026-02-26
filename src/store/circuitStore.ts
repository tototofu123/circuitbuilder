import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { CircuitState, CircuitElement, Wire, ElementType, Terminal, MeasurePanelData } from '../types/circuit';

const generateTerminals = (elementId: string, type: ElementType): Terminal[] => {
    switch (type) {
        case 'Resistor':
        case 'VoltageSource':
        case 'CurrentSource':
            return [
                { id: uuidv4(), elementId, name: 'A', x: 0, y: -40 },
                { id: uuidv4(), elementId, name: 'B', x: 0, y: 40 },
            ];
        case 'VCVS':
            return [
                { id: uuidv4(), elementId, name: 'A', x: 40, y: -20 }, // Output +
                { id: uuidv4(), elementId, name: 'B', x: 40, y: 20 },  // Output -
                { id: uuidv4(), elementId, name: 'C', x: -40, y: -20 }, // Input +
                { id: uuidv4(), elementId, name: 'D', x: -40, y: 20 },  // Input -
            ];
        default:
            return [];
    }
};

const getPrefix = (type: ElementType) => {
    switch (type) {
        case 'Resistor': return 'R';
        case 'VoltageSource': return 'V';
        case 'CurrentSource': return 'I';
        case 'VCVS': return 'E';
        default: return 'U';
    }
};

const getInitialValue = (type: ElementType) => {
    switch (type) {
        case 'Resistor': return 1;
        case 'VoltageSource': return 5;
        case 'CurrentSource': return 1;
        case 'VCVS': return 2;
        default: return 0;
    }
};

export const useCircuitStore = create<CircuitState>((set, get) => ({
    elements: [],
    wires: [],
    selectedElementIds: [],
    selectedWireIds: [],

    pan: { x: 0, y: 0 },
    zoom: 1,

    drawingWire: null,

    addElement: (type, x, y) => {
        const id = uuidv4();
        const count = get().elements.filter(e => e.type === type).length + 1;

        const newElement: CircuitElement = {
            id,
            type,
            x,
            y,
            rotation: 0,
            value: getInitialValue(type),
            label: `${getPrefix(type)}${count}`,
            terminals: generateTerminals(id, type)
        };

        set({ elements: [...get().elements, newElement] });
    },

    updateElementValue: (id, value) => {
        set({
            elements: get().elements.map(e => (e.id === id ? { ...e, value } : e))
        });
    },

    moveElement: (id, dx, dy) => {
        set({
            elements: get().elements.map(e =>
                e.id === id ? { ...e, x: e.x + dx, y: e.y + dy } : e
            )
        });
    },

    rotateElement: (id) => {
        set({
            elements: get().elements.map(e =>
                e.id === id ? { ...e, rotation: (e.rotation + 90) % 360 } : e
            )
        });
    },

    deleteSelection: () => {
        const { elements, wires, selectedElementIds, selectedWireIds } = get();

        // First remove selected wires
        let remainingWires = wires.filter(w => !selectedWireIds.includes(w.id));

        // Then remove selected elements and any wires connected to them
        const remainingElements = elements.filter(e => !selectedElementIds.includes(e.id));

        // Cleanup dangling wires that belonged to deleted elements
        const terminalIdsToDelete = elements
            .filter(e => selectedElementIds.includes(e.id))
            .flatMap(e => e.terminals.map(t => t.id));

        remainingWires = remainingWires.filter(w =>
            !terminalIdsToDelete.includes(w.startTerminalId || '') &&
            !terminalIdsToDelete.includes(w.endTerminalId || '')
        );

        set({
            elements: remainingElements,
            wires: remainingWires,
            selectedElementIds: [],
            selectedWireIds: []
        });
    },

    startWire: (x, y, terminalId) => {
        set({
            drawingWire: {
                id: uuidv4(),
                points: [{ x, y }, { x, y }],
                startTerminalId: terminalId
            }
        });
    },

    updateDrawingWire: (x, y) => {
        const { drawingWire } = get();
        if (!drawingWire) return;

        set({
            drawingWire: {
                ...drawingWire,
                points: [drawingWire.points[0], { x, y }]
            }
        });
    },

    finishWire: (terminalId) => {
        const { drawingWire, wires } = get();
        if (!drawingWire) return;

        // Prevent zero-length wires or connection to self
        if (drawingWire.startTerminalId !== terminalId) {
            set({
                wires: [...wires, { ...drawingWire, endTerminalId: terminalId }],
                drawingWire: null
            });
        } else {
            set({ drawingWire: null });
        }
    },

    cancelWire: () => set({ drawingWire: null }),

    selectItem: (id, multi = false, isWire = false) => {
        const { selectedElementIds, selectedWireIds } = get();

        if (isWire) {
            if (multi) {
                set({
                    selectedWireIds: selectedWireIds.includes(id)
                        ? selectedWireIds.filter(wId => wId !== id)
                        : [...selectedWireIds, id]
                });
            } else {
                set({ selectedWireIds: [id], selectedElementIds: [] });
            }
        } else {
            if (multi) {
                set({
                    selectedElementIds: selectedElementIds.includes(id)
                        ? selectedElementIds.filter(eId => eId !== id)
                        : [...selectedElementIds, id]
                });
            } else {
                set({ selectedElementIds: [id], selectedWireIds: [] });
            }
        }
    },

    clearSelection: () => set({ selectedElementIds: [], selectedWireIds: [] }),
    setPan: (x, y) => set({ pan: { x, y } }),
    setZoom: (zoom) => set({ zoom }),

    showMeasurements: true,
    toggleMeasurements: () => set(state => ({ showMeasurements: !state.showMeasurements })),

    measurePanelData: null,
    setMeasurePanelData: (data: MeasurePanelData | null) => set({ measurePanelData: data }),

    wireStyle: 'straight', // Default to straight wires for easier initial use
    toggleWireStyle: () => set(state => ({ wireStyle: state.wireStyle === 'orthogonal' ? 'straight' : 'orthogonal' })),

    mergeNearbyTerminals: () => {
        const { elements, wires } = get();
        const SNAP = 32; // world-unit proximity threshold — increased for reliable merge

        // Compute world position of each terminal
        type TPos = { terminalId: string; wx: number; wy: number };
        const positions: TPos[] = [];
        for (const el of elements) {
            const rad = el.rotation * Math.PI / 180;
            for (const t of el.terminals) {
                positions.push({
                    terminalId: t.id,
                    wx: el.x + t.x * Math.cos(rad) - t.y * Math.sin(rad),
                    wy: el.y + t.x * Math.sin(rad) + t.y * Math.cos(rad),
                });
            }
        }

        // Build connected pairs (already connected via wire)
        const connected = new Set<string>();
        for (const w of wires) {
            if (w.startTerminalId && w.endTerminalId) {
                connected.add([w.startTerminalId, w.endTerminalId].sort().join('|'));
            }
        }

        const newWires: Wire[] = [];
        for (let i = 0; i < positions.length; i++) {
            for (let j = i + 1; j < positions.length; j++) {
                const a = positions[i], b = positions[j];
                if (a.terminalId === b.terminalId) continue;
                const dx = a.wx - b.wx, dy = a.wy - b.wy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const key = [a.terminalId, b.terminalId].sort().join('|');
                if (dist <= SNAP && !connected.has(key)) {
                    connected.add(key);
                    newWires.push({
                        id: uuidv4(),
                        points: [{ x: a.wx, y: a.wy }, { x: b.wx, y: b.wy }],
                        startTerminalId: a.terminalId,
                        endTerminalId: b.terminalId,
                    });
                }
            }
        }
        if (newWires.length > 0) set({ wires: [...wires, ...newWires] });
    },

}));
