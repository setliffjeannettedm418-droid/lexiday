import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const root = process.argv[2] || "dist/client";
const walk = (p) =>
  fs
    .readdirSync(p, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() ? walk(path.join(p, e.name)) : [path.join(p, e.name)],
    );
const files = walk(root)
  .filter(
    (p) => /\.(js|css|json|png|svg|woff2?|webmanifest)$/.test(p) && !p.endsWith("/sw.js"),
  )
  .map((p) => "/" + path.relative(root, p).split(path.sep).join("/"));
const version = crypto
  .createHash("sha256")
  .update(files.map(p => p + ":" + crypto.createHash("sha256").update(fs.readFileSync(path.join(root, p))).digest("hex")).join())
  .digest("hex")
  .slice(0, 12);
const content = `const CACHE='lexiday-${version}';const FILES=${JSON.stringify(["/", ...files])};self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('lexiday-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin)return;if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(()=>caches.match(e.request).then(r=>r||caches.match('/'))));return;}e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(r=>{if(r.ok&&FILES.includes(u.pathname)){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;})));});`;
fs.writeFileSync(path.join(root, "sw.js"), content);
console.log("Generated offline cache:", files.length, "assets");
