import { resolve } from 'node:path';
import { readdirSync } from 'node:fs';
import { defineConfig, IndexHtmlTransformContext, Plugin } from 'vite';

const demoDir = resolve(__dirname, 'demo');

const files: string[] = readdirSync(demoDir).filter((file) => file.endsWith('.html'));
const input: Record<string, string> = files.reduce((acc, file) => {
  acc[file.replace('.html', '')] = resolve(demoDir, file);
  return acc;
}, {} as Record<string, string>);

const linkGenerator = (): Plugin => {
  return {
    name: 'link-generator',
    transformIndexHtml(html: string, ctx: IndexHtmlTransformContext) {
      if (!ctx.filename.endsWith('index.html')) return;

      const links = files
        .filter((file) => !file.includes('index') && !file.startsWith('_'))
        .sort()
        .map((file) => {
          const title = file.replace('.html', '').replaceAll('-', ' ');
          return `<li><a href="${file}">${title}</a></li>`;
        })
        .join('\n');

      return html.replace('{{ LINKS }}', links);
    },
  };
};

export default defineConfig({
  root: 'demo',
  base: '/folk-canvas/',
  plugins: [linkGenerator()],
  build: {
    target: 'esnext',
    rollupOptions: { input },
    modulePreload: {
      polyfill: false,
    },
    outDir: './dist',
    emptyOutDir: true,
  },
});