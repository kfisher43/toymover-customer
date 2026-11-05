(function () {
  'use strict';
  var SB_URL = 'https://jafgokwiwkbrshdzhleo.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImphZmdva3dpd2ticnNoZHpobGVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5OTU2MTksImV4cCI6MjEwNzU3MTYxOX0._gM5bNFyMk6xNgZP1S78UTnotI0HILnzL_bgv_zaMzM';
  var sb = supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  var view = document.getElementById('view');
  var session = null, recovery = false;
  var ITEM_TYPES = ['Motorcycle', 'Camper / RV', 'Trailer', 'Boat', 'Sign', 'Mini bike', 'Other'];
  var MAX_PHOTOS = 12;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function toast(t) { var el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 3500); }
  function cls(s) { return 's-' + String(s || '').toLowerCase().replace(/[^a-z]+/g, '-'); }
  function badge(s) { return '<span class="badge ' + cls(s) + '">' + esc(s) + '</span>'; }
  function money(n) { return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fdate(s) { return s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''; }
  function nice(e) { var m = (e && e.message) || String(e); return m; }
  function msg(kind, text) { return '<div class="msg ' + kind + '">' + esc(text) + '</div>'; }
  function setBusy(btn, on, label) { btn.disabled = on; if (label) btn.textContent = on ? 'Please wait…' : label; }

  // ---------- auth ----------
  function viewAuth(mode, note) {
    mode = mode || 'in';
    var title = mode === 'up' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Sign in';
    var h = '<h1>' + title + '</h1><div class="card"><form id="af" novalidate>';
    if (mode === 'up') h += '<label for="fn">Full name</label><input id="fn" autocomplete="name" required>';
    h += '<label for="em">Email</label><input id="em" type="email" autocomplete="email" required>';
    if (mode !== 'reset') h += '<label for="pw">Password</label><input id="pw" type="password" autocomplete="' + (mode === 'up' ? 'new-password' : 'current-password') + '" minlength="8" required>';
    h += '<div id="am"></div><button class="btn primary" type="submit" id="ab">' + (mode === 'up' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in') + '</button></form>';
    if (mode === 'in') h += '<p class="center"><button class="link" id="g-reset">Forgot password?</button></p><p class="center muted">New to Toymover? <button class="link" id="g-up">Create an account</button></p>';
    else h += '<p class="center"><button class="link" id="g-in">Back to sign in</button></p>';
    h += '</div><p class="muted center small">Fisher Transport LLC · Coppell, TX</p>';
    view.innerHTML = (note ? msg('ok', note) : '') + h;
    ['reset', 'up', 'in'].forEach(function (m) { var b = $('g-' + m); if (b) b.onclick = function () { viewAuth(m); }; });
    $('af').onsubmit = async function (ev) {
      ev.preventDefault();
      var am = $('am'), ab = $('ab'), label = ab.textContent; am.innerHTML = ''; setBusy(ab, true, label);
      var email = $('em').value.trim();
      try {
        if (mode === 'in') {
          var r = await sb.auth.signInWithPassword({ email: email, password: $('pw').value });
          if (r.error) throw r.error;
        } else if (mode === 'up') {
          var pw = $('pw').value; if (pw.length < 8) throw new Error('Password must be at least 8 characters.');
          var fn = $('fn').value.trim(); if (!fn) throw new Error('Please enter your name.');
          var r2 = await sb.auth.signUp({ email: email, password: pw, options: { emailRedirectTo: location.origin + location.pathname, data: { full_name: fn } } });
          if (r2.error) throw r2.error;
          if (!r2.data.session) { viewAuth('in', 'Account created. Check your email to confirm your address, then sign in.'); return; }
        } else {
          var r3 = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
          if (r3.error) throw r3.error;
          viewAuth('in', 'If that email has an account, a reset link is on its way.'); return;
        }
      } catch (e) { am.innerHTML = msg('err', nice(e)); setBusy(ab, false, label); }
    };
  }

  function viewNewPassword() {
    view.innerHTML = '<h1>Choose a new password</h1><div class="card"><form id="nf"><label for="np">New password</label><input id="np" type="password" minlength="8" autocomplete="new-password" required><div id="nm"></div><button class="btn primary" id="nb" type="submit">Save password</button></form></div>';
    $('nf').onsubmit = async function (ev) {
      ev.preventDefault(); var b = $('nb');
      if ($('np').value.length < 8) { $('nm').innerHTML = msg('err', 'Password must be at least 8 characters.'); return; }
      setBusy(b, true, 'Save password');
      var r = await sb.auth.updateUser({ password: $('np').value });
      if (r.error) { $('nm').innerHTML = msg('err', nice(r.error)); setBusy(b, false, 'Save password'); return; }
      recovery = false; toast('Password updated'); location.hash = '#/'; route();
    };
  }

  // ---------- photos ----------
  var pending = []; // File objects chosen in the current form
  function photoPicker(existingCount) {
    return '<label for="pf">Photos (optional, up to ' + (MAX_PHOTOS - (existingCount || 0)) + ')</label><input id="pf" type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple><div class="thumbs" id="pt"></div><p class="muted small">JPG, PNG, WebP or HEIC, 10 MB max each.</p>';
  }
  function wirePicker(existingCount) {
    pending = [];
    var pf = $('pf'); if (!pf) return;
    pf.onchange = function () {
      var room = MAX_PHOTOS - (existingCount || 0);
      Array.prototype.forEach.call(pf.files, function (f) {
        if (pending.length >= room) { toast('Maximum photos reached'); return; }
        if (f.size > 10 * 1024 * 1024) { toast(f.name + ' is over 10 MB'); return; }
        pending.push(f);
      });
      pf.value = ''; drawPending();
    };
  }
  function drawPending() {
    var t = $('pt'); if (!t) return; t.innerHTML = '';
    pending.forEach(function (f, i) {
      var d = document.createElement('div'); d.className = 'x';
      var im = document.createElement('img'); im.alt = 'Selected photo'; im.src = URL.createObjectURL(f);
      im.onerror = function () { im.replaceWith(Object.assign(document.createElement('div'), { className: 'ph' })); };
      d.appendChild(im);
      d.title = 'Tap to remove'; d.onclick = function () { pending.splice(i, 1); drawPending(); };
      t.appendChild(d);
    });
  }
  async function uploadPending() {
    var uid = session.user.id, paths = [];
    for (var i = 0; i < pending.length; i++) {
      var f = pending[i];
      var ext = (f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
      var path = uid + '/' + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + i) + '.' + ext;
      var r = await sb.storage.from('request-photos').upload(path, f, { contentType: f.type || 'image/jpeg', upsert: false });
      if (r.error) throw new Error('Photo upload failed: ' + r.error.message);
      paths.push(path);
    }
    return paths;
  }
  async function showPhotos(el, paths) {
    if (!paths || !paths.length) return;
    var r = await sb.storage.from('request-photos').createSignedUrls(paths, 3600);
    el.innerHTML = '';
    (r.data || []).forEach(function (o) { if (o.signedUrl) { var a = document.createElement('a'); a.href = o.signedUrl; a.target = '_blank'; a.rel = 'noopener'; var im = document.createElement('img'); im.src = o.signedUrl; im.alt = 'Request photo'; a.appendChild(im); el.appendChild(a); } });
  }

  // ---------- new request ----------
  async function viewNew() {
    var prof = await sb.from('customer_profiles').select('full_name,phone').eq('user_id', session.user.id).maybeSingle();
    var p = prof.data || {};
    var h = '<h1>New request</h1><form id="nf" class="card" novalidate>' +
      '<label>What do you need?</label><div class="seg"><label><input type="radio" name="rt" value="transport" checked><span>Transport job</span></label><label><input type="radio" name="rt" value="bid"><span>Get a quote (bid)</span></label></div>' +
      '<label for="it">Item type</label><select id="it">' + ITEM_TYPES.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('') + '</select>' +
      '<label for="id">Item details (year, make, model, size, weight)</label><textarea id="id" required placeholder="e.g. 2019 Harley Road Glide, 800 lb"></textarea>' +
      '<label for="pa">Pickup address</label><input id="pa" autocomplete="street-address" required>' +
      '<label for="pc">Pickup city / state</label><input id="pc" required>' +
      '<label for="da">Delivery address</label><input id="da" required>' +
      '<label for="dc">Delivery city / state</label><input id="dc" required>' +
      '<label for="pd">Preferred dates</label><input id="pd" placeholder="e.g. week of Nov 16, flexible">' +
      '<div class="two"><div><label for="cn">Contact name</label><input id="cn" value="' + esc(p.full_name || '') + '" required></div><div><label for="cp">Phone</label><input id="cp" type="tel" value="' + esc(p.phone || '') + '" required></div></div>' +
      '<label for="ce">Email</label><input id="ce" type="email" autocomplete="email" inputmode="email" value="' + esc((session.user && session.user.email) || '') + '" required>' +
      '<label>How should we contact you?</label><div class="seg"><label><input type="radio" name="cpref" value="text"><span>Text messaging</span></label><label><input type="radio" name="cpref" value="email"><span>Email</span></label></div>' +
      '<label for="nt">Notes (access, condition, gate codes)</label><textarea id="nt"></textarea>' + photoPicker(0) +
      '<div id="nmsg"></div><button class="btn primary" id="nb" type="submit">Submit request</button></form>';
    view.innerHTML = h; wirePicker(0);
    $('nf').onsubmit = async function (ev) {
      ev.preventDefault();
      var b = $('nb'), m = $('nmsg'); m.innerHTML = '';
      var v = function (id) { return $(id).value.trim(); };
      var need = [['id', 'item details'], ['pa', 'pickup address'], ['pc', 'pickup city'], ['da', 'delivery address'], ['dc', 'delivery city'], ['cn', 'contact name'], ['cp', 'phone'], ['ce', 'email']];
      for (var i = 0; i < need.length; i++) if (!v(need[i][0])) { m.innerHTML = msg('err', 'Please fill in ' + need[i][1] + '.'); return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v('ce'))) { m.innerHTML = msg('err', 'Please enter a valid email address.'); return; }
      var pref = document.querySelector('input[name=cpref]:checked');
      if (!pref) { m.innerHTML = msg('err', 'Please choose how we should contact you (text or email).'); return; }
      setBusy(b, true, 'Submit request');
      try {
        var photos = await uploadPending();
        var row = {
          request_type: document.querySelector('input[name=rt]:checked').value,
          contact_name: v('cn'), contact_phone: v('cp'), contact_email: v('ce'), contact_preference: pref.value,
          pickup_address: v('pa'), pickup_city: v('pc'), delivery_address: v('da'), delivery_city: v('dc'),
          item_description: $('it').value + ': ' + v('id'),
          preferred_dates: v('pd') || null, notes: v('nt') || null, photos: photos
        };
        var r = await sb.from('customer_requests').insert(row);
        if (r.error) throw r.error;
        pending = []; toast('Request submitted. We will review it shortly.'); location.hash = '#/';
      } catch (e) { m.innerHTML = msg('err', nice(e)); setBusy(b, false, 'Submit request'); }
    };
  }

  // ---------- list ----------
  async function viewList() {
    view.innerHTML = '<h1>My requests</h1><p class="muted center">Loading…</p>';
    var r = await sb.rpc('my_requests');
    if (r.error) { view.innerHTML = '<h1>My requests</h1>' + msg('err', nice(r.error)); return; }
    var rows = r.data || [];
    var h = '<h1>My requests</h1><a class="btn primary" href="#/new">+ New request</a>';
    if (!rows.length) h += '<p class="muted center">No requests yet. Tap “New request” to get started.</p>';
    rows.forEach(function (q) {
      h += '<a class="card" href="#/r/' + q.id + '"><div class="row"><span class="title">' + esc(q.item_description) + '</span>' + badge(q.status) + '</div>' +
        '<div class="muted small">' + esc(q.pickup_city || '') + ' → ' + esc(q.delivery_city || '') + ' · ' + (q.request_type === 'bid' ? 'Quote request' : 'Transport') + ' · ' + fdate(q.created_at) + '</div>' +
        (q.status === 'Quoted' && q.quote_amount != null ? '<div class="pay small"><b>Quote ready: ' + money(q.quote_amount) + '</b> – tap to review</div>' : '') +
        (q.status === 'Missing information' ? '<div class="small" style="color:var(--warn)"><b>We need a little more information</b> – tap to reply</div>' : '') + '</a>';
    });
    view.innerHTML = h;
  }

  // ---------- detail ----------
  function prefLabel(p) { return p === 'text' ? 'Text messaging' : p === 'email' ? 'Email' : ''; }
  function kv(k, v) { return v ? '<div class="kv"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div></div>' : ''; }
  async function viewDetail(id) {
    view.innerHTML = '<p class="muted center">Loading…</p>';
    var r = await sb.rpc('my_requests');
    if (r.error) { view.innerHTML = msg('err', nice(r.error)); return; }
    var q = (r.data || []).filter(function (x) { return x.id === id; })[0];
    if (!q) { view.innerHTML = '<p><a href="#/">← Back</a></p>' + msg('err', 'Access denied or request not found. You can only view requests submitted from your own account.'); return; }
    var h = '<p><a href="#/">← My requests</a></p><div class="card"><div class="row"><span class="title">' + esc(q.item_description) + '</span>' + badge(q.status) + '</div>' +
      '<div class="muted small">Submitted ' + fdate(q.created_at) + ' · ' + (q.request_type === 'bid' ? 'Quote request' : 'Transport') + '</div>' +
      (q.public_message ? '<div class="msg ' + (q.status === 'Missing information' ? 'warn' : 'ok') + '"><b>From Toymover:</b> ' + esc(q.public_message) + '</div>' : '') +
      (q.delivery_week ? kv('Scheduled week of', fdate(q.delivery_week)) : '') +
      kv('Pickup', [q.pickup_address, q.pickup_city].filter(Boolean).join(', ')) + kv('Delivery', [q.delivery_address, q.delivery_city].filter(Boolean).join(', ')) +
      kv('Preferred dates', q.preferred_dates) + kv('Contact', [q.contact_name, q.contact_phone].filter(Boolean).join(' · ')) + kv('Email', q.contact_email) + kv('Preferred contact method', prefLabel(q.contact_preference)) + kv('Notes', q.notes) +
      '<div class="thumbs" id="ph"></div></div>' + threadCard();
    if (q.status === 'Quoted' && q.quote_amount != null) {
      h += '<div class="card quote"><div class="muted">Your quote</div><div class="amt">' + money(q.quote_amount) + '</div><div class="muted small">Quoted ' + fdate(q.quote_released_at) + '</div>' +
        '<div id="qm"></div><button class="btn primary" id="acc">Accept quote</button><label for="dn" style="text-align:left">Or decline (optional reason)</label><textarea id="dn" placeholder="Reason (optional)"></textarea><button class="btn danger" id="dec">Decline quote</button></div>';
    }
    if (q.status === 'Missing information') {
      h += '<div class="card"><h2 style="margin-top:0">Send the missing information</h2><textarea id="rn" placeholder="Type the details we asked for"></textarea>' + photoPicker((q.photos || []).length) + '<div id="rm"></div><button class="btn primary" id="rb">Send to Toymover</button></div>';
    }
    if (['Submitted', 'In Review'].indexOf(q.status) >= 0) {
      h += '<div class="card"><h2 style="margin-top:0">Add details</h2><textarea id="rn" placeholder="Anything else we should know?"></textarea>' + photoPicker((q.photos || []).length) + '<div id="rm"></div><button class="btn" id="rb">Add to request</button></div>';
    }
    if (['Submitted', 'In Review', 'Missing information', 'Quoted', 'Accepted'].indexOf(q.status) >= 0) h += '<button class="btn danger" id="cx">Cancel this request</button><div id="cm"></div>';
    if (q.status === 'Accepted') h += msg('ok', 'Quote accepted. Toymover will confirm scheduling with you.');
    view.innerHTML = h;
    showPhotos($('ph'), q.photos);
    wireThread(id, false);
    wirePicker((q.photos || []).length);

    function act(btn, fn, doneMsg, box) {
      btn.onclick = async function () {
        var label = btn.textContent; setBusy(btn, true, label); box.innerHTML = '';
        try { await fn(); toast(doneMsg); viewDetail(id); } catch (e) { box.innerHTML = msg('err', nice(e)); setBusy(btn, false, label); }
      };
    }
    if ($('acc')) {
      act($('acc'), async function () { var r = await sb.rpc('customer_accept_quote', { p_request_id: id }); if (r.error) throw r.error; }, 'Quote accepted', $('qm'));
      act($('dec'), async function () { if (!confirm('Decline this quote? The request will be cancelled.')) throw new Error('Not declined.'); var r = await sb.rpc('customer_decline_quote', { p_request_id: id, p_note: $('dn').value.trim() || null }); if (r.error) throw r.error; }, 'Quote declined', $('qm'));
    }
    if ($('rb')) act($('rb'), async function () {
      var note = $('rn').value.trim(); if (!note && !pending.length) throw new Error('Please add a note or a photo.');
      var photos = await uploadPending();
      var r = await sb.rpc('customer_respond_request', { p_request_id: id, p_notes: note, p_photos: photos }); if (r.error) throw r.error; pending = [];
    }, 'Sent. Thank you!', $('rm'));
    if ($('cx')) act($('cx'), async function () { if (!confirm('Cancel this request?')) throw new Error('Not cancelled.'); var r = await sb.rpc('customer_cancel_request', { p_request_id: id }); if (r.error) throw r.error; }, 'Request cancelled', $('cm'));
  }

  // ---------- conversation thread (customer + supervisor) ----------
  function threadCard() {
    return '<div class="card"><h2 style="margin-top:0">Conversation</h2><div id="th"><p class="muted small">Loading…</p></div>' +
      '<label for="tb">Message</label><textarea id="tb" maxlength="2000" placeholder="Type a message"></textarea><div id="tm"></div><button class="btn primary" id="ts">Send message</button></div>';
  }
  async function wireThread(id, sup) {
    var box = $('th');
    async function load() {
      var r = await sb.rpc(sup ? 'sup_list_messages' : 'customer_list_messages', { p_request_id: id });
      if (r.error) { box.innerHTML = msg('err', nice(r.error)); return; }
      var rows = r.data || [];
      if (!rows.length) { box.innerHTML = '<p class="muted small">No messages yet.</p>'; return; }
      box.innerHTML = rows.map(function (m) {
        var mine = sup ? m.sender_role === 'supervisor' : m.sender_role === 'customer';
        return '<div class="bubble ' + (mine ? 'mine' : 'theirs') + '"><div class="who">' + esc(m.sender_name || m.sender_role) + (sup ? ' · ' + esc(m.sender_role) : '') + ' · ' + new Date(m.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + '</div>' + esc(m.body) + '</div>';
      }).join('');
    }
    $('ts').onclick = async function () {
      var b = $('ts'), t = $('tb'), body = t.value.trim(), tm = $('tm'); tm.innerHTML = '';
      if (!body) { tm.innerHTML = msg('err', 'Type a message first.'); return; }
      setBusy(b, true, 'Send message');
      var r = await sb.rpc(sup ? 'sup_post_message' : 'customer_post_message', { p_request_id: id, p_body: body });
      setBusy(b, false, 'Send message');
      if (r.error) { tm.innerHTML = msg('err', nice(r.error)); return; }
      t.value = ''; toast('Message sent'); load();
    };
    await load();
  }

  // ---------- supervisor deep link (#/r/<uuid> when signed in as owner/supervisor) ----------
  var STATUSES = ['Submitted', 'In Review', 'Missing information', 'Scheduled', 'In Transit', 'Delivered', 'Cancelled'];
  async function isSup() {
    try { var r = await sb.rpc('my_profile'); if (r.error) return false; var p = (r.data || [])[0]; return !!(p && (p.is_owner || p.is_supervisor)); } catch (e) { return false; }
  }
  async function viewSupDetail(id) {
    view.innerHTML = '<p class="muted center">Loading…</p>';
    var r = await sb.rpc('sup_customer_requests');
    if (r.error) { view.innerHTML = msg('err', nice(r.error)); return; }
    var q = (r.data || []).filter(function (x) { return x.id === id; })[0];
    if (!q) { view.innerHTML = msg('err', 'Request not found.'); return; }
    var priced = q.quote_amount != null || q.quoted_price != null || q.internal_notes != null;
    var h = '<div class="msg warn small"><b>Supervisor view</b> · request ' + esc(q.id) + '</div><div class="card"><div class="row"><span class="title">' + esc(q.item_description) + '</span>' + badge(q.status) + '</div>' +
      '<div class="muted small">Submitted ' + fdate(q.created_at) + ' · ' + (q.request_type === 'bid' ? 'Quote request' : 'Transport') + (q.reviewed_by ? ' · reviewed by ' + esc(q.reviewed_by) + ' ' + fdate(q.reviewed_at) : '') + '</div>' +
      '<h2>Customer</h2>' + kv('Account name', q.customer_name) + kv('Account email', q.customer_email) + kv('Company', q.customer_company) +
      kv('Contact', [q.contact_name, q.contact_phone].filter(Boolean).join(' · ')) + kv('Contact email', q.contact_email) + kv('Preferred contact method', prefLabel(q.contact_preference)) +
      '<h2>Job</h2>' + kv('Pickup', [q.pickup_address, q.pickup_city].filter(Boolean).join(', ')) + kv('Delivery', [q.delivery_address, q.delivery_city].filter(Boolean).join(', ')) +
      kv('Preferred dates', q.preferred_dates) + kv('Notes', q.notes) + kv('Message shown to customer', q.public_message) +
      kv('Linked job', q.job_id) + kv('Accepted', q.accepted_at ? new Date(q.accepted_at).toLocaleString() : '') + kv('Declined', q.declined_at ? new Date(q.declined_at).toLocaleString() : '') + kv('Customer response', q.customer_response_note) +
      '<div class="thumbs" id="ph"></div></div>' + threadCard();
    h += '<div class="card"><h2 style="margin-top:0">Quote</h2>' +
      (priced ? kv('Released quote (customer sees)', q.quote_amount != null ? money(q.quote_amount) : 'not released') + kv('Draft quoted price', q.quoted_price != null ? money(q.quoted_price) : '') + kv('Internal notes', q.internal_notes) : '<p class="muted small">Prices are visible only to users with price access (Ken / Rob). If you have access and see nothing here, no quote has been entered yet.</p>') +
      '<label for="qp">Quoted price ($)</label><input id="qp" type="number" min="0" step="0.01" inputmode="decimal" value="' + (q.quoted_price != null ? esc(q.quoted_price) : (q.quote_amount != null ? esc(q.quote_amount) : '')) + '">' +
      '<label for="qn">Internal notes (never shown to customer)</label><textarea id="qn">' + esc(q.internal_notes || '') + '</textarea><div id="qm"></div>' +
      '<button class="btn" id="qs">Save draft (not visible to customer)</button><button class="btn primary" id="qr">Release quote to customer</button></div>';
    h += '<div class="card"><h2 style="margin-top:0">Status</h2><label for="ss">Set status</label><select id="ss">' +
      STATUSES.map(function (s) { return '<option' + (s === q.status ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select>' +
      '<label for="sm">Message to customer (optional – shown to the customer)</label><textarea id="sm" placeholder="Leave blank to keep the current message"></textarea><div id="sm2"></div><button class="btn primary" id="sb">Update status</button></div>';
    if (!q.job_id && ['Cancelled', 'Delivered'].indexOf(q.status) < 0) h += '<div class="card"><h2 style="margin-top:0">Convert' + (q.status === 'Accepted' ? ' <span class="badge s-accepted">customer accepted</span>' : '') + '</h2><p class="muted small">Creates a Booked job from this request and marks it Accepted.</p><div id="cm"></div><button class="btn" id="cv">Convert to job</button></div>';
    view.innerHTML = h;
    showPhotos($('ph'), q.photos);
    wireThread(id, true);
    function act(btn, fn, doneMsg, box) {
      btn.onclick = async function () {
        var label = btn.textContent; setBusy(btn, true, label); box.innerHTML = '';
        try { var out = await fn(); toast(typeof out === 'string' && out ? out : doneMsg); viewSupDetail(id); } catch (e) { box.innerHTML = msg('err', nice(e)); setBusy(btn, false, label); }
      };
    }
    function quote(release) {
      return async function () {
        var pv = $('qp').value.trim(); var price = pv === '' ? null : Number(pv);
        if (price !== null && (!isFinite(price) || price < 0)) throw new Error('Enter a valid price.');
        if (release) { if (price === null) throw new Error('Enter a price to release.'); if (!confirm('Release ' + money(price) + ' to the customer now?')) throw new Error('Not released.'); }
        var r = await sb.rpc('sup_quote_request', { p_request_id: id, p_quoted_price: price, p_internal_notes: $('qn').value.trim() || null, p_release: release });
        if (r.error) throw r.error; return r.data;
      };
    }
    act($('qs'), quote(false), 'Saved', $('qm'));
    act($('qr'), quote(true), 'Released', $('qm'));
    act($('sb'), async function () {
      var st = $('ss').value; if (st === q.status) throw new Error('Status is already ' + st + '.');
      if (!confirm('Set status to ' + st + '?')) throw new Error('Not changed.');
      var r = await sb.rpc('sup_set_request_status', { p_request_id: id, p_status: st, p_public_message: $('sm').value.trim() || null }); if (r.error) throw r.error;
    }, 'Status updated', $('sm2'));
    if ($('cv')) act($('cv'), async function () {
      if (!confirm('Convert this request to a Booked job?')) throw new Error('Not converted.');
      var r = await sb.rpc('sup_convert_request_to_job', { p_request_id: id }); if (r.error) throw r.error; return 'Created job ' + r.data;
    }, 'Converted', $('cm'));
  }
  async function viewRequest(id) {
    view.innerHTML = '<p class="muted center">Loading…</p>';
    if (await isSup()) return viewSupDetail(id);
    return viewDetail(id);
  }

  // ---------- routing ----------
  function setChrome() {
    var signed = !!session && !recovery;
    $('tabs').hidden = !signed; $('logout').hidden = !signed;
    $('who').textContent = signed ? (session.user.email || '') : '';
    var h = location.hash || '#/';
    $('t-new').classList.toggle('on', h === '#/new'); $('t-list').classList.toggle('on', h !== '#/new');
  }
  async function route() {
    setChrome();
    if (recovery) return viewNewPassword();
    if (!session) return viewAuth('in');
    var h = location.hash || '#/', m;
    if (h === '#/new') return viewNew();
    if ((m = h.match(/^#\/r\/([0-9a-f-]{36})$/i))) return viewRequest(m[1].toLowerCase());
    return viewList();
  }
  $('logout').onclick = async function () { await sb.auth.signOut(); };
  window.addEventListener('hashchange', route);
  sb.auth.onAuthStateChange(function (ev, s) {
    var was = session && session.user && session.user.id;
    session = s;
    if (ev === 'PASSWORD_RECOVERY') recovery = true;
    if (ev === 'SIGNED_OUT') { recovery = false; location.hash = '#/'; }
    if (ev === 'INITIAL_SESSION' || ev === 'SIGNED_IN' && (!was || was !== (s && s.user.id)) || ev === 'SIGNED_OUT' || ev === 'PASSWORD_RECOVERY') setTimeout(route, 0);
  });
})();
