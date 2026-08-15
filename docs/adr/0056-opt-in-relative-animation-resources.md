# ADR 0056: User animation resources use relative frames

WebGAL keeps the existing community animation file format: a JSON array of transform frames. These user-authored frames are loaded as offsets from the target's resolved transform. `position` and `rotation` are added, while `scale` and `alpha` are multiplied.

The engine does not add a structured animation resource wrapper or expose an absolute-frame switch. Existing array files migrate to relative semantics without changing their JSON shape.

Engine-generated timelines from `setTransform`, `changeFigure`, and `changeBg` remain unmarked and absolute so their resolved keyframes are not composed twice. A renamed existing target falls back to its live Pixi container when calculation state no longer has the original key, and `writeDefault=true` remains an internal absolute-frame path. The engine does not expose `keepOffset`.
