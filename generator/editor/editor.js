/* Rasadnik Bernat editor — klijentska logika. Vanilla JS. */
(function () {
  'use strict';

  // Stanje u memoriji; spremanje šalje cijeli objekt na server.
  var state = {
    contact: { number: '', mail: '', address: '', mapUrl: '', mapIframe: '' },
    products: [],
    services: [],
    about: [],
  };
  var dirty = false;

  // ---- Pomoćno ----
  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
  function placeholderUrl() { return '/img/placeholder/nema-slike.png'; }
  // Vrati URL slike za editor UI prema sekciji.
  function imgUrl(section, name, dir) {
    if (!name) return placeholderUrl();
    if (section === 'products') {
      if (!dir) return placeholderUrl();
      return '/img/products/' + encodeURIComponent(dir) + '/' + encodeURIComponent(name);
    }
    return '/img/' + section + '/' + encodeURIComponent(name);
  }
  function setStatus(msg, kind) {
    var s = $('status');
    s.textContent = msg || '';
    s.className = 'ed-status' + (kind ? ' ' + kind : '');
  }
  function markDirty() { dirty = true; setStatus('Nespremljene promjene', ''); }

  // Collapsible kartica: head je klikabilan (toggle), body se skriva/prikazuje.
  // 'subtitle' je opcionalni sažetak koji se vidi u collapsed stanju (npr. cijena/slika).
  // Vraća { card, head, body, title, subtitle, setExpanded }.
  function makeCollapsibleCard(titleText, actionNodes, startExpanded) {
    var chevron = el('span', { class: 'chevron', text: '▸' });
    var title = el('span', { class: 'card-title', text: titleText });
    var subtitle = el('span', { class: 'card-subtitle' });
    var actions = el('div', { class: 'card-head-actions' }, actionNodes || []);
    // Lijeva (klikabilna) strana headera: chevron + naslov + sažetak.
    var headLeft = el('div', { class: 'card-head-left' }, [chevron, title, subtitle]);
    var head = el('div', { class: 'card-head' }, [headLeft, actions]);
    var body = el('div', { class: 'card-body' });
    var card = el('div', { class: 'card' + (startExpanded ? '' : ' collapsed') }, [head, body]);

    function setExpanded(on) {
      if (on) card.classList.remove('collapsed');
      else card.classList.add('collapsed');
      chevron.textContent = on ? '▾' : '▸';
    }
    setExpanded(!!startExpanded);

    // Klik na lijevi dio headera toggla. Klik na akcije (desno) se ne propagira.
    headLeft.addEventListener('click', function () {
      setExpanded(card.classList.contains('collapsed'));
    });
    actions.addEventListener('click', function (e) { e.stopPropagation(); });

    return { card: card, head: head, body: body, title: title, subtitle: subtitle, setExpanded: setExpanded };
  }

  function api(path, opts) {
    return fetch(path, opts).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
        return j;
      });
    });
  }

  // Slug iz naziva (za default imageDir novih proizvoda).
  function slugify(str) {
    var map = { 'č': 'c', 'ć': 'c', 'đ': 'd', 'š': 's', 'ž': 'z' };
    return String(str || '')
      .toLowerCase()
      .replace(/[čćđšž]/g, function (c) { return map[c] || c; })
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  // ---- Modal (image preview + promjena) ----
  var activeModal = null;
  function openModal(id) {
    var m = $(id);
    if (!m) return;
    m.hidden = false;
    activeModal = m;
  }
  function closeModal(m) {
    m = m || activeModal;
    if (!m) return;
    m.hidden = true;
    if (m === activeModal) activeModal = null;
  }

  // Image modal: preview + upload nove slike. onDone(filename) poziva se nakon uploada.
  var imageOnDone = null;
  var imageUploadCtx = null; // { section, dir }
  function openImageModal(section, dir, currentImage, onDone) {
    imageOnDone = onDone;
    imageUploadCtx = { section: section, dir: dir };
    var preview = $('imageModalPreview');
    preview.src = currentImage ? imgUrl(section, currentImage, dir) : placeholderUrl();
    preview.onerror = function () { preview.onerror = null; preview.src = placeholderUrl(); };
    openModal('modalImage');
  }

  // ---- Upload slike ----
  function uploadFile(section, dir, file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        api('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ section: section, imageDir: dir, filename: file.name, dataBase64: reader.result }),
        }).then(function (res) { resolve(res.filename); }).catch(reject);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ===================== PRODUCTS =====================
  function renderProducts() {
    var list = $('productsList');
    list.innerHTML = '';
    if (!state.products.length) {
      list.appendChild(el('div', { class: 'empty-note', text: 'Nema sadnica. Klikni "+ Dodaj sadnicu".' }));
      return;
    }
    state.products.forEach(function (p, idx) {
      list.appendChild(renderProductCard(p, idx, p.__expand === true));
      delete p.__expand;
    });
  }

  function renderProductCard(p, idx, startExpanded) {
    var delBtn = el('button', { class: 'row-del', type: 'button', title: 'Obriši sadnicu', text: '🗑' });
    delBtn.addEventListener('click', function () {
      if (!confirm('Obrisati sadnicu "' + (p.hr_name || p.name || '') + '"?')) return;
      state.products.splice(idx, 1);
      markDirty();
      renderProducts();
    });

    var c = makeCollapsibleCard(p.hr_name || p.name || '(nova sadnica)', [delBtn], startExpanded);
    function syncSummary() {
      c.title.textContent = p.hr_name || p.name || '(nova sadnica)';
      var price = (p.price === null || p.price === undefined || String(p.price).trim() === '') ? 'na upit' : (p.price + ' €');
      c.subtitle.textContent = price;
    }
    syncSummary();

    // Lijevo: slike (galerija foldera) + imageDir
    var imgBlock = renderProductImages(p, syncSummary);

    // Desno: dvojezična polja + cijene
    var fields = el('div', {});
    fields.appendChild(textField('Naziv (HR)', 'hr', p.hr_name, function (v) { p.hr_name = v; syncSummary(); markDirty(); }));
    fields.appendChild(textField('Name (EN)', 'en', p.name, function (v) { p.name = v; syncSummary(); markDirty(); }));
    fields.appendChild(textareaField('Opis (HR)', 'hr', p.hr_description, function (v) { p.hr_description = v; markDirty(); }));
    fields.appendChild(textareaField('Description (EN)', 'en', p.description, function (v) { p.description = v; markDirty(); }));

    // Cijena + sidrena cijena. Logika (kao marinWeb): kad promijeniš redovnu
    // cijenu, ako sidrena JOŠ NE postoji -> postavi je na redovnu; ako postoji -> ne diraj.
    var anchorInput = null;
    var priceField = numField('Cijena (€)', p.price, function (v) {
      p.price = v;
      var anchorEmpty = (p.anchorPrice === null || p.anchorPrice === undefined || String(p.anchorPrice).trim() === '');
      if (anchorEmpty) {
        p.anchorPrice = (v === '' || v === null) ? null : v;
        if (anchorInput) anchorInput.value = (p.anchorPrice === null) ? '' : p.anchorPrice;
      }
      syncSummary();
      markDirty();
    });
    var anchorField = numField('Sidrena cijena (€)', p.anchorPrice, function (v) { p.anchorPrice = v; markDirty(); });
    anchorInput = anchorField.querySelector('input');
    var priceRow = el('div', { class: 'price-row' }, [priceField, anchorField]);
    fields.appendChild(priceRow);

    c.body.appendChild(el('div', { class: 'card-body-grid' }, [imgBlock, fields]));
    return c.card;
  }

  // Blok slika proizvoda: naziv foldera (imageDir) + mreža thumbova + dodavanje.
  function renderProductImages(p, onNameSync) {
    var wrap = el('div', { class: 'img-block' });

    // imageDir input
    var dirField = el('div', { class: 'field img-dir-field' });
    dirField.appendChild(el('label', { text: 'Folder slika (imageDir)' }));
    var dirInput = el('input', { type: 'text', value: p.imageDir || '', placeholder: 'npr. kesten_golog_korjena' });
    dirField.appendChild(dirInput);
    wrap.appendChild(dirField);

    var thumbs = el('div', { class: 'img-thumbs' });
    wrap.appendChild(thumbs);

    function loadThumbs() {
      thumbs.innerHTML = '';
      if (!p.imageDir) {
        thumbs.appendChild(el('span', { class: 'hint', text: 'Upiši folder pa dodaj slike.' }));
        return;
      }
      api('/api/images?section=products&dir=' + encodeURIComponent(p.imageDir)).then(function (res) {
        thumbs.innerHTML = '';
        (res.images || []).forEach(function (fn) {
          thumbs.appendChild(thumbCell('products', p.imageDir, fn, loadThumbs));
        });
        thumbs.appendChild(addThumbBtn('products', p.imageDir, loadThumbs, dirInput));
      }).catch(function () {
        thumbs.innerHTML = '';
        thumbs.appendChild(addThumbBtn('products', p.imageDir, loadThumbs, dirInput));
      });
    }

    dirInput.addEventListener('input', function () {
      p.imageDir = dirInput.value.trim();
      markDirty();
    });
    dirInput.addEventListener('change', loadThumbs);

    loadThumbs();
    return wrap;
  }

  // Jedan thumb u mreži s gumbom za brisanje.
  function thumbCell(section, dir, fn, reload) {
    var img = el('img', { src: imgUrl(section, fn, dir), alt: fn, title: fn });
    img.onerror = function () { img.onerror = null; img.src = placeholderUrl(); };
    var del = el('button', { class: 'thumb-del', type: 'button', title: 'Obriši sliku', text: '✕' });
    del.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!confirm('Obrisati sliku "' + fn + '"?')) return;
      api('/api/delete-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: section, imageDir: dir, filename: fn }),
      }).then(function () { reload(); setStatus('Slika obrisana ✓', 'ok'); })
        .catch(function (err) { setStatus('Greška: ' + err.message, 'err'); });
    });
    var cell = el('div', { class: 'img-thumb' }, [img, del]);
    cell.addEventListener('click', function () {
      openImageModal(section, dir, fn, null);
    });
    return cell;
  }

  // "+" gumb za dodavanje slike u folder (preko skrivenog file inputa).
  function addThumbBtn(section, dir, reload, dirInput) {
    var input = el('input', { type: 'file', accept: 'image/*', multiple: 'multiple', style: 'display:none;' });
    var btn = el('div', { class: 'img-thumb', style: 'display:flex;align-items:center;justify-content:center;font-size:1.5rem;color:var(--muted);cursor:pointer;', title: 'Dodaj sliku', text: '+' });
    btn.addEventListener('click', function () {
      if (dirInput && !dirInput.value.trim()) { setStatus('Prvo upiši naziv foldera (imageDir).', 'err'); return; }
      input.click();
    });
    input.addEventListener('change', function () {
      var files = Array.prototype.slice.call(input.files || []);
      if (!files.length) return;
      setStatus('Učitavam slike…', '');
      var chain = Promise.resolve();
      files.forEach(function (f) {
        chain = chain.then(function () { return uploadFile(section, dir, f); });
      });
      chain.then(function () { input.value = ''; reload(); setStatus('Slike učitane ✓', 'ok'); })
        .catch(function (err) { setStatus('Upload greška: ' + err.message, 'err'); });
    });
    var holder = el('span', {}, [btn, input]);
    return holder;
  }

  // ===================== SERVICES =====================
  function renderServices() {
    var list = $('servicesList');
    list.innerHTML = '';
    if (!state.services.length) {
      list.appendChild(el('div', { class: 'empty-note', text: 'Nema usluga. Klikni "+ Dodaj uslugu".' }));
      return;
    }
    state.services.forEach(function (s, idx) {
      list.appendChild(renderServiceCard(s, idx, s.__expand === true));
      delete s.__expand;
    });
  }

  function renderServiceCard(s, idx, startExpanded) {
    var delBtn = el('button', { class: 'row-del', type: 'button', title: 'Obriši uslugu', text: '🗑' });
    delBtn.addEventListener('click', function () {
      if (!confirm('Obrisati uslugu "' + (s.hr_name || s.name || '') + '"?')) return;
      state.services.splice(idx, 1);
      markDirty();
      renderServices();
    });

    var c = makeCollapsibleCard(s.hr_name || s.name || '(nova usluga)', [delBtn], startExpanded);
    function syncTitle() { c.title.textContent = s.hr_name || s.name || '(nova usluga)'; }

    var imgBlock = singleImageBlock('services', '', s.imageName, function (fn) {
      s.imageName = fn || '';
      markDirty();
    });

    var fields = el('div', {});
    fields.appendChild(textField('Naziv (HR)', 'hr', s.hr_name, function (v) { s.hr_name = v; syncTitle(); markDirty(); }));
    fields.appendChild(textField('Name (EN)', 'en', s.name, function (v) { s.name = v; markDirty(); }));
    fields.appendChild(textareaField('Opis (HR)', 'hr', s.hr_description, function (v) { s.hr_description = v; markDirty(); }));
    fields.appendChild(textareaField('Description (EN)', 'en', s.description, function (v) { s.description = v; markDirty(); }));

    c.body.appendChild(el('div', { class: 'card-body-grid' }, [imgBlock, fields]));
    return c.card;
  }

  // ===================== ABOUT =====================
  function renderAbout() {
    var list = $('aboutList');
    list.innerHTML = '';
    if (!state.about.length) {
      list.appendChild(el('div', { class: 'empty-note', text: 'Nema sekcija. Klikni "+ Dodaj sekciju".' }));
      return;
    }
    state.about.forEach(function (a, idx) {
      list.appendChild(renderAboutCard(a, idx, a.__expand === true));
      delete a.__expand;
    });
  }

  function renderAboutCard(a, idx, startExpanded) {
    var delBtn = el('button', { class: 'row-del', type: 'button', title: 'Obriši sekciju', text: '🗑' });
    delBtn.addEventListener('click', function () {
      if (!confirm('Obrisati sekciju "' + (a.hr_title || a.title || '') + '"?')) return;
      state.about.splice(idx, 1);
      markDirty();
      renderAbout();
    });

    var c = makeCollapsibleCard(a.hr_title || a.title || '(nova sekcija)', [delBtn], startExpanded);
    function syncTitle() { c.title.textContent = a.hr_title || a.title || '(nova sekcija)'; }

    var imgBlock = singleImageBlock('about', '', a.imageName, function (fn) {
      a.imageName = fn || '';
      markDirty();
    });

    var fields = el('div', {});
    fields.appendChild(textField('Naslov (HR)', 'hr', a.hr_title, function (v) { a.hr_title = v; syncTitle(); markDirty(); }));
    fields.appendChild(textField('Title (EN)', 'en', a.title, function (v) { a.title = v; markDirty(); }));
    fields.appendChild(textareaField('Opis (HR)', 'hr', a.hr_description, function (v) { a.hr_description = v; markDirty(); }));
    fields.appendChild(textareaField('Description (EN)', 'en', a.description, function (v) { a.description = v; markDirty(); }));

    c.body.appendChild(el('div', { class: 'card-body-grid' }, [imgBlock, fields]));
    return c.card;
  }

  // Blok s jednom slikom (services/about): klik otvara modal za promjenu.
  function singleImageBlock(section, dir, current, onPick) {
    var wrap = el('div', { class: 'img-block' });
    var box = el('div', { class: 'img-single', title: 'Klikni za pregled / promjenu slike' });
    var img = el('img', { src: current ? imgUrl(section, current, dir) : placeholderUrl(), alt: current || '' });
    img.onerror = function () { img.onerror = null; img.src = placeholderUrl(); };
    box.appendChild(img);
    box.addEventListener('click', function () {
      openImageModal(section, dir, current, function (fn) {
        current = fn;
        img.src = imgUrl(section, fn, dir);
        if (onPick) onPick(fn);
      });
    });
    wrap.appendChild(box);
    return wrap;
  }

  // ===================== GALLERY =====================
  function renderGallery() {
    var grid = $('galleryGrid');
    grid.innerHTML = '';
    api('/api/images?section=gallery').then(function (res) {
      grid.innerHTML = '';
      var imgs = res.images || [];
      if (!imgs.length) {
        grid.appendChild(el('div', { class: 'gallery-empty', text: 'Nema slika u galeriji. Klikni "+ Dodaj slike".' }));
        return;
      }
      imgs.forEach(function (fn) {
        var img = el('img', { src: imgUrl('gallery', fn), alt: fn, title: fn });
        img.onerror = function () { img.onerror = null; img.src = placeholderUrl(); };
        var del = el('button', { class: 'cell-del', type: 'button', title: 'Obriši', text: '✕' });
        del.addEventListener('click', function (e) {
          e.stopPropagation();
          if (!confirm('Obrisati sliku "' + fn + '"?')) return;
          api('/api/delete-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ section: 'gallery', filename: fn }),
          }).then(function () { renderGallery(); setStatus('Slika obrisana ✓', 'ok'); })
            .catch(function (err) { setStatus('Greška: ' + err.message, 'err'); });
        });
        var cell = el('div', { class: 'gallery-cell' }, [img, del]);
        cell.addEventListener('click', function () { openGalleryModal(fn); });
        grid.appendChild(cell);
      });
    }).catch(function (e) { setStatus('Greška pri učitavanju galerije: ' + e.message, 'err'); });
  }

  var galleryModalFile = null;
  function openGalleryModal(fn) {
    galleryModalFile = fn;
    var preview = $('galleryModalPreview');
    preview.src = imgUrl('gallery', fn);
    preview.onerror = function () { preview.onerror = null; preview.src = placeholderUrl(); };
    openModal('modalGallery');
  }

  // ===================== CONTACT =====================
  function renderContact() {
    var c = state.contact || {};
    $('ctNumber').value = c.number || '';
    $('ctMail').value = c.mail || '';
    $('ctAddress').value = c.address || '';
    $('ctMapUrl').value = c.mapUrl || '';
    $('ctMapIframe').value = c.mapIframe || '';
  }
  function bindContact() {
    [['ctNumber', 'number'], ['ctMail', 'mail'], ['ctAddress', 'address'], ['ctMapUrl', 'mapUrl'], ['ctMapIframe', 'mapIframe']]
      .forEach(function (pair) {
        $(pair[0]).addEventListener('input', function () { state.contact[pair[1]] = $(pair[0]).value; markDirty(); });
      });
  }

  // ---- Generički form helperi (dvojezična polja) ----
  function textField(labelText, lang, value, onInput) {
    var f = el('div', { class: 'field' });
    f.appendChild(el('label', {}, [el('span', { class: 'lang-badge' + (lang === 'en' ? ' en' : ''), text: lang.toUpperCase() }), document.createTextNode(labelText)]));
    var input = el('input', { type: 'text', value: value || '' });
    input.addEventListener('input', function () { onInput(input.value); });
    f.appendChild(input);
    return f;
  }
  function textareaField(labelText, lang, value, onInput) {
    var f = el('div', { class: 'field' });
    f.appendChild(el('label', {}, [el('span', { class: 'lang-badge' + (lang === 'en' ? ' en' : ''), text: lang.toUpperCase() }), document.createTextNode(labelText)]));
    var ta = el('textarea', { rows: '4' });
    ta.value = value || '';
    ta.addEventListener('input', function () { onInput(ta.value); });
    f.appendChild(ta);
    return f;
  }
  function numField(labelText, value, onInput) {
    var f = el('div', { class: 'field' });
    f.appendChild(el('label', { text: labelText }));
    var input = el('input', { type: 'number', min: '0', step: '0.01', value: (value === null || value === undefined) ? '' : value });
    input.addEventListener('input', function () { onInput(input.value === '' ? null : input.value); });
    f.appendChild(input);
    return f;
  }

  // ===================== CONFIG (postavke cjenika) =====================
  function loadConfig() {
    return api('/api/config').then(function (cfg) {
      var pl = cfg.priceList || {};
      var hr = pl.hr || {}, en = pl.en || {};
      var hrItem = hr.item || {}, enItem = en.item || {};
      $('cfgCurrency').value = pl.currency || '';
      $('cfgHrFileName').value = hr.fileName || '';
      $('cfgHrTitle').value = hr.title || '';
      $('cfgHrItemName').value = hrItem.name || '';
      $('cfgHrItemPrice').value = hrItem.price || '';
      $('cfgHrItemOnRequest').value = hrItem.priceOnRequest || '';
      $('cfgHrItemAnchor').value = hrItem.anchorPrice || '';
      $('cfgHrFooter').value = hr.footer || '';
      $('cfgEnFileName').value = en.fileName || '';
      $('cfgEnTitle').value = en.title || '';
      $('cfgEnItemName').value = enItem.name || '';
      $('cfgEnItemPrice').value = enItem.price || '';
      $('cfgEnItemOnRequest').value = enItem.priceOnRequest || '';
      $('cfgEnItemAnchor').value = enItem.anchorPrice || '';
      $('cfgEnFooter').value = en.footer || '';
    }).catch(function (e) {
      setStatus('Greška pri čitanju postavki: ' + e.message, 'err');
    });
  }

  function bindConfigDirty() {
    document.querySelectorAll('#configForm input, #configForm textarea').forEach(function (inp) {
      inp.addEventListener('input', markDirty);
    });
  }

  function saveConfigData() {
    var payload = {
      priceList: {
        currency: $('cfgCurrency').value.trim(),
        hr: {
          fileName: $('cfgHrFileName').value.trim(),
          title: $('cfgHrTitle').value.trim(),
          footer: $('cfgHrFooter').value,
          item: {
            name: $('cfgHrItemName').value.trim(),
            price: $('cfgHrItemPrice').value.trim(),
            priceOnRequest: $('cfgHrItemOnRequest').value.trim(),
            anchorPrice: $('cfgHrItemAnchor').value.trim(),
          },
        },
        en: {
          fileName: $('cfgEnFileName').value.trim(),
          title: $('cfgEnTitle').value.trim(),
          footer: $('cfgEnFooter').value,
          item: {
            name: $('cfgEnItemName').value.trim(),
            price: $('cfgEnItemPrice').value.trim(),
            priceOnRequest: $('cfgEnItemOnRequest').value.trim(),
            anchorPrice: $('cfgEnItemAnchor').value.trim(),
          },
        },
      },
    };
    return api('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  // ===================== Učitavanje / Spremanje / Build =====================
  function load() {
    return api('/api/data').then(function (data) {
      state.contact = data.contact || state.contact;
      state.products = data.products || [];
      state.services = data.services || [];
      state.about = data.about || [];
      renderProducts();
      renderServices();
      renderAbout();
      renderContact();
      renderGallery();
    }).catch(function (e) {
      setStatus('Greška: ' + e.message, 'err');
    });
  }

  function save() {
    setStatus('Spremam…', '');
    return Promise.all([
      api('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact: state.contact,
          products: state.products,
          services: state.services,
          about: state.about,
        }),
      }),
      saveConfigData(),
    ]).then(function () {
      dirty = false;
      setStatus('Spremljeno ✓', 'ok');
    }).catch(function (e) {
      setStatus('Greška pri spremanju: ' + e.message, 'err');
      throw e;
    });
  }

  function build() {
    setStatus('Generiram… (ovo može potrajati zbog slika)', '');
    return save().then(function () {
      return api('/api/build', { method: 'POST' });
    }).then(function () {
      setStatus('Web generiran ✓ — otvaram pregled', 'ok');
      openPreview();
    }).catch(function (e) {
      setStatus('Greška: ' + e.message, 'err');
    });
  }

  function openPreview() {
    window.open('/preview/?t=' + Date.now(), '_blank', 'noopener');
  }

  function previewOrBuild() {
    api('/api/status').then(function (s) {
      if (s.built) openPreview();
      else { setStatus('Web još nije generiran — generiram prvi put…', ''); build(); }
    }).catch(function () { openPreview(); });
  }

  // ===================== Publish (git) =====================
  function publish() {
    if (dirty) {
      if (!confirm('Imaš nespremljene promjene. Spremi i objavi?')) return;
    }
    if (!confirm('Objaviti promjene na web (git push)? Ovo generira web i šalje promjene na server.')) return;
    setStatus('Objavljujem… (build + git)', '');
    var btn = $('btnPublish');
    if (btn) btn.disabled = true;
    save().then(function () {
      return api('/api/publish', { method: 'POST' });
    }).then(function (res) {
      setStatus('Objavljeno ✓ ' + (res.pushed ? '(push uspješan)' : ''), 'ok');
      if (res.log) console.log('PUBLISH LOG:\n' + res.log);
      alert('Objava uspješna!\n\n' + (res.log || '').slice(-1500));
    }).catch(function (e) {
      setStatus('Greška pri objavi: ' + e.message, 'err');
      alert('Objava NIJE uspjela:\n\n' + e.message + '\n\nProvjeri terminal/git stanje.');
    }).finally(function () {
      if (btn) btn.disabled = false;
    });
  }

  // ===================== Excel export/import =====================
  function exportXlsx() {
    var a = document.createElement('a');
    a.href = '/api/export-xlsx?t=' + Date.now();
    a.download = 'data.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setStatus('Izvezeno u data.xlsx ✓', 'ok');
  }

  function importXlsx(file) {
    if (!file) return;
    if (!confirm('Uvoz će ZAMIJENITI sve postojeće podatke (sadnice, usluge, o nama, kontakt) iz Excela. Nastaviti?')) return;
    setStatus('Uvozim Excel…', '');
    var reader = new FileReader();
    reader.onload = function () {
      var result = String(reader.result || '');
      var base64 = result.indexOf(',') >= 0 ? result.slice(result.indexOf(',') + 1) : result;
      api('/api/import-xlsx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataBase64: base64 }),
      }).then(function (res) {
        var d = res.data || {};
        state.contact = d.contact || state.contact;
        state.products = d.products || [];
        state.services = d.services || [];
        state.about = d.about || [];
        markDirty();
        renderProducts();
        renderServices();
        renderAbout();
        renderContact();
        setStatus('Uvezeno: ' + (res.count ? (res.count.products + ' sadnica, ' + res.count.services + ' usluga, ' + res.count.about + ' o-nama') : '') + ' ✓ — spremi da potvrdiš', 'ok');
      }).catch(function (e) {
        setStatus('Greška pri uvozu: ' + e.message, 'err');
      });
    };
    reader.onerror = function () { setStatus('Greška pri čitanju datoteke.', 'err'); };
    reader.readAsDataURL(file);
  }

  // ===================== Bindings =====================
  function bind() {
    // Tabovi
    document.querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () {
        document.querySelectorAll('.tab').forEach(function (x) { x.classList.remove('active'); });
        document.querySelectorAll('.tab-panel').forEach(function (x) { x.classList.remove('active'); });
        t.classList.add('active');
        $('tab-' + t.getAttribute('data-tab')).classList.add('active');
      });
    });

    // Header akcije
    $('btnSave').addEventListener('click', function () { save(); });
    $('btnBuild').addEventListener('click', function () { build(); });
    $('btnPreview').addEventListener('click', function () { previewOrBuild(); });
    var pubBtn = $('btnPublish');
    if (pubBtn) pubBtn.addEventListener('click', function () { publish(); });

    // Dodavanje stavki
    $('btnAddProduct').addEventListener('click', function () {
      state.products.push({ hr_name: '', name: '', hr_description: '', description: '', price: null, anchorPrice: null, imageDir: '', __expand: true });
      markDirty();
      renderProducts();
      window.scrollTo(0, document.body.scrollHeight);
    });
    $('btnAddService').addEventListener('click', function () {
      state.services.push({ hr_name: '', name: '', hr_description: '', description: '', imageName: '', __expand: true });
      markDirty();
      renderServices();
      window.scrollTo(0, document.body.scrollHeight);
    });
    $('btnAddAbout').addEventListener('click', function () {
      state.about.push({ hr_title: '', title: '', hr_description: '', description: '', imageName: '', __expand: true });
      markDirty();
      renderAbout();
      window.scrollTo(0, document.body.scrollHeight);
    });

    // Galerija upload (više slika)
    $('galleryUploadFile').addEventListener('change', function () {
      var files = Array.prototype.slice.call(this.files || []);
      var self = this;
      if (!files.length) return;
      setStatus('Učitavam slike u galeriju…', '');
      var chain = Promise.resolve();
      files.forEach(function (f) { chain = chain.then(function () { return uploadFile('gallery', '', f); }); });
      chain.then(function () { self.value = ''; renderGallery(); setStatus('Slike dodane u galeriju ✓', 'ok'); })
        .catch(function (err) { setStatus('Upload greška: ' + err.message, 'err'); });
    });

    // Galerija modal: brisanje
    $('galleryModalDelete').addEventListener('click', function () {
      if (!galleryModalFile) return;
      if (!confirm('Obrisati sliku "' + galleryModalFile + '"?')) return;
      api('/api/delete-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: 'gallery', filename: galleryModalFile }),
      }).then(function () { closeModal($('modalGallery')); renderGallery(); setStatus('Slika obrisana ✓', 'ok'); })
        .catch(function (err) { setStatus('Greška: ' + err.message, 'err'); });
    });

    // Image modal: upload nove slike
    $('imageModalFile').addEventListener('change', function () {
      var f = this.files[0];
      var self = this;
      if (!f || !imageUploadCtx) return;
      setStatus('Učitavam sliku…', '');
      uploadFile(imageUploadCtx.section, imageUploadCtx.dir, f).then(function (fn) {
        setStatus('Slika učitana ✓', 'ok');
        $('imageModalPreview').src = imgUrl(imageUploadCtx.section, fn, imageUploadCtx.dir);
        if (imageOnDone) imageOnDone(fn);
        self.value = '';
        closeModal($('modalImage'));
      }).catch(function (err) { setStatus('Upload greška: ' + err.message, 'err'); });
    });

    // Excel
    $('btnExportXlsx').addEventListener('click', function () { exportXlsx(); });
    $('importXlsxFile').addEventListener('change', function () { importXlsx(this.files[0]); this.value = ''; });

    // Kontakt + config dirty
    bindContact();
    bindConfigDirty();

    // Zatvaranje modala
    document.querySelectorAll('.modal-overlay').forEach(function (ov) {
      ov.addEventListener('click', function (e) { if (e.target === ov) closeModal(ov); });
      ov.querySelectorAll('[data-close]').forEach(function (btn) {
        btn.addEventListener('click', function () { closeModal(ov); });
      });
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && activeModal) closeModal(activeModal); });

    window.addEventListener('beforeunload', function (e) {
      if (dirty) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  // ---- Init ----
  bind();
  load();
  loadConfig();
})();
