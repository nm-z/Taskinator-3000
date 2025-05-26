import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

export default {
  input: 'electron-app/node_modules/@novnc/novnc/lib/rfb.js',
  output: {
    file: 'electron-app/public/js/novnc.umd.js',
    format: 'umd',
    name: 'RFB',
  },
  plugins: [
    resolve(),
    commonjs(),
    terser(),
  ],
}; 