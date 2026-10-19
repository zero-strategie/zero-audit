// Lets typescript-eslint (which does not understand .astro files) type imports of Astro components.
declare module '*.astro' {
  import type { AstroComponentFactory } from 'astro/runtime/server/index.js';

  const component: AstroComponentFactory;
  export default component;
}
