// PORTAL=itch builds the standalone version for itch.io (and any plain web host):
// the CrazyGames SDK <script> is stripped from index.html, so the page makes no
// third-party request at all. PortalSDK already treats a missing SDK as "no portal"
// and every call becomes a silent no-op, so nothing else changes.
//
// The default build (no PORTAL) is unchanged and still targets CrazyGames.
const stripPortalSdk = {
  name: 'strip-portal-sdk',
  transformIndexHtml(html) {
    if (process.env.PORTAL !== 'itch') return html;
    const out = html.replace(/\s*<script src="https:\/\/sdk\.crazygames\.com\/[^"]+"><\/script>/, '');
    if (out === html) throw new Error('strip-portal-sdk: SDK <script> tag not found; update the pattern');
    return out;
  }
};

export default {
  // Relative asset paths. CrazyGames and itch.io both serve games from a
  // subdirectory, so any '/'-rooted asset URL 404s there. Do not change this to '/'.
  base: './',
  plugins: [stripPortalSdk]
};
