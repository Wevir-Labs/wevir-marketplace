---
name: frontend-design
description: "Aesthetic direction for designs outside an existing brand system"
license: Apache-2.0
---

<!--
Design guidance by Anthropic; official same-source text: anthropics/skills,
skills/frontend-design/SKILL.md at 00756142ab04c82a447693cf373c4e0c554d1005 (Apache-2.0).
Adapted from the user-provided short variant: portable license metadata in place of
user-invocable, plus the Working in Wevir section. See ../../LICENSE.txt and ../../NOTICE.
-->

# Frontend design

Use this guidance when designing frontend/UI work that is NOT governed by an existing brand or design system. Create distinctive HTML with exceptional attention to aesthetic details and creative choices.

### Design Thinking

Before coding, understand the context and commit to a BOLD aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. Use these for inspiration but design one that is true to the aesthetic direction.
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work — the key is intentionality, not intensity.

### Aesthetics Guidelines

- **Typography**: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt for distinctive, characterful choices. Pair a distinctive display font with a refined body font.
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Focus on high-impact moments: one well-orchestrated page load with staggered reveals creates more delight than scattered micro-interactions.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Visual Details**: Create atmosphere and depth rather than defaulting to solid colors. Gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, grain overlays.

Vary between light and dark themes, different fonts, different aesthetics. NEVER converge on the same choices across generations.

Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate animations and effects. Minimalist designs need restraint, precision, and careful attention to spacing and subtle details.

### Working in Wevir

- Read the project's instructions and inspect its existing UI first. Existing brand rules, design tokens, components, fonts and accessibility requirements take precedence; extend that system rather than impose a new aesthetic.
- Use the file, shell, preview and browser tools available in the session. Keep output in the user's project. Reuse its framework, installed dependencies and local assets; choose available local fonts or CSS-drawn details when assets are missing. Do not require remote font or image services, install software, or publish the result as part of this skill.
- Preview locally with Wevir's preview/browser tools or the project's existing local setup. Check narrow and wide layouts, keyboard focus, contrast and reduced-motion behavior. If a browser or runtime is missing, report what could not be checked. Hand over the file paths and actual verification results.
