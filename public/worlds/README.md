Drop an optional custom immersive environment here:

```text
C:\Users\email\Documents\Traces\public\worlds\traces-world.glb
```

The immersive view will load it from:

```text
/worlds/traces-world.glb
```

Keep the scene near the world origin so the initial camera starts within or near the navigable room.

## Level contract

The immersive view uses the supplied GLB as its default level. Keep these named objects in the exported scene:

- `Walls`: defines the outer X/Z navigation bounds.
- `Floor`: defines the base walkable surface.
- `Landscape`: optional raised terrain that visitors can walk over and trace orbs can appear above.
- `Rack` and `Pillars`: optional structure meshes that block visitor movement and trace-orb placement.

Trace orbs are scattered deterministically from their trace IDs inside the wall bounds. Visitors follow the highest walkable `Floor` or `Landscape` surface below them. If the GLB cannot load, or the required `Walls` and `Floor` objects are missing, the immersive view falls back to its helper grid and default bounds.
