# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the project

`script.js` uses ES module `import`, so `index.html` **cannot** be opened directly as a `file://` URL — the browser will block the module import. Serve it over HTTP instead:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

There is no build step, no package manager, and no test suite.

## Architecture

Four files, no dependencies installed locally — everything comes from CDN:

| File | Role |
|------|------|
| `index.html` | Entry point; loads Three.js r152 and math.js 11.9.0 from cdnjs, then `script.js` as an ES module |
| `script.js` | All simulation and rendering logic |
| `styles.css` | Dark-space UI theme; two-column grid layout (360 px panel + Three.js canvas) |

### `script.js` internals

**State** — a single `{ alpha, beta }` object holding `math.complex` values representing the two-component qubit state vector |ψ⟩ = α|0⟩ + β|1⟩.

**Gate application** (`applyGate`) — multiplies the 2×2 complex gate matrix by the state vector using `math.complex` arithmetic, then re-normalizes.

**Bloch sphere mapping** (`computeBloch`) — converts (α, β) to spherical coordinates (θ, φ) and then to Cartesian (x, y, z) for the Three.js arrow:
- θ = 2·arccos(|α|)
- φ = arg(β) − arg(α)

**Rendering** — Three.js `WebGLRenderer` with `OrbitControls` (loaded as an ESM from jsDelivr). A single `animate()` RAF loop drives `controls.update()` + `renderer.render()`. The state arrow (`arrowGroup`) is repositioned via `updateStateDisplay()` after every gate or measurement.

**Measurement** — collapses the state probabilistically to |0⟩ or |1⟩ by comparing `Math.random()` against |α|².

### Adding a new gate

1. Add a 2×2 `math.complex` matrix to the `gates` object in `script.js`.
2. Add a `<button data-gate="NAME">` in the Gates section of `index.html`.
3. The existing `querySelectorAll("button[data-gate]")` listener picks it up automatically.

For a parameterized rotation, follow the `rotationGate(axis, angle)` pattern and wire it like `RX`/`RY`.
