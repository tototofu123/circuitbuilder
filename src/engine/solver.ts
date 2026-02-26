import { CircuitElement, Wire } from '../types/circuit';
import { extractNodes } from './graph';
import * as mathjs from 'mathjs';

export interface SolverResult {
    nodeVoltages: Record<number, number>; // node id -> voltage
    elementCurrents: Record<string, number>; // element id -> current
    elementPower: Record<string, number>; // element id -> power (W)
}

export const solveCircuit = (elements: CircuitElement[], wires: Wire[]): SolverResult => {
    if (elements.length === 0) return { nodeVoltages: {}, elementCurrents: {}, elementPower: {} };

    const nodes = extractNodes(elements, wires);

    // MNA Structure:
    // [ G  B ] [ v ] = [ i ]
    // [ C  D ] [ j ]   [ e ]
    //
    // n = number of non-ground nodes (n = nodes.length - 1)
    // m = number of voltage sources (including dependent VCVS)

    const numNodes = nodes.length - 1; // node 0 is ground
    if (numNodes <= 0) return { nodeVoltages: {}, elementCurrents: {}, elementPower: {} };

    // Identify independent and dependent voltage sources
    const vSources = elements.filter(e => e.type === 'VoltageSource' || e.type === 'VCVS');
    const m = vSources.length;

    const A_size = numNodes + m;
    const A = mathjs.zeros(A_size, A_size) as mathjs.Matrix;
    const z = mathjs.zeros(A_size, 1) as mathjs.Matrix;

    // Helper to get node index (1-based for math, but we need 0-based for matrix array where node 0 is excluded)
    const getNodeIndex = (terminalId: string): number => {
        const node = nodes.find(n => n.terminals.some(t => t.id === terminalId));
        return node ? node.id : -1;
    };

    const GMIN = 1e-12; // Very small conductance to ground to prevent singular matrices

    // Build G matrix (Resistors) & Independent Current Sources vector
    elements.forEach(element => {
        if (element.type === 'Resistor') {
            const g = 1 / element.value;
            const t1 = getNodeIndex(element.terminals[0].id);
            const t2 = getNodeIndex(element.terminals[1].id);

            if (t1 > 0) {
                A.set([t1 - 1, t1 - 1], A.get([t1 - 1, t1 - 1]) + g);
            }
            if (t2 > 0) {
                A.set([t2 - 1, t2 - 1], A.get([t2 - 1, t2 - 1]) + g);
            }
            if (t1 > 0 && t2 > 0) {
                A.set([t1 - 1, t2 - 1], A.get([t1 - 1, t2 - 1]) - g);
                A.set([t2 - 1, t1 - 1], A.get([t2 - 1, t1 - 1]) - g);
            }
        } else if (element.type === 'CurrentSource') {
            const tA = getNodeIndex(element.terminals[0].id); // Arrow head usually
            const tB = getNodeIndex(element.terminals[1].id); // Arrow tail

            // Leaving tB (-), entering tA (+)
            if (tA > 0) z.set([tA - 1, 0], z.get([tA - 1, 0]) + element.value);
            if (tB > 0) z.set([tB - 1, 0], z.get([tB - 1, 0]) - element.value);
        }
    });

    // Add GMIN to all auto-assigned nodes to ensure there are no truly floating nodes
    for (let i = 0; i < numNodes; i++) {
        A.set([i, i], A.get([i, i]) + GMIN);
    }

    // Build B, C, D matrices and e vector (Voltage Sources)
    vSources.forEach((vSource, idx) => {
        const vIdx = numNodes + idx;

        // Output terminals for V and VCVS
        const posNode = getNodeIndex(vSource.terminals[0].id); // + terminal
        const negNode = getNodeIndex(vSource.terminals[1].id); // - terminal

        // B matrix (connections)
        if (posNode > 0) A.set([posNode - 1, vIdx], 1);
        if (negNode > 0) A.set([negNode - 1, vIdx], -1);

        // C matrix
        if (vSource.type === 'VoltageSource') {
            if (posNode > 0) A.set([vIdx, posNode - 1], 1);
            if (negNode > 0) A.set([vIdx, negNode - 1], -1);
            z.set([vIdx, 0], vSource.value);
        } else if (vSource.type === 'VCVS') {
            const gain = vSource.value;
            const inPosNode = getNodeIndex(vSource.terminals[2].id);
            const inNegNode = getNodeIndex(vSource.terminals[3].id);

            if (posNode > 0) A.set([vIdx, posNode - 1], 1);
            if (negNode > 0) A.set([vIdx, negNode - 1], -1);
            if (inPosNode > 0) A.set([vIdx, inPosNode - 1], -gain);
            if (inNegNode > 0) A.set([vIdx, inNegNode - 1], gain);
            // z remains 0 for VCVS
        }
    });

    // Solve x = A^-1 * z
    let x: mathjs.Matrix;
    try {
        const A_inv = mathjs.inv(A);
        x = mathjs.multiply(A_inv, z) as mathjs.Matrix;
    } catch (err) {
        console.error("Singular matrix - circuit may be open or shorted improperly.", err);
        return { nodeVoltages: {}, elementCurrents: {}, elementPower: {} };
    }

    // Extract voltages
    const nodeVoltages: Record<number, number> = { 0: 0 }; // Ground is 0V
    for (let i = 0; i < numNodes; i++) {
        nodeVoltages[i + 1] = x.get([i, 0]);
    }

    // Extract branch currents for voltage sources and calculate for others
    const elementCurrents: Record<string, number> = {};
    const elementPower: Record<string, number> = {};

    vSources.forEach((vSource, idx) => {
        const current = x.get([numNodes + idx, 0]); // Current leaving positive terminal
        elementCurrents[vSource.id] = current;

        const posNode = getNodeIndex(vSource.terminals[0].id);
        const negNode = getNodeIndex(vSource.terminals[1].id);
        const vDelta = nodeVoltages[posNode] - nodeVoltages[negNode];

        // Power supplied is negative, consumed is positive. 
        // Usually P = V*I where I enters the positive terminal.
        // Our MNA 'current' is current LEAVING the positive terminal (sourced)
        elementPower[vSource.id] = -(vDelta * current);
    });

    elements.forEach(element => {
        if (element.type === 'Resistor') {
            const posNode = getNodeIndex(element.terminals[0].id);
            const negNode = getNodeIndex(element.terminals[1].id);
            const startV = nodeVoltages[posNode];
            const endV = nodeVoltages[negNode];

            const current = (startV - endV) / element.value; // I = V/R
            elementCurrents[element.id] = current;
            elementPower[element.id] = Math.abs(current * current * element.value);
        } else if (element.type === 'CurrentSource') {
            const current = element.value;
            const posNode = getNodeIndex(element.terminals[0].id);
            const negNode = getNodeIndex(element.terminals[1].id);
            const vDelta = nodeVoltages[posNode] - nodeVoltages[negNode];

            elementCurrents[element.id] = current;
            elementPower[element.id] = vDelta * current; // Power dissipated (if > 0)
        }
    });

    return { nodeVoltages, elementCurrents, elementPower };
};
