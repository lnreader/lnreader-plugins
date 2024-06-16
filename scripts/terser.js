import { minify_sync } from 'terser';
import fs from 'fs';

const config = {
  compress: {
    arrows: false,
  },
  mangle: {},
  ecma: 5, // specify one of: 5, 2015, 2016, etc.
  enclose: false, // or specify true, or "args:values"
  module: true,
  toplevel: true,
};

const minify = function (path) {
  const code = fs.readFileSync(path).toString();
  const result = minify_sync(code, config);
  fs.writeFileSync(path, result.code);
};

export { minify };
