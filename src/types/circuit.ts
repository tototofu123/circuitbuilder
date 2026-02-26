// -------------------------------------------------------------
// Component Data Types
// -------------------------------------------------------------
export type ElementType = 'Resistor' | 'VoltageSource' | 'CurrentSource' | 'VCVS';

export interface Terminal {
    id: string; // unique terminal identifier
    elementId: string; // The element this terminal belongs to
    name: 'A' | 'B' | 'C' | 'D'; // Standardized terminal names
    x: number; // Local offset X from element center
    y: number; // Local offset Y from element center
}

export interface CircuitElement {
    id: string;
    type: ElementType;
    x: number;
    y: number;
    rotation: number; // 0, 90, 180, 270

    // Electrical properties
    value: number; // Resistance (Ohms), Voltage (V), Current (A), or Gain
    label: string; // R1, V1, I1, E1

    // Connection points
    terminals: Terminal[];
}

export interface Wire {
    id: string;
    points: { x: number; y: number }[];
    startTerminalId?: string;
    endTerminalId?: string;
}

// -------------------------------------------------------------
// MNA Engine Data Types
// -------------------------------------------------------------
// Used during the math solver phase to trace nodes
export interface Node {
    id: number; // 0 is always Ground
    terminalIds: Set<string>; // All terminals electrically connected to this node
}

// -------------------------------------------------------------
// Store State Type
// -------------------------------------------------------------
export interface CircuitState {
    elements: CircuitElement[];
    wires: Wire[];
    selectedElementIds: string[];
    selectedWireIds: string[];

    // Viewport
    pan: { x: number; y: number };
    zoom: number;

    // Actions
    addElement: (type: ElementType, x: number, y: number) => void;
    updateElementValue: (id: string, value: number) => void;
    moveElement: (id: string, dx: number, dy: number) => void;
    rotateElement: (id: string) => void;
    deleteSelection: () => void;

    // Wire Drawing
    drawingWire: Wire | null;
    startWire: (x: number, y: number, terminalId?: string) => void;
    updateDrawingWire: (x: number, y: number) => void;
    finishWire: (terminalId?: string) => void;
    cancelWire: () => void;

    // Selection & Viewport
    selectItem: (id: string, multi?: boolean, isWire?: boolean) => void;
    clearSelection: () => void;
    setPan: (x: number, y: number) => void;
    setZoom: (zoom: number) => void;

    // Addon toggles
    showMeasurements: boolean;
    toggleMeasurements: () => void;
    wireStyle: 'orthogonal' | 'straight';
    toggleWireStyle: () => void;
    mergeNearbyTerminals: () => void;
    // Measure panel state (written by Canvas, read by PropertiesPanel)
    measurePanelData: MeasurePanelData | null;
    setMeasurePanelData: (data: MeasurePanelData | null) => void;
}

export interface MeasureRow { label: string; value: string; color: string; }
export interface MeasureStep {
    num: number;
    title: string;
    lines: { expr: string; result?: string }[];
}
export interface MeasurePanelData {
    title: string;
    rows: MeasureRow[];
    steps: MeasureStep[];
}
