/* Rebuild the optional local renderer from an existing official SDK5-r.5. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const sdk = path.resolve(process.argv[2] || process.env.LIVE2D_SDK_PATH || '');
const core = path.join(sdk, 'Core/live2dcubismcore.min.js');
const expectedCore = '8741f739779b5d5210872bd3d7d99f0f1e56e6c87409e7d26d6bb4b80aa1ef47';
if (!fs.existsSync(core) || crypto.createHash('sha256').update(fs.readFileSync(core)).digest('hex') !== expectedCore) {
    throw new Error('Provide the unmodified official CubismSdkForWeb-5-r.5 directory. See assets/vendor/cubism/README.md.');
}
const esbuild = require(process.env.ESBUILD_MODULE || path.join(root, '.impeccable/tools/live2d/node_modules/esbuild'));
const destination = path.join(root, 'assets/vendor/cubism');
fs.mkdirSync(destination, { recursive: true });
for (const [source, output] of [
    ['Core/live2dcubismcore.min.js', 'live2dcubismcore.min.js'],
    ['Core/LICENSE.md', 'CORE-LICENSE.md'], ['Core/RedistributableFiles.txt', 'RedistributableFiles.txt'],
    ['Framework/LICENSE.md', 'FRAMEWORK-LICENSE.md'],
    ['LICENSE.md', 'SDK-LICENSE.md'], ['NOTICE.md', 'SDK-NOTICE.md']
]) fs.copyFileSync(path.join(sdk, source), path.join(destination, output));
esbuild.buildSync({
    entryPoints: [path.join(root, 'js/companion-live2d-runtime.ts')],
    outfile: path.join(destination, 'companion-runtime.js'),
    bundle: true, minify: true, format: 'iife', target: 'es2020', legalComments: 'linked',
    alias: { '@cubism': path.join(sdk, 'Framework/src'), '@cubism-shaders': path.join(sdk, 'Framework/Shaders/WebGL') },
    loader: { '.vert': 'text', '.frag': 'text' },
    banner: { js: '/**\n * Copyright(c) Live2D Inc. All rights reserved.\n *\n * Use of this source code is governed by the Live2D Open Software license\n * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.\n */\n/* Cubism SDK for Web 5-r.5 + Ashbery adapter. See README.md and preserved vendor licenses. */' }
});
console.log('Built local Cubism renderer; no sample models were copied.');
