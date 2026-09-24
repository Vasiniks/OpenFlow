// Everything OpenFlow installs, pinned. Edit this file to add a skill source, MCP server or plugin.

export const V = {
  skillsCli: "skills@1.7.0",
  serena: "1.7.0",
  headroom: "0.37.0",
  specify: "v1.0.10",
  codeburn: "0.9.25",
  gltfTransform: "4.5.0",
  githubMcp: "v1.12.2",
  motionAi: "14.1.0",
  playwright: "1.63.0",
  gsapMcp: "@osaidrajput9/gsap-mcp@2.0.5",
  shadcn: "shadcn@4.21.0",
  mcpRemote: "mcp-remote@0.14.3",
};

// Skill sources for the `skills` CLI: [source, [skill names]]. Local folders are resolved against the repo.
export const SKILL_SOURCES = [
  // frontend: taste, craft, motion, 3D, perf
  ["Leonxlnx/taste-skill", ["brandkit", "design-taste-frontend", "high-end-visual-design", "image-to-code", "industrial-brutalist-ui", "minimalist-ui", "redesign-existing-projects"]],
  ["emilkowalski/skills", ["animate", "animation-vocabulary", "apple-design", "ask-sonner", "emil-design-eng", "find-animation-opportunities", "improve-animations", "pick-ui-library", "prototype", "review-animations"]],
  ["greensock/gsap-skills", ["gsap-core", "gsap-frameworks", "gsap-performance", "gsap-plugins", "gsap-react", "gsap-scrolltrigger", "gsap-timeline", "gsap-utils"]],
  ["ibelick/ui-skills", ["baseline-ui", "create-design-md", "fixing-accessibility", "fixing-metadata", "fixing-motion-performance", "improve-ui", "ui-skills-root"]],
  ["vercel-labs/agent-skills", ["vercel-composition-patterns", "vercel-react-best-practices", "vercel-react-view-transitions", "web-design-guidelines"]],
  ["nextlevelbuilder/ui-ux-pro-max-skill", ["banner-design", "brand", "design", "design-system", "slides", "ui-styling", "ui-ux-pro-max"]],
  ["pbakaus/impeccable", ["impeccable"]],
  ["anthropics/skills", ["frontend-design", "mcp-builder", "skill-creator", "webapp-testing"]],
  ["kylezantos/design-motion-principles", ["design-motion-principles"]],
  ["nateherkai/scroll-craft", ["scroll-craft"]],
  ["MiniMax-AI/skills", ["shader-dev"]],
  ["tuomashatakka/threejs-scenes-skill", ["threejs-scenes"]],
  ["composio-community/opencode-skills", ["blender-hard-surface-modeling"]],
  ["cloudflare/skills", ["web-perf"]],
  ["shadcn-ui/ui", ["shadcn"]],
  ["wshobson/agents", ["tailwind-design-system"]],
  // engineering workflow
  ["addyosmani/agent-skills", ["api-and-interface-design", "browser-testing-with-devtools", "ci-cd-and-automation", "code-review-and-quality", "code-simplification", "constraint-driven-development", "context-engineering", "debugging-and-error-recovery", "deprecation-and-migration", "documentation-and-adrs", "doubt-driven-development", "frontend-ui-engineering", "git-workflow-and-versioning", "idea-refine", "incremental-implementation", "interview-me", "observability-and-instrumentation", "performance-optimization", "planning-and-task-breakdown", "security-and-hardening", "shipping-and-launch", "source-driven-development", "spec-driven-development", "test-driven-development", "using-agent-skills"]],
  ["vercel-labs/skills", ["find-skills"]],
  ["JuliusBrussee/caveman", ["caveman"]],
  // research / science extras
  ["ChenLiu-1996/figures4papers", ["scientific-figure-making"]],
  ["HeshamFS/materials-simulation-skills", ["convergence-study"]],
  ["bahayonghang/academic-writing-skills", ["latex-paper-en"]],
  // award-level web design (Meng To, MIT): motion systems, reference→prompt methods, honest assets, anti-slop
  ["MengTo/Skills", ["build-awwwards-quality-sites", "cinematic-gsap-lenis-motion-system", "cinematic-scroll-storytelling", "gsap-scrolltrigger-storytelling",
    "scroll-world-storytelling", "video-to-superprompt", "html-to-interaction-prompts", "no-ai-design-slop", "audit-ai-design-slop", "design-first-ui-prompting",
    "generate-reference-inspired-brand-worlds", "iterate-until-verified", "webgl-3d-object", "build-threejs-scroll-worlds", "scroll-scrubbed-visual-sequence",
    "scroll-scrubbed-word-reveal", "staggered-word-reveal", "masked-reveal", "reveal-hover-effect", "marquee-loop", "shaders-cursor-ripples",
    "atmosphere-background", "progressive-blur", "unsplash-asset-images", "aura-asset-images", "optimize-web-animations"]],
  // OpenFlow's own (from this repo)
  ["./skills", ["visual-fidelity", "asset-library", "asset-forge", "awwwards-playbook"]],
];

// Claude Code gets these from the plugins below; installing them as skills too would double-trigger.
export const CLAUDE_VIA_PLUGIN = ["frontend-design", "impeccable", "ui-ux-pro-max", "banner-design", "brand", "design", "design-system", "slides", "ui-styling", "skill-creator"];

export const CLAUDE_MARKETPLACES = [
  ["claude-plugins-official", "anthropics/claude-plugins-official"],
  ["ui-ux-pro-max-skill", "nextlevelbuilder/ui-ux-pro-max-skill"],
  ["impeccable", "pbakaus/impeccable"],
  ["claude-hud", "jarrodwatts/claude-hud"],
];
export const CLAUDE_PLUGINS = [
  "superpowers@claude-plugins-official", "frontend-design@claude-plugins-official", "impeccable@impeccable",
  "ui-ux-pro-max@ui-ux-pro-max-skill", "typescript-lsp@claude-plugins-official", "claude-md-management@claude-plugins-official",
  "claude-hud@claude-hud",
];
export const OPENCODE_PLUGINS = ["superpowers@git+https://github.com/obra/superpowers.git"];

export const FLEET = ["frontend", "reference-analyst", "art-director", "frontend-architect", "interaction-designer",
  "motion-designer", "threejs-art-director", "responsive-specialist", "visual-critic", "asset-producer", "builder"];
