# Prompting the fleet for award-level sites

The fleet does the heavy lifting: teardowns, real assets, choreography specs, a measured critique loop. What you type decides **what it aims at**. Vague input gets competent-but-generic output. Specific input gets a site with a point of view.

## `/awwwards`: one-shot an original site

Give it five things. Everything else is decided by the specialists, and measured.

| Give | Why | Example |
|---|---|---|
| **What and for whom** | the art director builds the concept from the audience | "launch site for titanium open-ear headphones by a small Berlin audio studio; for design-literate listeners and press" |
| **3–5 tone words** | these become the motion character and type choices | "museum-quiet, precise, tactile, a little mysterious" |
| **Must-have content** | becomes the section plan | "hero, material story (titanium, ceramic, fabric), how it sounds, specs, the studio, pre-order" |
| **What you already have** (optional) | real assets beat generated ones | "product photos in ./brand/photos, logo in ./brand/logo.svg, a .glb of the headphones" |
| **Sites you love** (optional) | measured with `vf teardown`; one trait is borrowed from each | "the pacing of lusion.co, the type of by-kin.com" |

**Strong:**
```
/awwwards "Halo — launch site for titanium open-ear headphones by a small Berlin audio studio. Audience: design-literate
listeners and press. Tone: museum-quiet, precise, tactile, a little mysterious. Needs: hero, material story (titanium,
ceramic, fabric), how it sounds (open-ear), specs, the studio, pre-order. Product model: ./brand/halo.glb. Route /halo."
```
**Weak:**
```
/awwwards "make a cool headphone website with animations"
```
The weak version has no audience, tone, content or assets, so the concept will be generic whatever the tools do.

## `/recreate`: rebuild a reference

```
/recreate https://example.com                         # whole home page + up to 3 pages, desktop + mobile
/recreate https://example.com only the hero and the work section, route /x
/recreate https://example.com home + /about + /work, viewports 1440x900 390x844 1920x1080
```
The fleet runs `vf teardown` first. So it recreates the reference's actual motion values, 3D scene, shaders and asset files, not a lookalike.

## Follow-ups that move quality (in the same session)

| Say | What happens |
|---|---|
| `/critique /halo` | measured critique + gate table, no code changes: see what's weak before asking for fixes |
| "the signature moment is weak — make the material section a pinned image sequence of the headphones rotating" | motion-designer respecs it; asset-producer renders a `forge sequence`; implementer wires recipe R6 |
| "the hero needs a real object — use a chrome version of the product lit dark" | asset-producer: `forge render … --light dark`; or a procedural object |
| "every heading should reveal by lines, 1.1 s expo.out, 80 ms stagger" | exact values beat adjectives; they go straight into the motion spec |
| "match the hover system of by-kin.com" | teardown → hover diffs → recreated text-roll links |
| "add page transitions between /halo and /studio" | View Transitions or a GSAP overlay, per the playbook |
| "run the loop again until the gates pass" | another capture → teardown → critique → fix iteration |

## Words that help, and words that don't

- **Help:** tone words (quiet, brutal, editorial, playful, clinical), materials (glass, titanium, paper, velvet), camera and light words (low angle, rim light, museum light, overcast), pacing (slow, snappy, cinematic), and concrete values ("1.2 s", "expo.out", "pinned for 3 screens").
- **Don't help:** "modern", "premium", "clean", "cool", "make it pop", "like Apple" without saying *which* Apple page and *what* about it.

## Keys that raise the ceiling (optional)

- `OPENAI_API_KEY` or `FAL_KEY`: `forge image` can generate art-directed plates and illustrations. Without one, imagery comes from CC0 photography and Blender renders.
- `UNSPLASH_ACCESS_KEY`: higher-quality photography than the CC0 search.
- Blender open with the MCP add-on connected: the asset producer can model bespoke objects interactively and use Hyper3D/Hunyuan AI 3D. Headless Blender (the `forge` CLI) works without this.
