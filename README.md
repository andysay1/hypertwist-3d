# 🌌 HyperTwist Visualization — React + Vite

This project provides an interactive, real-time **visualization of space-time curvature** based on the HyperTwist metric — a geometric alternative to dark matter and dark energy.

Built with **React + Vite** for performance and Hot Module Replacement (HMR), it simulates:

-   **Gravitational funnel** with radial and angular deformation,
-   **Planetary orbits** computed from a metric-derived geometry,
-   **Dynamic particle flows** (ascend, collapse, return),
-   **Tensor field overlays**: φ, \( R*{rr} \), \( G*{rr} \), \( \mathcal{K} \),
-   **Live plots** of the metric components \( g*{rr}(r) \), \( g*{rθ}(r) \), and \( g\_{θθ}(r) \).

---

## 📐 Underlying Geometry

The metric used:

\[
ds^2 = -f(r) dt^2 + g*{rr}(r) dr^2 + 2g*{r\theta}(r) dr d\theta + g\_{\theta\theta}(r) d\theta^2 + dz^2
\]

Where:

-   \( g\_{rr}(r) = \frac{\pi r^2 + 16(r^2 + 2r + 1)^2}{16(1 + r)^6} \)
-   \( g\_{r\theta}(r) = -\frac{\pi r^2}{(1 + r)^4} \)
-   \( g\_{\theta\theta}(r) = \frac{r^2}{(1 + r)^2} \)

Time-slowing field:  
\[
\phi(r) = e^{-r^2}
\]

---

## ⚙️ Tech Stack

-   **React** for declarative UI
-   **Vite** for instant HMR and bundling
-   **Canvas API** for low-level 2D rendering
-   **Easing-utils** for smooth animations
-   **Custom numerical models** for geodesics, tensor fields, and curvature

---

## 🧪 Development

```bash
npm install
npm run dev
```

Developed by Andrey Leonov
Model: HyperTwist — form-based alternative to general relativity
