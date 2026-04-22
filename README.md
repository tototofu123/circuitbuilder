# CircuitBuilder

An interactive browser-based circuit simulator built with React. Drag and drop components onto a canvas, wire them together, and get real-time electrical analysis powered by Modified Nodal Analysis (MNA).

**Live demo:** https://tototofu123.github.io/circuitbuilder/

---

## Features

- **Drag-and-drop canvas** — place components by dragging them from the toolbar
- **Wiring** — draw orthogonal or straight wires between component terminals
- **Real-time MNA solver** — node voltages, branch currents, and power are computed as you build
- **Measurement tool** — click any element, wire, or node to inspect its voltage, current, and power with step-by-step derivation shown in the side panel
- **Circuit summary** — live readout of total source voltage, current, equivalent resistance, and power
- **Short-circuit detection** — highlights shorted wires and shows a warning banner
- **Quick Adjust** — edit component values directly from the toolbar without selecting each element
- **Clean Circuit** — automatically merges overlapping terminals to snap connections
- **Pan & zoom** — navigate large schematics with mouse wheel and drag
- **Keyboard shortcuts** — `R` to rotate, `Delete` to remove the selected element

## Supported Components

| Component | Symbol | Unit |
|---|---|---|
| Resistor | R | Ω |
| DC Voltage Source | V | V |
| DC Current Source | I | A |
| Voltage-Controlled Voltage Source (VCVS) | E | V/V |

## Tech Stack

- **React 19** with TypeScript
- **Zustand** for state management
- **math.js** for matrix operations (MNA solver)
- **Tailwind CSS v4** for styling
- **Vite** for bundling
- **Lucide React** for icons

## Getting Started

```bash
# Install dependencies
npm install

# Start the development server
npm run dev

# Build for production
npm run build

# Preview the production build
npm run preview
```

## How It Works

The solver uses **Modified Nodal Analysis (MNA)**:

1. Each unique set of connected terminals is assigned a node number (node 0 = ground).
2. A conductance matrix **G** is assembled from resistors, and stamp matrices **B/C/D** are added for voltage sources and VCVS elements.
3. The resulting `Ax = z` system is solved via matrix inversion (`math.inv`) to obtain all node voltages and branch currents.
4. Power is derived from `P = V × I` for each element.

The explanation engine generates a human-readable step-by-step derivation (KCL / voltage forcing) shown in the measurement panel.

## Security

- Secret scanning workflow: `.github/workflows/security-secrets-scan.yml`
- Gitleaks config: `.gitleaks.toml`

---

Maintained by [@tototofu123](https://github.com/tototofu123).