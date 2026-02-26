import { CircuitElement } from '../types/circuit';

export interface DerivationStep {
    num: number;
    title: string;
    lines: { expr: string; result?: string }[];
}

interface Node { id: number; terminals: { id: string }[] }

/**
 * Builds a full circuit explanation:
 * 1. GND reference
 * 2. Voltage-source forced nodes
 * 3. KCL at each remaining node with values substituted
 */
export function buildCircuitExplanation(
    elements: CircuitElement[],
    nodes: Node[],
    nodeVoltages: Record<number, number>,
    _elementCurrents: Record<string, number>
): DerivationStep[] {
    const steps: DerivationStep[] = [];

    const nodeLabel = (id: number) => id === 0 ? 'GND' : `N${id}`;
    const nv = (id: number) => nodeVoltages[id] ?? 0;
    const findNode = (termId: string) => nodes.find(n => n.terminals.some(t => t.id === termId));

    // ── Step 0: Ground reference ───────────────────────────
    steps.push({
        num: 1,
        title: 'Ground Reference (GND)',
        lines: [
            { expr: 'GND = 0 V  (reference node, defined by convention)' },
            { expr: 'All other voltages are measured relative to GND.' },
        ]
    });

    // ── Identify which nodes are forced by voltage sources ──
    const forcedBySource: Map<number, { sourceLabel: string; value: number; refNodeId: number }> = new Map();
    forcedBySource.set(0, { sourceLabel: 'reference', value: 0, refNodeId: -1 });

    const vSources = elements.filter(e => e.type === 'VoltageSource');

    vSources.forEach(vs => {
        // terminals[0] = negative (−), terminals[1] = positive (+) by convention
        const nMinus = findNode(vs.terminals[0]?.id);
        const nPlus = findNode(vs.terminals[1]?.id);
        const idMinus = nMinus?.id ?? 0;
        const idPlus = nPlus?.id ?? 0;
        const vMinus = nv(idMinus);
        const vPlus = nv(idPlus);

        // Whichever terminal connects to a new (unresolved) node is the forced one
        if (!forcedBySource.has(idPlus)) {
            forcedBySource.set(idPlus, { sourceLabel: vs.label, value: vs.value, refNodeId: idMinus });
        }

        steps.push({
            num: steps.length + 1,
            title: `${vs.label} forces ${nodeLabel(idPlus)}`,
            lines: [
                { expr: `${vs.label} is a ${vs.value} V source` },
                { expr: `  − terminal → ${nodeLabel(idMinus)} = ${vMinus.toFixed(4)} V` },
                { expr: `  + terminal → ${nodeLabel(idPlus)}` },
                { expr: `V(${nodeLabel(idPlus)}) = V(${nodeLabel(idMinus)}) + ${vs.value}` },
                { expr: `V(${nodeLabel(idPlus)}) = ${vMinus.toFixed(4)} + ${vs.value}`, result: `${vPlus.toFixed(4)} V` },
            ]
        });
    });

    // ── For each remaining (KCL) node – explain via current balance ──
    nodes.filter(n => n.id !== 0 && !forcedBySource.has(n.id)).forEach(node => {
        const nId = node.id;
        const V = nv(nId);
        const label = nodeLabel(nId);

        // Find all resistors touching this node
        const connectedR = elements.filter(el =>
            el.type === 'Resistor' &&
            el.terminals.some(t => findNode(t.id)?.id === nId)
        );

        const lines: { expr: string; result?: string }[] = [
            { expr: `KCL at ${label}: sum of all currents = 0` },
        ];

        // Show each branch current
        let eqParts: string[] = [];
        connectedR.forEach(r => {
            const otherT = r.terminals.find(t => findNode(t.id)?.id !== nId);
            const otherN = otherT ? findNode(otherT.id) : null;
            const otherId = otherN?.id ?? 0;
            const otherV = nv(otherId);
            const otherLbl = nodeLabel(otherId);
            lines.push({ expr: `  I(${otherLbl}→${label}) = (${otherV.toFixed(4)} − V(${label})) / ${r.value} Ω` });
            eqParts.push(`(${otherV.toFixed(4)} − V) / ${r.value}`);
        });

        if (eqParts.length > 0) {
            lines.push({ expr: `  Solving:  ${eqParts.join(' + ')} = 0` });
        }

        lines.push({ expr: `V(${label}) =`, result: `${V.toFixed(4)} V` });

        steps.push({
            num: steps.length + 1,
            title: `${label} solved by KCL`,
            lines
        });
    });

    // ── Final: All node voltages summary ──────────────────
    const summaryLines = nodes.map(n => ({
        expr: `V(${nodeLabel(n.id)})`,
        result: `${nv(n.id).toFixed(4)} V`
    }));
    steps.push({ num: steps.length + 1, title: 'Node Voltage Summary', lines: summaryLines });

    return steps;
}
