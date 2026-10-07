const $ = id => document.getElementById(id);
let space = '', account;
async function api(path, body) {
  const response = await fetch('/spaces/api/' + path, body === undefined ? {} : {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}
function clearGroup() { $('group').hidden = true; $('notices').replaceChildren(); $('members').textContent = ''; }
function signedIn(value) { account = value; $('login').hidden = !!value; $('account').hidden = !value; $('identity').textContent = value ? 'Signed in as ' + value.username : ''; clearGroup(); }
async function run(action) {
  $('status').textContent = '';
  document.querySelectorAll('button').forEach(b => b.disabled = true);
  try { await action(); } catch (error) { $('status').textContent = error.message; }
  finally { document.querySelectorAll('button').forEach(b => b.disabled = false); }
}
async function openGroup(value) {
  clearGroup(); space = value;
  const data = await api('group?space=' + btoa(space).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''));
  history.replaceState(null, '', '/spaces/#' + space);
  $('share-link').value = location.origin + '/spaces/#' + space;
  $('group-name').textContent = data.name; $('owner').hidden = !data.owner;
  $('members').textContent = data.members ? data.members.filter(m => m.read).length + ' invited reader(s) listed. The owner always has access.' : '';
  for (const record of data.records) {
    const article = document.createElement('article'); article.className = 'notice';
    const date = document.createElement('time'); date.textContent = new Date(record.value.createdAt).toLocaleString();
    const content = document.createElement('p'); content.textContent = record.value.text;
    article.append(date, content); $('notices').append(article);
  }
  if (!data.records.length) $('notices').textContent = 'No notices yet.';
  $('more').hidden = !data.more; $('group').hidden = false;
}
$('login-form').onsubmit = event => { event.preventDefault(); const input = Object.fromEntries(new FormData(event.target)); const action = event.submitter.value; run(async () => { signedIn(await api(action, input)); event.target.reset(); if (location.hash) await openGroup(location.hash.slice(1)); }); };
$('logout').onclick = () => run(async () => { await api('logout', {}); signedIn(null); });
$('create-form').onsubmit = event => { event.preventDefault(); const input = Object.fromEntries(new FormData(event.target)); run(async () => { const group = await api('groups', input); await openGroup(group.uri); event.target.reset(); }); };
$('open-form').onsubmit = event => { event.preventDefault(); const link = new FormData(event.target).get('link').trim(); run(() => openGroup(link.includes('#') ? link.slice(link.indexOf('#') + 1) : link)); };
$('member-form').onsubmit = event => { event.preventDefault(); const input = Object.fromEntries(new FormData(event.target)); input.remove = event.submitter.value === 'remove'; run(async () => { await api('members', {...input, space}); await openGroup(space); $('status').textContent = input.remove ? 'Reader removed.' : 'Reader added. Share the group link with them.'; event.target.reset(); }); };
$('notice-form').onsubmit = event => { event.preventDefault(); const input = Object.fromEntries(new FormData(event.target)); run(async () => { await api('notices', {...input, space}); await openGroup(space); event.target.reset(); }); };
$('refresh').onclick = () => run(() => openGroup(space));
window.addEventListener('hashchange', () => { if (account && location.hash) run(() => openGroup(location.hash.slice(1))); });
run(async () => { try { signedIn(await api('me')); } catch { signedIn(null); } if (account && location.hash) await openGroup(location.hash.slice(1)); });
