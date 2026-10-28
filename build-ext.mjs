import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_URL = '';   // private builds only: put your server address here (the store edition leaves it empty)
const COACH_HTML = `<label for="coachKey">Coach key &middot; \u0645\u0641\u062a\u0627\u062d \u0627\u0644\u0645\u062f\u0631\u0628</label>
<input id="coachKey" type="password" autocomplete="off" spellcheck="false" dir="ltr" placeholder="paste the key from coach.key">
<small>server.js creates it the first time it starts (file coach.key, also shown in the server window). Without it the coach cannot sync with students or reset sessions. Keep it private. \u0647\u0630\u0627 \u0627\u0644\u0645\u0641\u062a\u0627\u062d \u0633\u0631\u064a \u0648\u0644\u0627 \u062a\u0639\u0637\u0647 \u0644\u0623\u062d\u062f.</small>`;
const STORE = process.env.STORE === '1' || process.argv.includes('--store');     // npm run build:store -> public Chrome Web Store edition (student only)
const PRIVATE_HELP = `<small>This is the public address of the coach's server (the same link RUN1.BAT prints). The coach must have RUN1.BAT running. هذا هو رابط سيرفر المدرب (نفس الرابط الذي يظهر في RUN1.BAT)، ويجب أن يكون RUN1.BAT شغالاً عند المدرب.</small>`;
const STORE_HELP = `<small>Enter the server address your coach gave you (it starts with https://). You only need to do this once. \u0623\u062f\u062e\u0644 \u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0633\u064a\u0631\u0641\u0631 \u0627\u0644\u0630\u064a \u0623\u0639\u0637\u0627\u0643 \u0625\u064a\u0627\u0647 \u0645\u062f\u0631\u0628\u0643 (\u064a\u0628\u062f\u0623 \u0628\u0640 https://)\u060c \u0645\u0631\u0629 \u0648\u0627\u062d\u062f\u0629 \u0641\u0642\u0637.</small>`;
const ROLES_PRIVATE = {
  coach:   { name: 'Chess Coach',   start: '/',      desc: 'Coach side of the chess training platform: study boards, engine, video call.' },
  student: { name: 'Chess Student', start: '/login', desc: 'Student side of the chess training platform: join your coach\'s study.' },
};
const ROLES_STORE = {
  student: {
    name: 'Chess Study - Student', start: '/login', dir: 'student-store', store: true, httpsOnly: true, defaultUrl: '',
    desc: "Join your coach's live chess study: shared board, engine analysis, opening explorer and voice/video chat.",
  },
};
const ROLES = STORE ? ROLES_STORE : ROLES_PRIVATE;
for (const [role, cfg] of Object.entries(ROLES)) {
  const out = path.resolve('dist', cfg.dir || role);
  const r = spawnSync('npx', ['vite', 'build', '-c', 'vite.ext.config.mjs', '--outDir', out, '--emptyOutDir'],
    { stdio: 'inherit', env: { ...process.env, VITE_ROLE: role, VITE_EXT: '1', VITE_STORE: cfg.store ? '1' : '0' }, shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status || 1);
  const put = (f, t) => fs.writeFileSync(path.join(out, f), t);
  const tpl = f => fs.readFileSync(path.join('ext', f), 'utf8').replaceAll('__START__', cfg.start).replaceAll('__DEFAULT_URL__', cfg.defaultUrl ?? DEFAULT_URL).replaceAll('__HTTPS_ONLY__', cfg.httpsOnly ? 'true' : 'false').replaceAll('<!--HELP-->', cfg.store ? STORE_HELP : PRIVATE_HELP).replaceAll('<!--COACH_FIELD-->', role === 'coach' ? COACH_HTML : '');
  put('background.js', tpl('background.js'));
  put('options.js', tpl('options.js'));
  put('options.html', tpl('options.html'));
  fs.mkdirSync(path.join(out, 'icons'), { recursive: true });
  for (const s of [16, 32, 48, 128]) fs.copyFileSync(path.join('ext', 'icons', `${role}${s}.png`), path.join(out, 'icons', `icon${s}.png`));
  if (cfg.store) fs.copyFileSync('ext/THIRD_PARTY_NOTICES.txt', path.join(out, 'THIRD_PARTY_NOTICES.txt'));
  put('manifest.json', JSON.stringify({
    manifest_version: 3, name: cfg.name, version: '1.0.0', description: cfg.desc,
    action: { default_title: cfg.name, default_icon: { 16: 'icons/icon16.png', 32: 'icons/icon32.png' } },
    background: { service_worker: 'background.js' },
    options_page: 'options.html',
    icons: { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' },
  }, null, 2));
  console.log('built', role);
}
