import { build } from 'esbuild';
await build({entryPoints:['server/vercel.ts'],outfile:'api/index.mjs',bundle:true,platform:'node',target:'node22',format:'esm',packages:'external'});
