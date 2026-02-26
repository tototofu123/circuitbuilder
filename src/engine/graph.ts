import { CircuitElement, Wire, Terminal } from '../types/circuit';

export interface ElectricalNode {
    id: number;
    terminals: Terminal[]; // All terminals that are part of this node
}

/**
 * Traverses the wires and elements to find all contiguous electrical nodes.
 * Node 0 is assigned to the largest connected component (Ground), unless explicitly set (for future expansion).
 */
export const extractNodes = (elements: CircuitElement[], wires: Wire[]): ElectricalNode[] => {
    // 1. Gather all terminals
    const allTerminals = elements.flatMap(e => e.terminals);

    // 2. Initialize union-find (Disjoint Set)
    const parent = new Map<string, string>();
    const getParent = (id: string): string => {
        if (!parent.has(id)) parent.set(id, id);
        if (parent.get(id) !== id) {
            parent.set(id, getParent(parent.get(id)!));
        }
        return parent.get(id)!;
    };

    const union = (id1: string, id2: string) => {
        const root1 = getParent(id1);
        const root2 = getParent(id2);
        if (root1 !== root2) {
            parent.set(root1, root2);
        }
    };

    // 3. Connect terminals via wires
    for (const wire of wires) {
        if (wire.startTerminalId && wire.endTerminalId) {
            union(wire.startTerminalId, wire.endTerminalId);
        }
    }

    // 4. Group terminals by their root parent
    const nodeGroups = new Map<string, Terminal[]>();
    for (const t of allTerminals) {
        const root = getParent(t.id);
        if (!nodeGroups.has(root)) {
            nodeGroups.set(root, []);
        }
        nodeGroups.get(root)!.push(t);
    }

    let nodesData = Array.from(nodeGroups.values()).map(terminals => ({
        id: -1, // placeholder
        terminals
    }));

    // 5. Identify Ground (Node 0)
    // For now, let's just pick the node with the most connections as a pseudo-ground
    // to keep the math stable if there isn't an explicit ground component.
    // In a real simulator, we'd look for an explicit Ground element.
    nodesData.sort((a, b) => b.terminals.length - a.terminals.length);

    return nodesData.map((node, i) => ({
        ...node,
        id: i // First one (largest) becomes 0
    }));
};
