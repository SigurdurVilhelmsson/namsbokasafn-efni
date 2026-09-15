import { chromium } from '/home/siggi/dev/repos/namsbokasafn-efni/server/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'url'; import fs from 'fs'; import path from 'path';
const [src,dst,W,H]=process.argv.slice(2);
const host=path.resolve(dst)+'.host.html';
fs.writeFileSync(host,`<!doctype html><style>html,body{margin:0;background:#fff}img{display:block;width:${W}px;height:${H}px}</style><img src="${pathToFileURL(path.resolve(src)).href}">`);
const b=await chromium.launch(); const pg=await b.newPage({viewport:{width:Math.ceil(+W),height:Math.ceil(+H)}});
await pg.goto(pathToFileURL(host).href); await pg.waitForTimeout(500);
await pg.screenshot({path:dst,clip:{x:0,y:0,width:Math.ceil(+W),height:Math.ceil(+H)}}); await b.close();
