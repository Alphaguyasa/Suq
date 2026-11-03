/*
 * TypeScript 6 checks side-effect imports (`noUncheckedSideEffectImports` is on by default), so
 * `import './globals.css'` needs a module declaration. Next 15's own types do not declare plain
 * `.css` files. Only bare CSS is declared here; every other side-effect import is still checked.
 */
declare module '*.css';
