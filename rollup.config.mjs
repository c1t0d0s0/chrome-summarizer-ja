import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import copy from 'rollup-plugin-copy';

export default [
  {
    input: 'sidepanel/index.js',
    output: {
      dir: 'dist/sidepanel',
      format: 'iife',
    },
    plugins: [
      commonjs(),
      nodeResolve(),
      copy({
        targets: [
          { src: 'manifest.json', dest: 'dist' },
          { src: 'background.js', dest: 'dist' },
          { src: 'sidepanel/index.html', dest: 'dist/sidepanel' },
          {
            src: [
              'images/icon16.png',
              'images/icon32.png',
              'images/icon48.png',
              'images/icon128.png',
            ],
            dest: 'dist/images',
          },
        ],
      }),
    ],
  },
  {
    input: 'scripts/extract-content.js',
    output: {
      dir: 'dist/scripts',
      format: 'es',
    },
    plugins: [commonjs(), nodeResolve()],
  },
];
