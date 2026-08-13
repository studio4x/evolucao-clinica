import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const vercelConfig = JSON.parse(
  readFileSync(new URL("../vercel.json", import.meta.url), "utf8")
) as {
  routes?: Array<{ src?: string; dest?: string }>;
};
const serverSource = readFileSync(new URL("../server.ts", import.meta.url), "utf8");

const dynamicSeoRoutes = vercelConfig.routes || [];

assert.ok(
  dynamicSeoRoutes.some((route) => route.src === "^/$" && route.dest === "/api/index.ts"),
  "a raiz pública deve passar pelo renderizador dinâmico de SEO"
);
assert.ok(
  dynamicSeoRoutes.some(
    (route) => route.src === "^/painel(?:/.*)?$" && route.dest === "/api/index.ts"
  ),
  "as rotas do painel devem passar pelo renderizador dinâmico de SEO"
);
assert.match(
  serverSource,
  /app\.get\(\["\/", \/\^\\\/painel\(\?:\\\/\.\*\)\?\$\/\]/,
  "o servidor deve renderizar as metatags também nas rotas do painel"
);
assert.match(serverSource, /renderPublicSeoHtml\(html, config\)/);
assert.match(serverSource, /app\.get\("\/api\/social-share-image\.jpg"/);
assert.match(serverSource, /\.jpeg\(\{ quality: 82, progressive: true, mozjpeg: true \}\)/);
assert.match(serverSource, /property=\["'\]og:image:secure_url/);
assert.match(serverSource, /SOCIAL_SHARE_IMAGE_WIDTH = 1200/);
assert.match(serverSource, /SOCIAL_SHARE_IMAGE_HEIGHT = 630/);

console.log("SEO social sharing tests passed");
