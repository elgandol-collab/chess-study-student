(function () {
  'use strict';
  var KEY = 'chess_server_url', START = '__START__', HTTPS_ONLY = __HTTPS_ONLY__;
  var input = document.getElementById('url'), msg = document.getElementById('msg');
  function say(t, bad) { msg.textContent = t; msg.style.color = bad ? '#b91c1c' : '#166534'; }
  function norm(v) {
    v = String(v || '').trim().replace(/\/+$/, '');
    if (v && !/^https?:\/\//i.test(v)) v = 'https://' + v;
    return v;
  }
  function valid(v) { try { var u = new URL(v); return HTTPS_ONLY ? u.protocol === 'https:' : /^https?:$/.test(u.protocol); } catch (e) { return false; } }
  function badMsg(v) {
    if (HTTPS_ONLY && /^http:\/\//i.test(v)) return 'Only secure https:// addresses are allowed \u00B7 \u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u064A\u062C\u0628 \u0623\u0646 \u064A\u0628\u062F\u0623 \u0628\u0640 https://';
    return 'Not a valid address \u00B7 \u0639\u0646\u0648\u0627\u0646 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D';
  }
  try { input.value = localStorage.getItem(KEY) || '__DEFAULT_URL__'; } catch (e) {}
  var coachBox = document.getElementById('coachKey');   // exists in the coach build only
  if (coachBox) { try { coachBox.value = localStorage.getItem('chess_coach_key') || ''; } catch (e) {} }
  document.getElementById('save').addEventListener('click', function () {
    var v = norm(input.value);
    if (!valid(v)) { say(badMsg(v), true); return; }
    try {
      localStorage.setItem(KEY, v); input.value = v;
      if (coachBox) { var ck = coachBox.value.trim(); if (ck) localStorage.setItem('chess_coach_key', ck); else localStorage.removeItem('chess_coach_key'); }
      say('Saved \u2713 \u00B7 \u062A\u0645 \u0627\u0644\u062D\u0641\u0638');
    }
    catch (e) { say('Could not save', true); }
  });
  document.getElementById('test').addEventListener('click', function () {
    var v = norm(input.value);
    if (!valid(v)) { say(badMsg(v), true); return; }
    say('Testing\u2026');
    fetch(v + '/auth/verify', { method: 'POST', headers: { 'ngrok-skip-browser-warning': 'true', 'Authorization': 'Bearer test' } })
      .then(function (r) { say('Server answered (HTTP ' + r.status + ') \u2713 \u00B7 \u0627\u0644\u0633\u064A\u0631\u0641\u0631 \u064A\u0631\u062F'); })
      .catch(function () { say('No answer. Is the server and ngrok running? \u00B7 \u0644\u0627 \u064A\u0648\u062C\u062F \u0631\u062F', true); });
  });
  document.getElementById('open').addEventListener('click', function () {
    var v = norm(input.value);
    if (valid(v)) { try { localStorage.setItem(KEY, v); } catch (e) {} }
    location.href = 'index.html#' + START;
  });
})();
