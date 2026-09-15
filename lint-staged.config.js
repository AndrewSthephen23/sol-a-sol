// Solo los archivos dentro de apps/ y packages/ tienen un eslint.config.js (uno por paquete).
const eslintScope = /[\\/](apps|packages)[\\/]/;

/** @param {string[]} files */
const quote = (files) => files.map((file) => JSON.stringify(file)).join(' ');

/** @type {import('lint-staged').Configuration} */
export default {
  // Una sola entrada por tipo de archivo: las tareas de una función corren en orden (ESLint → Prettier).
  '*.{js,mjs,cjs,ts,tsx}': (files) => {
    const lintable = files.filter((file) => eslintScope.test(file));
    return [
      ...(lintable.length > 0 ? [`eslint --fix --max-warnings=0 ${quote(lintable)}`] : []),
      `prettier --write ${quote(files)}`,
    ];
  },
  '*.{json,md,yml,yaml,css}': 'prettier --write',
};
