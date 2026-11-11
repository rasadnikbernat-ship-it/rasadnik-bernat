/* Rasadnik Bernat editor — klijentska logika. Vanilla JS. */
(function () {
  'use strict';

  // Stanje u memoriji; spremanje šalje cijeli objekt na server.
  var state = {
    contact: { number: '', mail: '', address: '', mapUrl: '', mapIframe: '', social: [] },
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
  var uidCounter = 0;
  // Poveži <label> s poljem (klik na naziv fokusira polje; čitač ekrana čita naziv).
  function linkLabel(label, input) {
    if (!input.id) input.id = 'f' + (++uidCounter);
    label.htmlFor = input.id;
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
  var editRev = 0; // raste sa svakom izmjenom; save() zna je li se nešto promijenilo dok je spremao
  function markDirty() { dirty = true; editRev++; setStatus('Nespremljene promjene', ''); }

  // Collapsible kartica: head je klikabilan (toggle), body se skriva/prikazuje.
  // 'subtitle' je opcionalni sažetak koji se vidi u collapsed stanju (npr. cijena/slika).
  // Vraća { card, head, body, title, subtitle, setExpanded }.
  function makeCollapsibleCard(titleText, actionNodes, startExpanded) {
    var chevron = el('span', { class: 'chevron', text: '▸', 'aria-hidden': 'true' });
    var title = el('span', { class: 'card-title', text: titleText });
    var subtitle = el('span', { class: 'card-subtitle' });
    var actions = el('div', { class: 'card-head-actions' }, actionNodes || []);
    // Lijeva (klikabilna) strana headera: chevron + naslov + sažetak.
    // Tipkovnica: Tab do naslova, Enter/razmak otvara/zatvara (role=button + aria-expanded).
    var bodyId = 'cb' + (++uidCounter);
    var headLeft = el('div', { class: 'card-head-left', role: 'button', tabindex: '0', 'aria-controls': bodyId }, [chevron, title, subtitle]);
    var head = el('div', { class: 'card-head' }, [headLeft, actions]);
    var body = el('div', { class: 'card-body', id: bodyId });
    var card = el('div', { class: 'card' + (startExpanded ? '' : ' collapsed') }, [head, body]);

    function setExpanded(on) {
      if (on) card.classList.remove('collapsed');
      else card.classList.add('collapsed');
      chevron.textContent = on ? '▾' : '▸';
      headLeft.setAttribute('aria-expanded', on ? 'true' : 'false');
    }
    setExpanded(!!startExpanded);

    // Klik na lijevi dio headera toggla. Klik na akcije (desno) se ne propagira.
    headLeft.addEventListener('click', function () {
      setExpanded(card.classList.contains('collapsed'));
    });
    headLeft.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(card.classList.contains('collapsed')); }
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

  // Folderi slika koji već postoje na disku (images/products). Dohvaća se unaprijed jer se izbornik
  // datoteka mora otvoriti odmah u kliku (bez čekanja mreže).
  var knownProductDirs = [];
  function refreshProductDirs() {
    return api('/api/product-dirs').then(function (r) { knownProductDirs = r.dirs || []; }).catch(function () {});
  }
  // Jedinstveni folder za proizvod: ne smije ga koristiti drugi proizvod ni postojati na disku
  // (folder obrisanog proizvoda inače bi "naslijedio" novi proizvod istog naziva).
  function uniqueProductDir(p, slug) {
    var used = {};
    state.products.forEach(function (o) { if (o !== p && o.imageDir) used[o.imageDir] = true; });
    knownProductDirs.forEach(function (d) { used[d] = true; });
    if (!used[slug]) return slug;
    for (var i = 2; i < 1000; i++) { if (!used[slug + '_' + i]) return slug + '_' + i; }
    return slug + '_' + Date.now();
  }

  // ---- Modal (image preview + promjena) ----
  var activeModal = null;
  var modalReturnFocus = null;
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  function focusablesIn(m) {
    // Vidljivi elementi (ne unutar [hidden] i ne display:none).
    return Array.prototype.filter.call(m.querySelectorAll(FOCUSABLE), function (x) {
      if (x.closest('[hidden]')) return false;
      var cs = window.getComputedStyle(x);
      return cs.display !== 'none' && cs.visibility !== 'hidden';
    });
  }
  function openModal(id) {
    var m = $(id);
    if (!m) return;
    // Zapamti gdje je bio fokus i premjesti ga u dijalog.
    modalReturnFocus = document.activeElement;
    m.hidden = false;
    activeModal = m;
    var f = focusablesIn(m).filter(function (x) { return !x.classList.contains('modal-close'); });
    var target = f[0] || focusablesIn(m)[0];
    if (target) setTimeout(function () { try { target.focus(); } catch (e) {} }, 0);
  }
  // Tab ostaje unutar otvorenog dijaloga.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab' || !activeModal) return;
    var f = focusablesIn(activeModal);
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || !activeModal.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !activeModal.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  });
  function closeModal(m) {
    m = m || activeModal;
    if (!m) return;
    m.hidden = true;
    if (m === activeModal && modalReturnFocus && document.contains(modalReturnFocus)) {
      try { modalReturnFocus.focus(); } catch (e) {}
    }
    var gv = $('galleryModalVideo');
    if (gv && !gv.paused) gv.pause();   // zaustavi video kad se modal zatvori
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

  // ---- Sidrena cijena (anchor) ----
  // Formatira sidreni iznos za prikaz (npr. 75 -> "75,00"). Prazno -> ''.
  function formatAnchor(v) {
    if (v === null || v === undefined || String(v).trim() === '') return '';
    var n = Number(String(v).replace(',', '.'));
    if (!isNaN(n)) return n.toLocaleString('hr-HR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return String(v);
  }

  // Modal za promjenu sidrene cijene jednog proizvoda. onDone() re-renderira prikaz.
  var anchorTarget = null;
  var anchorOnDone = null;
  function openAnchorModal(product, onDone) {
    anchorTarget = product;
    anchorOnDone = onDone;
    var input = $('anchorPriceInput');
    input.value = (product.anchorPrice === null || product.anchorPrice === undefined) ? '' : product.anchorPrice;
    openModal('modalAnchor');
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

  // SVG kantica (vidljiva na zelenoj podlozi, za razliku od emoji-ja).
  var TRASH_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';

  // SVG ikona "rasprodano" (košarica prekrižena).
  var SOLD_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6"/><path d="M3 3l18 18"/></svg>';

  function renderProductCard(p, idx, startExpanded) {
    var delBtn = el('button', { class: 'row-del', type: 'button', title: 'Obriši sadnicu' });
    delBtn.innerHTML = TRASH_SVG;
    delBtn.addEventListener('click', function () {
      if (!confirm('Obrisati sadnicu "' + (p.hr_name || p.name || '') + '"?')) return;
      state.products.splice(idx, 1);
      markDirty();
      renderProducts();
    });

    // Brzi prekidač "rasprodano" u zaglavlju kartice (sinkroniziran s potvrdnim okvirom u tijelu).
    var soldBtn = el('button', { class: 'row-sold', type: 'button' });
    soldBtn.innerHTML = SOLD_SVG;
    var soldInput = null;
    function syncSold() {
      var on = p.soldOut === true;
      soldBtn.classList.toggle('on', on);
      soldBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      soldBtn.title = on ? 'Rasprodano — klikni za poništiti' : 'Označi kao rasprodano';
      if (soldInput) soldInput.checked = on;
    }
    soldBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      p.soldOut = !(p.soldOut === true);
      syncSold();
      markDirty();
    });

    var c = makeCollapsibleCard(p.hr_name || p.name || '(nova sadnica)', [soldBtn, delBtn], startExpanded);
    function syncSummary() {
      c.title.textContent = p.hr_name || p.name || '(nova sadnica)';
      var price = (p.price === null || p.price === undefined || String(p.price).trim() === '') ? 'na upit' : (p.price + ' €');
      c.subtitle.textContent = price;
      // Osvježi prikaz predloženog foldera dok imageDir još nije fiksiran uploadom.
      if (imgBlockSyncDir) imgBlockSyncDir();
    }

    // Lijevo: slike (galerija foldera) + imageDir
    var imgBlockSyncDir = null;
    var imgBlock = renderProductImages(p, function (fn) { imgBlockSyncDir = fn; });
    syncSummary();

    // Desno: dvojezična polja + cijene
    var fields = el('div', {});
    fields.appendChild(textField('Naziv (HR)', 'hr', p.hr_name, function (v) { p.hr_name = v; syncSummary(); markDirty(); }));
    fields.appendChild(textField('Name (EN)', 'en', p.name, function (v) { p.name = v; syncSummary(); markDirty(); }));
    fields.appendChild(textareaField('Opis (HR)', 'hr', p.hr_description, function (v) { p.hr_description = v; markDirty(); }));
    fields.appendChild(textareaField('Description (EN)', 'en', p.description, function (v) { p.description = v; markDirty(); }));

    // Cijena + sidrena cijena (logika kao marinWeb, ispravljeno za inline tipkanje):
    //  - Redovna cijena je obični input.
    //  - Sidrena se NE uređuje inline: prikazuje se kao zaključano dugme; klik otvara modal.
    //  - Dok sidrena NIJE ručno postavljena (kroz modal), ona PRATI redovnu cijenu
    //    na svaku promjenu (pa tipkanje "1","5" -> sidrena ide 1 pa 15, ne zaključa se rano).
    //  - Zaključava se (anchorLocked=true, sprema se u data.json) kad se postavi kroz modal ILI kad se
    //    proizvod spremi s cijenom. Nakon toga promjena cijene NE mijenja sidrenu (referenca na datum).
    //  - Brisanje u modalu otključava: sidrena opet prati cijenu do sljedećeg spremanja.
    // Stari data.json bez polja: zaključana čim postoji.
    if (typeof p.anchorLocked !== 'boolean') {
      var aEmpty = (p.anchorPrice === null || p.anchorPrice === undefined || String(p.anchorPrice).trim() === '');
      p.anchorLocked = !aEmpty;
    }

    var anchorView = el('button', { class: 'anchor-view', type: 'button', title: 'Klikni za promjenu sidrene cijene' });
    function renderAnchorView() {
      var v = (p.anchorPrice === null || p.anchorPrice === undefined || String(p.anchorPrice).trim() === '')
        ? '—' : formatAnchor(p.anchorPrice);
      anchorView.textContent = v;
    }
    renderAnchorView();
    anchorView.addEventListener('click', function () {
      openAnchorModal(p, renderAnchorView);   // modal (anchorForm) sam upravlja anchorLocked
    });

    var priceField = numField('Cijena (€)', p.price, function (v) {
      p.price = v;
      // Dok sidrena nije ručno postavljena, prati cijenu (uvijek, na svaku znamenku).
      if (!p.anchorLocked) {
        p.anchorPrice = (v === '' || v === null) ? null : v;
        renderAnchorView();
      }
      syncSummary();
      markDirty();
    });

    var anchorLab = el('label', { text: 'Sidrena cijena (€)' });
    linkLabel(anchorLab, anchorView);
    var anchorWrap = el('div', { class: 'field' }, [anchorLab, anchorView]);
    var priceRow = el('div', { class: 'price-row' }, [priceField, anchorWrap]);
    fields.appendChild(priceRow);

    // Rasprodano: na kartici sadnice na webu prikaže overlay preko slike.
    soldInput = el('input', { type: 'checkbox' });
    soldInput.addEventListener('change', function () { p.soldOut = soldInput.checked; syncSold(); markDirty(); });
    syncSold();
    fields.appendChild(el('div', { class: 'field' }, [
      el('label', { class: 'sold-out-toggle' }, [soldInput, document.createTextNode(' Rasprodano')]),
    ]));

    c.body.appendChild(el('div', { class: 'card-body-grid' }, [imgBlock, fields]));
    return c.card;
  }

  // Blok slika proizvoda: automatski folder (imageDir) + mreža thumbova + dodavanje.
  // imageDir se NE unosi ručno — izvodi se iz naziva (slug) i zapisuje pri uploadu.
  function renderProductImages(p, onNameSync) {
    var wrap = el('div', { class: 'img-block' });

    // Info o folderu (read-only). Prikaz trenutnog ili predloženog naziva foldera.
    var dirInfo = el('div', { class: 'img-dir-info' });
    function currentDir() {
      // Postojeći imageDir ima prednost; inače predloži (jedinstveni) slug iz naziva.
      var slug = slugify(p.hr_name || p.name || '');
      return p.imageDir || (slug ? uniqueProductDir(p, slug) : '');
    }
    function renderDirInfo() {
      var d = currentDir();
      dirInfo.textContent = d ? ('📁 ' + d) : '📁 (folder se kreira iz naziva sadnice)';
    }
    renderDirInfo();
    wrap.appendChild(dirInfo);

    var thumbs = el('div', { class: 'img-thumbs' });
    wrap.appendChild(thumbs);

    // Redoslijed: p.imageOrder (prva = naslovna na kartici); nove slike idu na kraj.
    function sortImages(names, order) {
      order = Array.isArray(order) ? order : [];
      function rank(f) { var i = order.indexOf(f); return i === -1 ? Infinity : i; }
      return names.slice().sort(function (a, b) {
        var ra = rank(a), rb = rank(b);
        if (ra !== rb) return ra === Infinity ? 1 : rb === Infinity ? -1 : ra - rb;
        return a < b ? -1 : a > b ? 1 : 0;
      });
    }
    function saveOrder(names) { p.imageOrder = names.slice(); markDirty(); }

    function renderCells(dir, names) {
      thumbs.innerHTML = '';
      var dragFrom = null;
      names.forEach(function (fn, i) {
        var cell = thumbCell('products', dir, fn, loadThumbs);
        cell.draggable = true;
        cell.dataset.idx = String(i);
        if (i === 0 && names.length > 1) {
          cell.classList.add('is-cover');
          cell.appendChild(el('span', { class: 'cover-badge', title: 'Naslovna slika (prikazuje se na kartici)', text: '★' }));
        } else if (i > 0) {
          var star = el('button', { class: 'thumb-cover', type: 'button', title: 'Postavi kao naslovnu', text: '★' });
          star.addEventListener('click', function (e) {
            e.stopPropagation();
            var next = names.slice(); next.splice(i, 1); next.unshift(fn);
            saveOrder(next); renderCells(dir, next);
          });
          cell.appendChild(star);
        }
        cell.addEventListener('dragstart', function (e) {
          dragFrom = i; cell.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
          try { e.dataTransfer.setData('text/plain', fn); } catch (x) {}
        });
        cell.addEventListener('dragend', function () { cell.classList.remove('dragging'); });
        cell.addEventListener('dragover', function (e) { e.preventDefault(); cell.classList.add('drag-over'); });
        cell.addEventListener('dragleave', function () { cell.classList.remove('drag-over'); });
        cell.addEventListener('drop', function (e) {
          e.preventDefault(); cell.classList.remove('drag-over');
          if (dragFrom === null || dragFrom === i) return;
          var next = names.slice(); var tmp = next[dragFrom]; next[dragFrom] = next[i]; next[i] = tmp; // zamjena mjesta
          saveOrder(next); renderCells(dir, next);
        });
        thumbs.appendChild(cell);
      });
      if (names.length > 1) thumbs.appendChild(el('div', { class: 'img-order-hint', text: 'Povuci slike za promjenu redoslijeda. Prva je naslovna na kartici.' }));
      thumbs.appendChild(addImageBtn());
    }

    function loadThumbs() {
      thumbs.innerHTML = '';
      var dir = p.imageDir; // učitavamo samo iz stvarno postavljenog foldera
      if (!dir) {
        thumbs.appendChild(addImageBtn());
        return;
      }
      api('/api/images?section=products&dir=' + encodeURIComponent(dir)).then(function (res) {
        var names = sortImages(res.images || [], p.imageOrder);
        renderCells(dir, names);
      }).catch(function () {
        thumbs.innerHTML = '';
        thumbs.appendChild(addImageBtn());
      });
    }

    // "+" gumb koji pri prvom uploadu automatski postavi imageDir iz naziva.
    function addImageBtn() {
      var input = el('input', { type: 'file', accept: 'image/*', multiple: 'multiple', style: 'display:none;' });
      var btn = el('button', { type: 'button', class: 'img-thumb img-thumb-add', title: 'Dodaj sliku', 'aria-label': 'Dodaj sliku', text: '+' });
      btn.addEventListener('click', function () {
        // Ako folder još ne postoji, izvedi ga iz naziva sadnice.
        if (!p.imageDir) {
          var slug = slugify(p.hr_name || p.name || '');
          if (!slug) { setStatus('Prvo upiši naziv sadnice (iz njega se kreira folder slika).', 'err'); return; }
          p.imageDir = uniqueProductDir(p, slug);
          knownProductDirs.push(p.imageDir);
          renderDirInfo();
          markDirty();
        }
        input.click();
      });
      input.addEventListener('change', function () {
        var files = Array.prototype.slice.call(input.files || []);
        if (!files.length) return;
        setStatus('Učitavam slike…', '');
        var chain = Promise.resolve();
        files.forEach(function (f) {
          chain = chain.then(function () { return uploadFile('products', p.imageDir, f); });
        });
        chain.then(function () { input.value = ''; loadThumbs(); setStatus('Slike učitane ✓', 'ok'); })
          .catch(function (err) { setStatus('Upload greška: ' + err.message, 'err'); });
      });
      return el('span', {}, [btn, input]);
    }

    // Javi roditelju callback za osvježavanje info-prikaza (kad se promijeni naziv).
    if (typeof onNameSync === 'function') onNameSync(renderDirInfo);

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
    var delBtn = el('button', { class: 'row-del', type: 'button', title: 'Obriši uslugu' });
    delBtn.innerHTML = TRASH_SVG;
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
    }, {
      deletable: true,
      defaultImage: '/img/service-default/usluga-placeholder.svg',
      defaultNote: 'Zadana slika — prikazuje se na webu dok ne dodaš svoju.',
      // Datoteka se briše s diska samo ako je ne koristi druga usluga.
      usedElsewhere: function (fn) {
        return state.services.some(function (o) { return o !== s && o.imageName === fn; });
      },
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
    var delBtn = el('button', { class: 'row-del', type: 'button', title: 'Obriši sekciju' });
    delBtn.innerHTML = TRASH_SVG;
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
    }, {
      deletable: true,
      defaultImage: '/img/about-default/o-nama-placeholder.svg',
      defaultNote: 'Zadana slika — prikazuje se na webu dok ne dodaš svoju.',
      // Datoteka se briše s diska samo ako je ne koristi druga sekcija.
      usedElsewhere: function (fn) {
        return state.about.some(function (o) { return o !== a && o.imageName === fn; });
      },
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
  function singleImageBlock(section, dir, current, onPick, opts) {
    opts = opts || {};
    var wrap = el('div', { class: 'img-block' });
    var box = el('div', { class: 'img-single', title: 'Klikni za pregled / promjenu slike' });
    var emptySrc = opts.defaultImage || placeholderUrl();
    var img = el('img', { src: current ? imgUrl(section, current, dir) : emptySrc, alt: current || '' });
    img.onerror = function () { img.onerror = null; img.src = placeholderUrl(); };
    box.appendChild(img);
    // Napomena da se prikazuje zadana slika (samo kad je zadana slika definirana i vlastite nema).
    var note = opts.defaultImage ? el('div', { class: 'img-default-note', text: opts.defaultNote || 'Zadana slika.' }) : null;
    function syncNote() { if (note) note.hidden = !!current; }
    box.addEventListener('click', function () {
      openImageModal(section, dir, current, function (fn) {
        current = fn;
        img.src = imgUrl(section, fn, dir);
        if (onPick) onPick(fn);
        syncDel(); syncNote();
      });
    });
    wrap.appendChild(box);
    if (note) { wrap.appendChild(note); syncNote(); }

    // Gumb za brisanje slike (ako je uključen): makne sliku s kartice i obriše datoteku.
    var delBtn = null;
    function syncDel() { if (delBtn) delBtn.hidden = !current; }
    if (opts.deletable) {
      delBtn = el('button', { class: 'img-single-del', type: 'button', title: 'Obriši sliku', text: '✕ Obriši sliku' });
      delBtn.addEventListener('click', function () {
        if (!current) return;
        var fn = current;
        if (!confirm('Obrisati sliku "' + fn + '"? Na webu će se prikazati opći placeholder.')) return;
        var shared = opts.usedElsewhere && opts.usedElsewhere(fn);
        var done = function () {
          current = '';
          img.src = emptySrc;
          if (onPick) onPick('');
          syncDel(); syncNote();
          setStatus('Slika obrisana ✓', 'ok');
        };
        if (shared) { done(); return; }
        api('/api/delete-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ section: section, imageDir: dir, filename: fn }),
        }).then(done).catch(function (err) { setStatus('Greška: ' + err.message, 'err'); });
      });
      wrap.appendChild(delBtn);
      syncDel();
    }
    return wrap;
  }

  // ===================== GALLERY =====================
  var galleryItems = [];   // [{ name, type: 'image' | 'video' }] u redoslijedu prikaza
  var VIDEO_RE = /\.(mp4|webm)$/i;

  var galleryReq = 0;
  function renderGallery() {
    var req = ++galleryReq;
    Promise.all([
      api('/api/images?section=gallery'),
      api('/api/images?section=gallery-videos').catch(function () { return { images: [] }; }),
    ]).then(function (r) {
      var items = (r[0].images || []).map(function (n) { return { name: n, type: 'image' }; })
        .concat((r[1].images || []).map(function (n) { return { name: n, type: 'video' }; }));
      if (req !== galleryReq) return; // stigao je noviji zahtjev — ovaj (stariji) odgovor se zanemaruje
      galleryItems = sortItemsByOrder(items, siteCfg && siteCfg.galleryOrder);
      drawGallery();
    }).catch(function (e) { setStatus('Greška pri učitavanju galerije: ' + e.message, 'err'); });
  }

  // Slike i videi u istom redoslijedu; neuvršteni zadržavaju slijed (slike pa videi) na kraju.
  function sortItemsByOrder(items, order) {
    order = Array.isArray(order) ? order : [];
    function rank(it) { var i = order.indexOf(it.name); return i === -1 ? Infinity : i; }
    return items.map(function (it, idx) { return { it: it, idx: idx }; }).sort(function (a, b) {
      var ra = rank(a.it), rb = rank(b.it);
      if (ra !== rb) return ra === Infinity ? 1 : rb === Infinity ? -1 : ra - rb;
      return a.idx - b.idx;
    }).map(function (x) { return x.it; });
  }

  function deleteGalleryItem(it) {
    return api('/api/delete-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section: it.type === 'video' ? 'gallery-videos' : 'gallery', filename: it.name }),
    });
  }

  function drawGallery() {
    var grid = $('galleryGrid');
    grid.innerHTML = '';
    var items = galleryItems;
    if (!items.length) {
      grid.appendChild(el('div', { class: 'gallery-empty', text: 'Nema slika ni videa u galeriji. Klikni "+ Dodaj slike / videe".' }));
      return;
    }
    if (items.length > 1) grid.appendChild(el('div', { class: 'gallery-hint', text: 'Povuci stavku na drugu da zamijene mjesta. Redoslijed ovdje je redoslijed na webu (spremi za primjenu).' }));
    var dragFrom = null;
    items.forEach(function (it, i) {
      var fn = it.name;
      var media;
      if (it.type === 'video') {
        media = el('video', { src: '/img/gallery-videos/' + encodeURIComponent(fn) + '#t=0.1', preload: 'metadata', muted: 'muted', playsinline: 'playsinline', title: fn });
        media.muted = true;
      } else {
        media = el('img', { src: imgUrl('gallery', fn), alt: fn, title: fn });
        media.onerror = function () { media.onerror = null; media.src = placeholderUrl(); };
      }
      var del = el('button', { class: 'cell-del', type: 'button', title: 'Obriši', text: '✕' });
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!confirm('Obrisati ' + (it.type === 'video' ? 'video' : 'sliku') + ' "' + fn + '"?')) return;
        deleteGalleryItem(it).then(function () { renderGallery(); setStatus('Obrisano ✓', 'ok'); })
          .catch(function (err) { setStatus('Greška: ' + err.message, 'err'); });
      });
      var num = el('span', { class: 'cell-num', text: String(i + 1) });
      var kids = [media, del, num];
      if (it.type === 'video') kids.push(el('span', { class: 'cell-play', text: '▶' }));
      var cell = el('div', { class: 'gallery-cell' }, kids);
      cell.draggable = true;
      cell.addEventListener('click', function () { openGalleryModal(it); });
      cell.addEventListener('dragstart', function (e) {
        dragFrom = i; cell.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', fn); } catch (x) {}
      });
      cell.addEventListener('dragend', function () { cell.classList.remove('dragging'); });
      cell.addEventListener('dragover', function (e) { e.preventDefault(); cell.classList.add('drag-over'); });
      cell.addEventListener('dragleave', function () { cell.classList.remove('drag-over'); });
      cell.addEventListener('drop', function (e) {
        e.preventDefault(); cell.classList.remove('drag-over');
        if (dragFrom === null || dragFrom === i) return;
        var next = galleryItems.slice();
        var tmp = next[dragFrom]; next[dragFrom] = next[i]; next[i] = tmp; // zamjena mjesta
        galleryItems = next;
        if (siteCfg) { siteCfg.galleryOrder = next.map(function (x) { return x.name; }); markDirty(); }
        drawGallery();
      });
      grid.appendChild(cell);
    });
  }

  // Upload videa: sirovi bajtovi (bez base64) uz prikaz napretka.
  function uploadVideo(file, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload-video?filename=' + encodeURIComponent(file.name));
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.upload.onprogress = function (e) { if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100)); };
      xhr.onload = function () {
        var body = {};
        try { body = JSON.parse(xhr.responseText); } catch (x) {}
        if (xhr.status >= 200 && xhr.status < 300) resolve(body.filename);
        else reject(new Error(body.error || ('HTTP ' + xhr.status)));
      };
      xhr.onerror = function () { reject(new Error('Mrežna greška pri prijenosu videa.')); };
      xhr.send(file);
    });
  }

  var galleryModalItem = null;
  function openGalleryModal(it) {
    galleryModalItem = it;
    var preview = $('galleryModalPreview');
    var video = $('galleryModalVideo');
    video.pause();
    if (it.type === 'video') {
      preview.hidden = true;
      video.hidden = false;
      video.src = '/img/gallery-videos/' + encodeURIComponent(it.name);
    } else {
      video.hidden = true;
      video.removeAttribute('src');
      preview.hidden = false;
      preview.src = imgUrl('gallery', it.name);
      preview.onerror = function () { preview.onerror = null; preview.src = placeholderUrl(); };
    }
    $('modalGalleryTitle').textContent = (it.type === 'video' ? 'Pregled videa — ' : 'Pregled slike — ') + it.name;
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
    renderSocialList();
  }

  // Društvene mreže (isti popis tipova kao generator/contact/social.js -> SOCIAL_TYPES).
  var SOCIAL_TYPES = [
    ['facebook', 'Facebook'], ['instagram', 'Instagram'], ['linkedin', 'LinkedIn'], ['youtube', 'YouTube'],
    ['tiktok', 'TikTok'], ['x', 'X (Twitter)'], ['whatsapp', 'WhatsApp'], ['pinterest', 'Pinterest'],
  ];
  var MAX_SOCIAL = 10;
  function validSocialUrl(u) { return /^https?:\/\/[^\s"'<>]+$/i.test(String(u || '').trim()); }
  function renderSocialList() {
    if (!Array.isArray(state.contact.social)) state.contact.social = [];
    var list = state.contact.social;
    var box = $('ctSocialList');
    box.innerHTML = '';
    if (!list.length) box.appendChild(el('p', { class: 'hint', text: 'Nema poveznica — redak "Pratite nas" se neće prikazati.' }));
    list.forEach(function (it, i) {
      var sel = el('select', { 'aria-label': 'Mreža' });
      SOCIAL_TYPES.forEach(function (t) {
        var o = el('option', { value: t[0], text: t[1] });
        if (t[0] === it.type) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', function () { it.type = sel.value; markDirty(); });
      var url = el('input', { type: 'url', value: it.url || '', placeholder: 'https://...', 'aria-label': 'Poveznica' });
      var warn = el('span', { class: 'social-warn', text: '' });
      function check() {
        var ok = !url.value.trim() || validSocialUrl(url.value);
        warn.textContent = ok ? (url.value.trim() ? '' : 'Prazno — neće se prikazati') : 'Mora početi s https:// (ili http://)';
        url.classList.toggle('invalid', !ok);
      }
      url.addEventListener('input', function () { it.url = url.value.trim(); check(); markDirty(); });
      // "www.facebook.com/x" -> "https://www.facebook.com/x" (bez sheme se poveznica ne bi prikazala).
      url.addEventListener('blur', function () {
        var v = url.value.trim();
        if (v && !/^[a-z][a-z0-9+.-]*:/i.test(v) && /^[^\s/]+\.[^\s]+$/.test(v)) {
          url.value = 'https://' + v; it.url = url.value; check(); markDirty();
        }
      });
      check();
      function move(d) {
        var j = i + d; if (j < 0 || j >= list.length) return;
        var tmp = list[i]; list[i] = list[j]; list[j] = tmp; markDirty(); renderSocialList();
      }
      var up = el('button', { type: 'button', class: 'btn btn-small', title: 'Gore', text: '↑' });
      var down = el('button', { type: 'button', class: 'btn btn-small', title: 'Dolje', text: '↓' });
      var del = el('button', { type: 'button', class: 'btn btn-small btn-danger', title: 'Ukloni', text: '✕' });
      up.disabled = i === 0; down.disabled = i === list.length - 1;
      up.addEventListener('click', function () { move(-1); });
      down.addEventListener('click', function () { move(1); });
      del.addEventListener('click', function () { list.splice(i, 1); markDirty(); renderSocialList(); });
      box.appendChild(el('div', { class: 'social-row' }, [sel, url, up, down, del, warn]));
    });
    $('ctSocialAdd').disabled = list.length >= MAX_SOCIAL;
  }
  function bindContact() {
    [['ctNumber', 'number'], ['ctMail', 'mail'], ['ctAddress', 'address'], ['ctMapUrl', 'mapUrl'], ['ctMapIframe', 'mapIframe']]
      .forEach(function (pair) {
        $(pair[0]).addEventListener('input', function () { state.contact[pair[1]] = $(pair[0]).value; markDirty(); });
      });
    $('ctSocialAdd').addEventListener('click', function () {
      if (!Array.isArray(state.contact.social)) state.contact.social = [];
      if (state.contact.social.length >= MAX_SOCIAL) return;
      var used = state.contact.social.map(function (x) { return x.type; });
      var free = SOCIAL_TYPES.filter(function (t) { return used.indexOf(t[0]) === -1; })[0] || SOCIAL_TYPES[0];
      state.contact.social.push({ type: free[0], url: '' });
      markDirty();
      renderSocialList();
    });
  }

  // ---- Generički form helperi (dvojezična polja) ----
  function textField(labelText, lang, value, onInput) {
    var f = el('div', { class: 'field' });
    var lab = el('label', {}, [el('span', { class: 'lang-badge' + (lang === 'en' ? ' en' : ''), text: lang.toUpperCase() }), document.createTextNode(labelText)]);
    f.appendChild(lab);
    var input = el('input', { type: 'text', value: value || '' });
    linkLabel(lab, input);
    input.addEventListener('input', function () { onInput(input.value); });
    f.appendChild(input);
    return f;
  }
  function textareaField(labelText, lang, value, onInput) {
    var f = el('div', { class: 'field' });
    var lab = el('label', {}, [el('span', { class: 'lang-badge' + (lang === 'en' ? ' en' : ''), text: lang.toUpperCase() }), document.createTextNode(labelText)]);
    f.appendChild(lab);
    var ta = el('textarea', { rows: '4' });
    linkLabel(lab, ta);
    ta.value = value || '';
    ta.addEventListener('input', function () { onInput(ta.value); });
    f.appendChild(ta);
    return f;
  }
  function numField(labelText, value, onInput) {
    var f = el('div', { class: 'field' });
    var lab = el('label', { text: labelText });
    f.appendChild(lab);
    var input = el('input', { type: 'number', min: '0', step: '0.01', value: (value === null || value === undefined) ? '' : value });
    linkLabel(lab, input);
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

  // ---- Zadane slike (Postavke) ----
  var DEFAULT_IMAGE_GROUPS = [
    { title: 'Logo, ikona i naslovna slika', kinds: [
      { kind: 'logo', label: 'Logo', note: 'Prikazuje se u izborniku i na PDF cjeniku (png ili jpg).' },
      { kind: 'favicon', label: 'Ikona stranice (favicon)', note: 'Mala ikona u kartici preglednika (ico ili png, najbolje kvadratna).' },
      { kind: 'banner', label: 'Naslovna slika (banner)', note: 'Velika slika iza naslova na vrhu stranice (jpg, png ili webp).' },
    ] },
    { title: 'Zadane slike (kad stavka nema vlastitu)', kinds: [
      { kind: 'services', label: 'Usluge' },
      { kind: 'about', label: 'O nama' },
      { kind: 'products', label: 'Sadnice (kad nemaju niti jednu sliku)' },
    ] },
  ];
  var DEFAULT_IMAGE_KINDS = DEFAULT_IMAGE_GROUPS.reduce(function (a, g) {
    return a.concat(g.kinds.map(function (k) { return { kind: k.kind, label: k.label, note: k.note, preview: '/img/default/' + k.kind, group: g.title, first: k === g.kinds[0] }; }));
  }, []);

  function renderDefaultImages() {
    var box = $('defaultImagesBox');
    if (!box) return;
    box.innerHTML = '';
    api('/api/config').then(function (cfg) {
      var custom = cfg.defaultImages || {};
      DEFAULT_IMAGE_KINDS.forEach(function (k) {
        if (k.first) box.appendChild(el('h3', { class: 'default-group-title', text: k.group }));
        var img = el('img', { class: 'default-img-preview' + (k.kind === 'favicon' ? ' is-icon' : ''), alt: k.label, src: k.preview + '?t=' + Date.now() });
        var isCustom = !!custom[k.kind];
        var note = el('div', { class: 'img-default-note', text: isCustom ? 'Vlastita zadana slika.' : 'Izvorna (ugrađena) slika.' });
        var input = el('input', { type: 'file', accept: 'image/*', style: 'display:none;' });
        var change = el('button', { type: 'button', class: 'btn btn-primary btn-small', text: 'Promijeni sliku' });
        change.addEventListener('click', function () { input.click(); });
        input.addEventListener('change', function () {
          var f = input.files && input.files[0];
          if (!f) return;
          var reader = new FileReader();
          reader.onload = function () {
            api('/api/default-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ kind: k.kind, filename: f.name, dataBase64: reader.result }),
            }).then(function () { setStatus('Zadana slika spremljena ✓ (generiraj web za objavu)', 'ok'); renderDefaultImages(); })
              .catch(function (err) { setStatus('Greška: ' + err.message, 'err'); });
          };
          reader.readAsDataURL(f);
        });
        var reset = el('button', { type: 'button', class: 'btn btn-small btn-outline', text: 'Vrati izvornu' });
        reset.disabled = !isCustom;
        reset.addEventListener('click', function () {
          api('/api/default-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: k.kind, reset: true }),
          }).then(function () { setStatus('Vraćena izvorna slika ✓', 'ok'); renderDefaultImages(); })
            .catch(function (err) { setStatus('Greška: ' + err.message, 'err'); });
        });
        box.appendChild(el('div', { class: 'default-img-row' }, [
          img,
          el('div', { class: 'default-img-info' }, [
            el('strong', { text: k.label }), k.note ? el('div', { class: 'hint', text: k.note }) : null, note,
            el('div', { class: 'default-img-actions' }, [change, reset, input]),
          ]),
        ]));
      });
      renderSiteBanner();
    }).catch(function (e) { setStatus('Greška pri čitanju postavki: ' + e.message, 'err'); });
  }

  // ---- Izgled (boje + font) ----
  var themeState = null;   // { colors: {key: '#rrggbb'}, font: 'id' } — null dok se ne učita
  var themeMeta = null;
  var themeBaseline = null; // zapamćena početna verzija { colors, font }
  var themePreviewRefresh = null;

  function hexToRgb(h) {
    var n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function luminance(h) {
    var c = hexToRgb(h).map(function (v) {
      v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) {
    var la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  function renderTheme() {
    var box = $('themeBox');
    if (!box) return Promise.resolve();
    return Promise.all([api('/api/theme-meta'), api('/api/config')]).then(function (r) {
      themeMeta = r[0];
      var t = r[1].theme || {};
      themeState = { colors: Object.assign({}, t.colors || {}), font: t.font || 'default' };
      // Prvi put: trenutno spremljeno stanje postaje "prva verzija" i trajno se zapamti u config.json.
      if (r[1].themeBaseline === undefined) {
        themeBaseline = { colors: Object.assign({}, t.colors || {}), font: t.font || 'default' };
        saveThemeBaseline(themeBaseline).catch(function () {});
      } else {
        var b = r[1].themeBaseline || {};
        themeBaseline = { colors: Object.assign({}, b.colors || {}), font: b.font || 'default' };
      }
      buildThemeUi(box);
    }).catch(function (e) { setStatus('Greška pri učitavanju izgleda: ' + e.message, 'err'); });
  }

  function saveThemeBaseline(b) {
    return api('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ themeBaseline: b }),
    });
  }
  function cloneTheme(t) { return { colors: Object.assign({}, t.colors || {}), font: t.font || 'default' }; }
  function sameTheme(a, b) {
    var ka = Object.keys(a.colors || {}), kb = Object.keys(b.colors || {});
    if (a.font !== b.font || ka.length !== kb.length) return false;
    return ka.every(function (k) { return (a.colors[k] || '') === (b.colors[k] || ''); });
  }

  function themeMetaColor(key) {
    return themeMeta.colors.filter(function (c) { return c.key === key; })[0];
  }
  // Odabrana boja; inače zadana koja može pratiti drugu boju (defFrom).
  function themeColor(key) {
    var m = themeMetaColor(key);
    if (themeState.colors[key]) return themeState.colors[key].toLowerCase();
    return m.defFrom ? themeColor(m.defFrom) : m.def.toLowerCase();
  }

  function buildThemeUi(box) {
    box.innerHTML = '';
    // @font-face za pregled fonta u editoru (iz /fonts/).
    var faceCss = '';
    themeMeta.fonts.filter(function (f) { return f.web; }).forEach(function (f) {
      ['latin-ext', 'latin'].forEach(function (sub) {
        [400, 700].forEach(function (w) {
          faceCss += '@font-face{font-family:"' + f.family + '";font-weight:' + w + ';font-display:swap;src:url("/fonts/' + f.id + '-' + sub + '-' + w + '.woff2") format("woff2");unicode-range:' + themeMeta.ranges[sub] + ';}\n';
        });
      });
    });
    var styleEl = el('style', {}); styleEl.textContent = faceCss;
    box.appendChild(styleEl);

    var left = el('div', { class: 'theme-controls' });
    var right = el('div', { class: 'theme-preview-wrap' });
    var warn = el('div', { class: 'theme-warn', hidden: 'hidden' });

    var rows = {};
    function refreshRows() {
      Object.keys(rows).forEach(function (k) { rows[k].refresh(); });
    }
    var groupBox = null, groupName = null, groupIdx = 0;
    themeMeta.colors.forEach(function (m) {
      if (m.group !== groupName) {
        groupName = m.group;
        groupBox = el('details', { class: 'theme-group-details' }, [el('summary', { text: m.group })]);
        if (groupIdx < 2) groupBox.open = true;
        groupIdx++;
        left.appendChild(groupBox);
      }
      var color = el('input', { type: 'color', class: 'theme-color', value: themeColor(m.key) });
      var hex = el('input', { type: 'text', class: 'theme-hex', maxlength: '7', value: themeColor(m.key), spellcheck: 'false' });
      var reset = el('button', { type: 'button', class: 'theme-reset', text: '↺' });
      var follow = m.defFrom ? el('span', { class: 'theme-follow' }) : null;
      function refresh() {
        var explicit = !!themeState.colors[m.key];
        var v = themeColor(m.key);
        color.value = v;
        if (document.activeElement !== hex) hex.value = v;
        reset.style.visibility = explicit ? 'visible' : 'hidden';
        reset.title = m.defFrom ? 'Vrati da prati: ' + themeMetaColor(m.defFrom).label : 'Vrati zadanu (' + m.def + ')';
        if (follow) follow.textContent = explicit ? '' : '↳ prati: ' + themeMetaColor(m.defFrom).label;
      }
      function set(v) {
        v = String(v).trim().toLowerCase();
        if (!/^#[0-9a-f]{6}$/.test(v)) return;
        // Boje koje prate drugu boju čuvaju se čim ih korisnik odabere; ostale samo ako se razlikuju od zadane.
        if (!m.defFrom && v === m.def.toLowerCase()) delete themeState.colors[m.key]; else themeState.colors[m.key] = v;
        markDirty(); refreshRows(); applyPreview();
      }
      color.addEventListener('input', function () { set(color.value); });
      hex.addEventListener('input', function () { if (/^#[0-9a-fA-F]{6}$/.test(hex.value.trim())) set(hex.value); });
      hex.addEventListener('blur', function () { hex.value = themeColor(m.key); });
      reset.addEventListener('click', function () {
        delete themeState.colors[m.key];
        markDirty(); refreshRows(); applyPreview();
      });
      rows[m.key] = { refresh: refresh };
      refresh();
      groupBox.appendChild(el('div', { class: 'theme-row' }, [
        color,
        el('div', { class: 'theme-row-label' }, [el('strong', { text: m.label }), m.hint ? el('span', { class: 'hint', text: m.hint }) : null, follow]),
        hex, reset,
      ]));
    });

    // Font
    var sel = el('select', { class: 'theme-font' });
    themeMeta.fonts.forEach(function (f) {
      var o = el('option', { value: f.id, text: f.label });
      if (f.id === themeState.font) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { themeState.font = sel.value; markDirty(); applyPreview(); });
    left.insertBefore(el('div', { class: 'theme-row theme-row-font' }, [
      el('div', { class: 'theme-row-label' }, [el('strong', { text: 'Font' }), el('span', { class: 'hint', text: 'Hrvatska slova (č, ć, š, ž, đ) podržana su u svim fontovima.' })]),
      sel,
    ]), left.firstChild);

    // Pregled uživo
    var preview = el('div', { class: 'tp' }, []);
    preview.innerHTML =
      '<div class="tp-nav"><strong>Rasadnik Bernat</strong><span>Sadnice</span><span>Usluge</span><span class="tp-link">O nama</span></div>' +
      '<div class="tp-hero"><strong>STVARAJMO ZAJEDNO</strong><div class="tp-hero-btns"></div></div>' +
      '<div class="tp-secs"></div>' +
      '<div class="tp-footer">© 2026 RasadnikBernat.</div>' +
      '<div class="tp-cookie">Poruka o kolačićima <span class="tp-btn tp-btn-1">OK</span></div>';
    var secsBox = preview.querySelector('.tp-secs');

    // Sekcije u pregledu prate Sekcije tab: redoslijed, skrivene i teme (automatski par/nepar).
    function renderPreviewSections() {
      secsBox.innerHTML = '';
      if (!siteMeta || !siteCfg) return;
      var S = siteCfg.sections;
      var labels = {};
      siteMeta.sectionDefs.forEach(function (d) { labels[d.id] = d.label; });
      var vis = S.order.filter(function (id) { return S.hidden.indexOf(id) === -1; });
      // Gumbi na naslovnici u pregledu (prema postavkama u tabu Naslovnica i tekstovi).
      var hb = preview.querySelector('.tp-hero-btns');
      hb.innerHTML = '';
      (siteCfg.bannerButtons || []).forEach(function (b) {
        if (b.type === 'section' && S.hidden.indexOf(b.section) !== -1) return;
        var txt = b.hr || (b.type === 'section' ? (labels[b.section] || b.section) : (b.url || 'Gumb'));
        var cls = { primary: 'tp-btn-1', secondary: 'tp-btn-2', tertiary: 'tp-btn-3' }[b.style] || 'tp-btn-1';
        hb.appendChild(el('span', { class: 'tp-btn ' + cls, text: txt }));
        hb.appendChild(document.createTextNode(' '));
      });
      vis.forEach(function (id, i) {
        var th = (S.themes && S.themes[id]) || (i % 2 === 0 ? 't1' : 't2');
        var sec = el('div', { class: 'tp-sec tp-sec-' + th });
        sec.innerHTML = '<div class="tp-sec-head"><strong class="tp-h">' + (labels[id] || id) + '</strong><span class="tp-badge">Tema ' + th.charAt(1) + '</span></div>' +
          '<p>Obični tekst i <span class="tp-a">poveznica</span>. Čćšžđ 0123.</p>';
        if (i === 0) {
          sec.innerHTML += '<div class="tp-card"><div class="tp-img"><span class="tp-sold">RASPRODANO</span></div>' +
            '<div class="tp-card-body"><h4>Hrast lužnjak</h4><p>5,00 €</p><span class="tp-btn tp-btn-3">Opširnije</span></div></div>';
        }
        secsBox.appendChild(sec);
      });
    }
    themePreviewRefresh = renderPreviewSections;
    renderPreviewSections();
    right.appendChild(el('h3', { class: 'theme-preview-title', text: 'Pregled' }));
    right.appendChild(preview);
    right.appendChild(warn);

    function applyPreview() {
      var rb = $('themeRestoreBaseline'); if (rb && themeBaseline) rb.disabled = sameTheme(themeState, themeBaseline);
      themeMeta.colors.forEach(function (m) { preview.style.setProperty(m.cssVar, themeColor(m.key)); });
      var f = themeMeta.fonts.filter(function (x) { return x.id === themeState.font; })[0];
      preview.style.fontFamily = (f && f.stack) ? f.stack : '';
      var rad = { none: '0px', small: '3px', 'default': '6px', large: '14px', round: '22px' }[(siteCfg && siteCfg.layout.radius) || 'default'];
      preview.style.setProperty('--tp-radius', rad);
      var cw = { xsmall: '40%', small: '47%', normal: '55%', large: '62%' }[(siteCfg && siteCfg.layout.cardSize) || 'normal'] || '55%';
      preview.style.setProperty('--tp-card-w', cw);
      preview.classList.toggle('no-hover', !!(siteCfg && siteCfg.layout.cardHover === false));
      // Provjera kontrasta (WCAG: tekst ≥ 4.5:1).
      var pairs = [
        ['tertiary', '#ffffff', 'Tekst na bijeloj pozadini'],
        ['tertiary', 'quaternary', 'Tekst na pozadini navigacije'],
        ['tertiary2', 'quaternary', 'Linkovi na pozadini navigacije'],
        ['white', 'primary', 'Svijetli tekst na glavnoj boji'],
        ['white', 'primary2', 'Svijetli tekst na glavnoj boji (hover)'],
        ['white', 'secondary', 'Svijetli tekst na sekundarnoj boji'],
        ['white', 'secondary2', 'Svijetli tekst na sekundarnoj boji (hover)'],
        ['white', 'soldOut', 'Tekst "Rasprodano" na svojoj pločici'],
        ['cookieText', 'cookieBg', 'Tekst na traci kolačića'],
        ['navText', 'navBg', 'Tekst izbornika'],
        ['navHover', 'navBg', 'Izbornik na hover'],
        ['footerText', 'footerBg', 'Tekst podnožja'],
        ['btn1Text', 'btn1Bg', 'Tekst glavnog gumba'],
        ['btn1Text', 'btn1Hover', 'Tekst glavnog gumba (hover)'],
        ['btn2Text', 'btn2Bg', 'Tekst sekundarnog gumba'],
        ['btn2Text', 'btn2Hover', 'Tekst sekundarnog gumba (hover)'],
        ['btn3Text', 'btn3Bg', 'Tekst gumba na kartici'],
        ['btn3Text', 'btn3Hover', 'Tekst gumba na kartici (hover)'],
        ['t1Text', 't1Bg', 'Tema 1: tekst'],
        ['t1Heading', 't1Bg', 'Tema 1: naslovi'],
        ['t1Link', 't1Bg', 'Tema 1: poveznice'],
        ['t2Text', 't2Bg', 'Tema 2: tekst'],
        ['t2Heading', 't2Bg', 'Tema 2: naslovi'],
        ['t2Link', 't2Bg', 'Tema 2: poveznice'],
        ['cardText', 'cardBg', 'Tekst na kartici sadnice'],
      ];
      var bad = [];
      pairs.forEach(function (p) {
        var fg = p[0].charAt(0) === '#' ? p[0] : themeColor(p[0]);
        var bg = p[1].charAt(0) === '#' ? p[1] : themeColor(p[1]);
        var r = contrast(fg, bg);
        if (r < 4.5) bad.push(p[2] + ' — kontrast ' + r.toFixed(1) + ':1');
      });
      if (bad.length) {
        warn.hidden = false;
        warn.innerHTML = '';
        warn.appendChild(el('strong', { text: '⚠ Slab kontrast (preporuka je barem 4,5:1):' }));
        var ul = el('ul', {});
        bad.forEach(function (b) { ul.appendChild(el('li', { text: b })); });
        warn.appendChild(ul);
      } else {
        warn.hidden = true;
      }
    }
    applyPreview();

    $('themeResetAll').onclick = function () {
      themeState = { colors: {}, font: 'default' };
      markDirty();
      buildThemeUi(box);
    };
    var restoreBtn = $('themeRestoreBaseline');
    restoreBtn.disabled = sameTheme(themeState, themeBaseline);
    restoreBtn.onclick = function () {
      themeState = cloneTheme(themeBaseline);
      markDirty();
      buildThemeUi(box);
      setStatus('Vraćena početna verzija izgleda (spremi za primjenu).', 'ok');
    };
    $('themeSetBaseline').onclick = function () {
      if (!confirm('Trenutni izgled postaje nova početna verzija (na koju se možeš vratiti). Nastaviti?')) return;
      var snap = cloneTheme(themeState);
      saveThemeBaseline(snap).then(function () {
        themeBaseline = snap;
        restoreBtn.disabled = true;
        setStatus('Početna verzija zapamćena ✓', 'ok');
      }).catch(function (err) { setStatus('Greška: ' + err.message, 'err'); });
    };
    buildLayoutControls(left, applyPreview);
    box.appendChild(left);
    box.appendChild(right);
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
    if (themeState) payload.theme = themeState;   // samo ako je učitan (inače se tema ne dira)
    return api('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  // ===================== Učitavanje / Spremanje / Build =====================
  // Sortira listu tako da su najnovije (veći createdAt) gore. Stavke bez
  // createdAt (stari zapisi) zadržavaju svoj originalni međusobni redoslijed
  // i idu ISPOD onih s createdAt. Stabilno (ne premješta jednake).
  function sortByCreated(arr) {
    return arr
      .map(function (item, i) { return { item: item, i: i }; })
      .sort(function (a, b) {
        var ca = (a.item.createdAt === null || a.item.createdAt === undefined) ? null : Number(a.item.createdAt);
        var cb = (b.item.createdAt === null || b.item.createdAt === undefined) ? null : Number(b.item.createdAt);
        if (ca !== null && cb !== null) return cb - ca;       // oba imaju -> noviji gore
        if (ca !== null) return -1;                           // samo a ima -> a gore
        if (cb !== null) return 1;                            // samo b ima -> b gore
        return a.i - b.i;                                     // nijedan -> zadrži redoslijed
      })
      .map(function (x) { return x.item; });
  }

  function load() {
    // Prvo popis foldera (za prikaz predloženog jedinstvenog foldera kod novih sadnica).
    return refreshProductDirs().then(function () { return api('/api/data'); }).then(function (data) {
      state.contact = data.contact || state.contact;
      state.products = sortByCreated(data.products || []);
      state.services = sortByCreated(data.services || []);
      state.about = sortByCreated(data.about || []);
      renderProducts();
      renderServices();
      renderAbout();
      renderContact();
      renderGallery();
    }).catch(function (e) {
      setStatus('Greška: ' + e.message, 'err');
    });
  }

  var saving = null;
  function save() {
    // Dvoklik / Spremi + Generiraj istodobno -> isto spremanje (inače utrka pri pisanju config.json).
    if (saving) return saving;
    var revAtStart = editRev;
    setStatus('Spremam…', '');
    saving = Promise.all([
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
    ]).then(function () {
      // Server je zaključao sidrene cijene spremljenih proizvoda -> isto i u editoru (bez reloada).
      function empty(v) { return v === null || v === undefined || String(v).trim() === ''; }
      var filled = false;
      state.products.forEach(function (p) {
        if (empty(p.anchorPrice) && !empty(p.price)) { p.anchorPrice = p.price; filled = true; } // isto kao server
        if (!empty(p.anchorPrice)) p.anchorLocked = true;
      });
      if (filled) renderProducts(); // osvježi prikaz sidrene samo kad se nešto popunilo
      // config.json pišu tri spremanja -> redom (izbjegava utrku čitaj-izmijeni-piši).
      return saveConfigData();
    }).then(function () {
      return saveSiteData();
    }).then(function () {
      // Izmjene napravljene tijekom spremanja ostaju označene kao nespremljene.
      dirty = editRev !== revAtStart;
      setStatus(dirty ? 'Nespremljene promjene' : 'Spremljeno ✓', dirty ? '' : 'ok');
    }).catch(function (e) {
      setStatus('Greška pri spremanju: ' + e.message, 'err');
      throw e;
    }).finally(function () {
      saving = null;
    });
    return saving;
  }

  // Animirani "radi se" indikator (točkice se vrte) — vraća stop funkciju.
  function startSpinner(baseMsg) {
    var dots = 0;
    setStatus(baseMsg, '');
    var timer = setInterval(function () {
      dots = (dots + 1) % 4;
      setStatus(baseMsg + ' ' + Array(dots + 1).join('•'), '');
    }, 400);
    return function stop() { clearInterval(timer); };
  }

  function build() {
    var btn = $('btnBuild');
    if (btn) { btn.disabled = true; btn.classList.add('busy'); }
    var stop = startSpinner('Spremam i generiram web…');
    return save().then(function () {
      return api('/api/build', { method: 'POST' });
    }).then(function () {
      stop();
      setStatus('Web generiran ✓ — otvaram pregled', 'ok');
      openPreview();
    }).catch(function (e) {
      stop();
      setStatus('Greška: ' + e.message, 'err');
    }).finally(function () {
      if (btn) { btn.disabled = false; btn.classList.remove('busy'); }
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

  // ===================== Odbaci neobjavljene promjene (git) =====================
  function discardChanges() {
    var btn = $('btnDiscard');
    if (btn) btn.disabled = true;
    api('/api/git-changes').then(function (r) {
      var files = r.files || [];
      if (!files.length && !dirty) { alert('Nema neobjavljenih promjena.'); return null; }
      var list = files.slice(0, 15).map(function (f) { return ' ' + f.status + '  ' + f.path; }).join('\n');
      if (files.length > 15) list += '\n … i još ' + (files.length - 15) + ' datoteka';
      var msg = 'ODBACITI sve neobjavljene promjene?\n\n' + (list || '(samo nespremljene izmjene u editoru)') +
        '\n\nOvo je NEPOVRATNO: datoteke se vraćaju na zadnje objavljeno stanje, a nove datoteke se brišu.';
      if (!confirm(msg)) return null;
      return api('/api/discard', { method: 'POST' }).then(function () {
        dirty = false;
        location.reload();
      });
    }).catch(function (e) {
      setStatus('Greška pri odbacivanju: ' + e.message, 'err');
      alert('Odbacivanje NIJE uspjelo:\n\n' + e.message);
    }).finally(function () {
      if (btn) btn.disabled = false;
    });
  }

  // ===================== Excel export/import =====================
  function exportXlsx() {
    // Excel se radi iz spremljenog data.json -> prvo spremi nespremljene izmjene.
    if (dirty) {
      if (!confirm('Imaš nespremljene promjene. Spremiti ih prije izvoza u Excel?')) return;
      save().then(exportXlsxNow).catch(function () {});
      return;
    }
    exportXlsxNow();
  }
  function exportXlsxNow() {
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
        state.products = sortByCreated(d.products || []);
        state.services = sortByCreated(d.services || []);
        state.about = sortByCreated(d.about || []);
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
    // Podtabovi u Postavkama (Cjenik / Zadane slike).
    document.querySelectorAll('.subtab').forEach(function (t) {
      t.addEventListener('click', function () {
        document.querySelectorAll('.subtab').forEach(function (x) { x.classList.remove('active'); });
        document.querySelectorAll('.subpanel').forEach(function (x) { x.classList.remove('active'); });
        t.classList.add('active');
        $('sub-' + t.getAttribute('data-subtab')).classList.add('active');
        if (t.getAttribute('data-subtab') === 'theme' && themePreviewRefresh) themePreviewRefresh();
      });
    });
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
    var discBtn = $('btnDiscard');
    if (discBtn) discBtn.addEventListener('click', function () { discardChanges(); });

    // Dodavanje stavki
    $('btnAddProduct').addEventListener('click', function () {
      state.products.unshift({ hr_name: '', name: '', hr_description: '', description: '', price: null, anchorPrice: null, imageDir: '', imageOrder: [], soldOut: false, createdAt: Date.now(), __expand: true });
      markDirty();
      renderProducts();
      window.scrollTo(0, 0);
    });
    $('btnAddService').addEventListener('click', function () {
      state.services.unshift({ hr_name: '', name: '', hr_description: '', description: '', imageName: '', createdAt: Date.now(), __expand: true });
      markDirty();
      renderServices();
      window.scrollTo(0, 0);
    });
    $('btnAddAbout').addEventListener('click', function () {
      state.about.unshift({ hr_title: '', title: '', hr_description: '', description: '', imageName: '', createdAt: Date.now(), __expand: true });
      markDirty();
      renderAbout();
      window.scrollTo(0, 0);
    });

    // Galerija upload (slike i videi)
    $('galleryUploadFile').addEventListener('change', function () {
      var files = Array.prototype.slice.call(this.files || []);
      var self = this;
      if (!files.length) return;

      // Upozorenja prije prijenosa: nepodržani formati i preveliki videi.
      var warnings = [];
      files = files.filter(function (f) {
        var looksVideo = /^video\//.test(f.type) || /\.(mov|avi|mkv|m4v|wmv|3gp|flv|mpg|mpeg)$/i.test(f.name);
        if (looksVideo && !VIDEO_RE.test(f.name)) {
          warnings.push('• ' + f.name + ' — format nije podržan (samo mp4 i webm).');
          return false;
        }
        if (VIDEO_RE.test(f.name)) {
          var mb = f.size / (1024 * 1024);
          if (mb > 100) {
            if (!confirm('Video "' + f.name + '" ima ' + Math.round(mb) + ' MB. GitHub odbija datoteke veće od 100 MB, pa se web neće moći objaviti s njim. Svejedno ga dodati?')) return false;
          } else if (mb > 50) {
            if (!confirm('Video "' + f.name + '" ima ' + Math.round(mb) + ' MB. Veliki videi usporavaju stranicu i povećavaju repozitorij. Dodati ga svejedno?')) return false;
          }
        }
        return true;
      });
      if (warnings.length) {
        alert('Neke datoteke nisu dodane:\n\n' + warnings.join('\n') +
          '\n\nPretvori ih u mp4 (H.264) pa ih dodaj ponovno, npr. besplatnim programom HandBrake (handbrake.fr) ili online na cloudconvert.com. ' +
          'Videe s mobitela (.mov) najlakše je izvesti kao "Najkompatibilnije" / mp4.');
      }
      if (!files.length) { self.value = ''; return; }
      var chain = Promise.resolve();
      files.forEach(function (f, n) {
        chain = chain.then(function () {
          var isVideo = VIDEO_RE.test(f.name) || /^video\//.test(f.type);
          var label = (n + 1) + '/' + files.length + ' ' + f.name;
          if (isVideo) {
            return uploadVideo(f, function (p) { setStatus('Učitavam video ' + label + ' — ' + p + '%', ''); });
          }
          setStatus('Učitavam ' + label + '…', '');
          return uploadFile('gallery', '', f);
        });
      });
      chain.then(function () { self.value = ''; renderGallery(); setStatus('Dodano u galeriju ✓', 'ok'); })
        .catch(function (err) { self.value = ''; renderGallery(); setStatus('Upload greška: ' + err.message, 'err'); });
    });

    // Galerija modal: brisanje
    $('galleryModalDelete').addEventListener('click', function () {
      var it = galleryModalItem;
      if (!it) return;
      if (!confirm('Obrisati ' + (it.type === 'video' ? 'video' : 'sliku') + ' "' + it.name + '"?')) return;
      deleteGalleryItem(it).then(function () {
        try { $('galleryModalVideo').pause(); } catch (x) {}
        closeModal($('modalGallery')); renderGallery(); setStatus('Obrisano ✓', 'ok');
      }).catch(function (err) { setStatus('Greška: ' + err.message, 'err'); });
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

    // Sidrena cijena (modal): spremi vrijednost u ciljani proizvod.
    // Unesena vrijednost -> zaključaj (manual). Prazno -> vrati na "prati cijenu".
    $('anchorForm').addEventListener('submit', function (e) {
      e.preventDefault();
      if (anchorTarget) {
        var v = $('anchorPriceInput').value.trim();
        if (v === '') {
          // Prazno -> otključaj: sidrena opet prati redovnu cijenu.
          anchorTarget.anchorLocked = false;
          anchorTarget.anchorPrice = (anchorTarget.price === '' || anchorTarget.price === null || anchorTarget.price === undefined)
            ? null : anchorTarget.price;
        } else {
          anchorTarget.anchorLocked = true;   // ručno postavljeno -> zaključaj
          anchorTarget.anchorPrice = v;
        }
        markDirty();
        if (anchorOnDone) anchorOnDone();
      }
      closeModal($('modalAnchor'));
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

  // ===================== POSTAVKE WEBA (config.json -> site) =====================
  var siteCfg = null;    // { texts, layout, sections, meta, galleryOrder } — null dok se ne učita
  var siteMeta = null;   // popisi polja, zadane vrijednosti, opcije

  function loadSite() {
    return api('/api/site').then(function (r) {
      siteMeta = r;
      siteCfg = r.site;
      siteCfg.texts = siteCfg.texts || {};
    }).catch(function (e) { setStatus('Greška pri čitanju postavki weba: ' + e.message, 'err'); });
  }

  function saveSiteData() {
    if (!siteCfg) return Promise.resolve();   // nije učitano -> ne diraj
    return api('/api/site', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site: siteCfg }),
    });
  }

  var LAYOUT_LABELS = {
    bannerHeight: { low: 'Niski', medium: 'Srednji', tall: 'Visoki (zadano)', full: 'Cijeli ekran' },
    radius: { none: 'Oštri rubovi', small: 'Blago zaobljeni', 'default': 'Zadano', large: 'Jako zaobljeni', round: 'Posve zaobljeni' },
    fontSize: { small: 'Manji', normal: 'Zadano', large: 'Veći', xlarge: 'Najveći' },
    columns: { 2: '2 (velike kartice)', 3: '3', 4: '4 (zadano)', 5: '5', 6: '6 (male kartice)' },
    mobileColumns: { 1: '1 (cijela širina)', 2: '2 (zadano)' },
    cardSize: { xsmall: 'Mala', small: 'Manja', normal: 'Zadano', large: 'Veća (na širokim ekranima)' },
    imageRatio: { portrait: 'Uspravna 4:5 (zadano)', square: 'Kvadrat 1:1', landscape: 'Položena 4:3' },
  };

  function selectField(labelText, hintText, options, labelsMap, value, onChange) {
    var sel = el('select', {});
    options.forEach(function (o) {
      var opt = el('option', { value: String(o), text: (labelsMap && labelsMap[o]) || String(o) });
      if (String(o) === String(value)) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', function () { onChange(sel.value); });
    var lab = el('label', { class: 'theme-row-label' }, [el('strong', { text: labelText }), hintText ? el('span', { class: 'hint', text: hintText }) : null]);
    linkLabel(lab, sel);
    return el('div', { class: 'theme-row theme-row-font' }, [lab, sel]);
  }

  function checkField(labelText, hintText, checked, onChange) {
    var cb = el('input', { type: 'checkbox' });
    cb.checked = !!checked;
    cb.addEventListener('change', function () { onChange(cb.checked); });
    return el('label', { class: 'theme-row' }, [
      cb,
      el('div', { class: 'theme-row-label' }, [el('strong', { text: labelText }), hintText ? el('span', { class: 'hint', text: hintText }) : null]),
    ]);
  }

  // Dvojezično tekstualno polje za site.texts[lang][key]. Prazno = zadani tekst.
  function siteTextRow(f) {
    var row = el('div', { class: 'site-text-row' }, [el('div', { class: 'site-text-label', text: f.label })]);
    var cols = el('div', { class: 'site-text-cols' });
    ['hr', 'en'].forEach(function (lang) {
      var def = (siteMeta.textDefaults[lang] || {})[f.key] || '';
      var cur = (siteCfg.texts[lang] || {})[f.key];
      var input = f.multiline ? el('textarea', { rows: '3' }) : el('input', { type: 'text' });
      input.value = (cur !== undefined && cur !== '') ? cur : def;
      input.placeholder = def;
      input.addEventListener('input', function () {
        var v = input.value;
        siteCfg.texts[lang] = siteCfg.texts[lang] || {};
        if (v.trim() === '' || v === def) delete siteCfg.texts[lang][f.key]; else siteCfg.texts[lang][f.key] = v;
        markDirty();
      });
      var lab = el('label', {}, [el('span', { class: 'lang-badge' + (lang === 'en' ? ' en' : ''), text: lang.toUpperCase() })]);
      linkLabel(lab, input);
      input.setAttribute('aria-label', f.label + ' (' + lang.toUpperCase() + ')');
      cols.appendChild(el('div', { class: 'field' }, [lab, input]));
    });
    row.appendChild(cols);
    return row;
  }

  function renderSiteTexts(boxId, groups) {
    var box = $(boxId);
    if (!box || !siteMeta) return;
    box.innerHTML = '';
    groups.forEach(function (g) {
      var fields = siteMeta.textFields.filter(function (f) { return f.group === g; });
      if (!fields.length) return;
      var fs = el('fieldset', { class: 'config-group' }, [el('legend', { text: g })]);
      fields.forEach(function (f) { fs.appendChild(siteTextRow(f)); });
      box.appendChild(fs);
    });
  }

  function renderSiteBanner() {
    var box = $('siteBannerBox');
    if (!box || !siteMeta) return;
    box.innerHTML = '';
    var L = siteCfg.layout;
    var heights = { low: '120px', medium: '170px', tall: '220px', full: '280px' };
    var prev = el('div', { class: 'banner-preview' }, [el('div', { class: 'banner-preview-text', text: 'Naslov naslovnice' })]);
    function syncPrev() {
      prev.style.height = heights[L.bannerHeight] || '220px';
      prev.style.backgroundImage = 'linear-gradient(rgba(0,0,0,' + ((L.bannerOverlay || 0) / 100) + '),rgba(0,0,0,' + ((L.bannerOverlay || 0) / 100) + ')), url("/img/default/banner?t=' + Date.now() + '")';
    }
    syncPrev();
    var range = el('input', { type: 'range', min: '0', max: '80', step: '5', value: String(L.bannerOverlay || 0) });
    var rangeVal = el('span', { class: 'range-val', text: (L.bannerOverlay || 0) + '%' });
    range.addEventListener('input', function () { L.bannerOverlay = Number(range.value); rangeVal.textContent = range.value + '%'; syncPrev(); markDirty(); });
    var fs = el('fieldset', { class: 'config-group' }, [
      el('legend', { text: 'Naslovna slika (banner)' }),
      prev,
      el('p', { class: 'hint', text: 'Sliku mijenjaš u tabu "Slike".' }),
      selectField('Visina', 'Visina naslovne slike na računalu', siteMeta.options.bannerHeight, LAYOUT_LABELS.bannerHeight, L.bannerHeight, function (v) { L.bannerHeight = v; syncPrev(); markDirty(); }),
      el('div', { class: 'theme-row' }, [
        el('div', { class: 'theme-row-label' }, [el('strong', { text: 'Tamni preklop' }), el('span', { class: 'hint', text: 'Zatamni sliku radi čitljivosti bijelog teksta' })]),
        range, rangeVal,
      ]),
    ]);
    box.appendChild(fs);
    box.appendChild(buildBannerButtonsUi());
  }

  // Gumbi na naslovnici: dodavanje, brisanje, redoslijed, odredište i stil.
  var BTN_STYLE_LABELS = { primary: 'Glavni', secondary: 'Sekundarni', tertiary: 'Treći (kao "Opširnije")' };
  function buildBannerButtonsUi() {
    var list = siteCfg.bannerButtons;
    var max = siteMeta.bannerOptions.max;
    var labels = {};
    siteMeta.sectionDefs.forEach(function (d) { labels[d.id] = d.label; });
    var fs = el('fieldset', { class: 'config-group' }, [el('legend', { text: 'Gumbi na naslovnici' })]);
    fs.appendChild(el('p', { class: 'hint', text: 'Gumbi ispod uvodnog teksta. Prazan naziv znači naziv sekcije iz izbornika. Gumb prema skrivenoj sekciji ne prikazuje se. Boje gumba mijenjaš u tabu "Izgled".' }));

    function redraw() {
      var host = fs.querySelector('.bb-list');
      if (host) host.remove();
      fs.insertBefore(buildList(), fs.querySelector('.bb-actions'));
      if (themePreviewRefresh) themePreviewRefresh();
    }
    function buildList() {
      var host = el('div', { class: 'bb-list' });
      if (!list.length) host.appendChild(el('p', { class: 'hint', text: 'Nema gumba na naslovnici.' }));
      list.forEach(function (b, i) {
        var type = el('select', { class: 'bb-type' }, [
          el('option', { value: 'section', text: 'Sekcija' }),
          el('option', { value: 'link', text: 'Poveznica' }),
        ]);
        type.value = b.type;
        type.addEventListener('change', function () {
          b.type = type.value;
          if (b.type === 'section') { b.section = b.section || 'products'; delete b.url; } else { b.url = b.url || 'https://'; delete b.section; }
          markDirty(); redraw();
        });
        var target;
        if (b.type === 'section') {
          target = el('select', { class: 'bb-target' });
          siteMeta.sectionDefs.forEach(function (d) {
            var o = el('option', { value: d.id, text: d.label });
            if (d.id === b.section) o.selected = true;
            target.appendChild(o);
          });
          target.addEventListener('change', function () { b.section = target.value; markDirty(); redraw(); });
        } else {
          target = el('input', { type: 'text', class: 'bb-target', placeholder: 'https://… , mailto:… , tel:… ili #sidro' });
          target.value = b.url || '';
          target.addEventListener('input', function () { b.url = target.value; markDirty(); });
        }
        function lab(lang) {
          var inp = el('input', { type: 'text', maxlength: '60', class: 'bb-label' });
          inp.value = b[lang] || '';
          inp.placeholder = (b.type === 'section' ? (siteMeta.textDefaults[lang]['nav.' + b.section] || labels[b.section]) : (lang === 'hr' ? 'Naziv (HR)' : 'Name (EN)'));
          inp.title = lang.toUpperCase();
          inp.addEventListener('input', function () { b[lang] = inp.value; markDirty(); });
          return inp;
        }
        var style = el('select', { class: 'bb-style' });
        siteMeta.bannerOptions.styles.forEach(function (st) {
          var o = el('option', { value: st, text: BTN_STYLE_LABELS[st] || st });
          if (st === b.style) o.selected = true;
          style.appendChild(o);
        });
        style.addEventListener('change', function () { b.style = style.value; markDirty(); if (themePreviewRefresh) themePreviewRefresh(); });
        var up = el('button', { type: 'button', class: 'btn btn-outline btn-small', title: 'Gore', text: '↑' });
        var down = el('button', { type: 'button', class: 'btn btn-outline btn-small', title: 'Dolje', text: '↓' });
        up.disabled = i === 0; down.disabled = i === list.length - 1;
        up.addEventListener('click', function () { var t = list[i]; list[i] = list[i - 1]; list[i - 1] = t; markDirty(); redraw(); });
        down.addEventListener('click', function () { var t = list[i]; list[i] = list[i + 1]; list[i + 1] = t; markDirty(); redraw(); });
        var del = el('button', { type: 'button', class: 'row-del', title: 'Ukloni gumb' });
        del.innerHTML = TRASH_SVG;
        del.addEventListener('click', function () { list.splice(i, 1); markDirty(); redraw(); });
        host.appendChild(el('div', { class: 'bb-row' }, [
          el('span', { class: 'section-num', text: String(i + 1) }),
          type, target, lab('hr'), lab('en'), style,
          el('span', { class: 'section-btns' }, [up, down]), del,
        ]));
      });
      return host;
    }

    var add = el('button', { type: 'button', class: 'btn btn-outline btn-small', text: '+ Dodaj gumb' });
    add.disabled = list.length >= max;
    add.addEventListener('click', function () {
      if (list.length >= max) return;
      list.push({ type: 'link', url: 'https://', style: 'secondary', hr: '', en: '' });
      markDirty(); renderSiteBanner();
    });
    var reset = el('button', { type: 'button', class: 'btn btn-outline btn-small', text: 'Vrati zadane gumbe' });
    reset.addEventListener('click', function () {
      siteCfg.bannerButtons = [
        { type: 'section', section: 'products', style: 'primary', hr: '', en: '' },
        { type: 'section', section: 'services', style: 'secondary', hr: '', en: '' },
      ];
      markDirty(); renderSiteBanner();
    });
    fs.appendChild(el('div', { class: 'bb-actions' }, [add, reset, el('span', { class: 'hint', text: 'Najviše ' + max + ' gumba.' })]));
    fs.insertBefore(buildList(), fs.querySelector('.bb-actions'));
    return fs;
  }

  function renderSiteSections() {
    var box = $('siteSectionsBox');
    if (!box || !siteMeta) return;
    box.innerHTML = '';
    var S = siteCfg.sections;
    var labels = {};
    siteMeta.sectionDefs.forEach(function (d) { labels[d.id] = d.label; });
    function move(i, d) {
      var j = i + d;
      if (j < 0 || j >= S.order.length) return;
      var t = S.order[i]; S.order[i] = S.order[j]; S.order[j] = t;
      markDirty(); renderSiteSections();
    }
    S.themes = S.themes || {};
    var visIds = S.order.filter(function (id) { return S.hidden.indexOf(id) === -1; });
    S.order.forEach(function (id, i) {
      var hidden = S.hidden.indexOf(id) !== -1;
      var up = el('button', { type: 'button', class: 'btn btn-outline btn-small', title: 'Gore', text: '↑' });
      var down = el('button', { type: 'button', class: 'btn btn-outline btn-small', title: 'Dolje', text: '↓' });
      up.disabled = i === 0; down.disabled = i === S.order.length - 1;
      up.addEventListener('click', function () { move(i, -1); });
      down.addEventListener('click', function () { move(i, 1); });
      var cb = el('input', { type: 'checkbox' });
      cb.checked = !hidden;
      cb.addEventListener('change', function () {
        S.hidden = S.hidden.filter(function (x) { return x !== id; });
        if (!cb.checked) S.hidden.push(id);
        markDirty(); renderSiteSections();
      });
      // Tema: automatski (par/nepar među vidljivim sekcijama) ili ručno.
      var pos = visIds.indexOf(id);
      var autoTheme = pos === -1 ? null : (pos % 2 === 0 ? 't1' : 't2');
      var sel = el('select', { class: 'section-theme' });
      [['auto', 'Automatski' + (autoTheme ? ' (Tema ' + autoTheme.charAt(1) + ')' : '')], ['t1', 'Tema 1 — svijetla'], ['t2', 'Tema 2 — naglašena']].forEach(function (o) {
        var opt = el('option', { value: o[0], text: o[1] });
        if ((S.themes[id] || 'auto') === o[0]) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.disabled = hidden;
      sel.addEventListener('change', function () {
        if (sel.value === 'auto') delete S.themes[id]; else S.themes[id] = sel.value;
        markDirty(); renderSiteSections();
      });
      var effective = hidden ? null : (S.themes[id] || autoTheme);
      box.appendChild(el('div', { class: 'section-row' + (hidden ? ' is-hidden' : '') }, [
        el('span', { class: 'section-num', text: String(i + 1) }),
        el('strong', { class: 'section-name', text: labels[id] || id }),
        effective ? el('span', { class: 'section-swatch sw-' + effective, title: 'Tema ' + effective.charAt(1),
          style: (themeMeta && themeState) ? 'background:' + themeColor({ t1: 't1Bg', t2: 't2Bg' }[effective]) : '' }) : null,
        sel,
        el('label', { class: 'section-vis' }, [cb, document.createTextNode(' Prikaži')]),
        el('span', { class: 'section-btns' }, [up, down]),
      ]));
    });
    box.appendChild(el('p', { class: 'hint', text: 'Naslovnica (veliki naslov) uvijek je na vrhu. Redoslijed vrijedi i za izbornik. Automatska tema izmjenjuje Temu 1 i Temu 2 prema položaju među vidljivim sekcijama, pa se pri promjeni redoslijeda ili skrivanju sama prilagodi. Boje tema mijenjaš u tabu "Izgled".' }));
  }

  function renderSiteSeo() {
    var box = $('siteSeoBox');
    if (!box || !siteMeta) return;
    renderSiteTexts('siteSeoBox', ['Kolačići']);
    var M = siteCfg.meta;
    var md = siteMeta.metaDefaults;
    function counter(input, max, node) {
      function upd() { node.textContent = input.value.length + ' / ' + max + ' znakova (preporuka)'; node.classList.toggle('over', input.value.length > max); }
      input.addEventListener('input', upd); upd();
    }
    var t = el('input', { type: 'text' }); t.value = M.title; t.placeholder = md.title;
    var tc = el('div', { class: 'hint' });
    t.addEventListener('input', function () { M.title = t.value.trim() ? t.value : md.title; markDirty(); });
    counter(t, 60, tc);
    var d = el('textarea', { rows: '4' }); d.value = M.description; d.placeholder = md.description;
    var dc = el('div', { class: 'hint' });
    d.addEventListener('input', function () { M.description = d.value.trim() ? d.value : md.description; markDirty(); });
    counter(d, 160, dc);
    box.appendChild(el('fieldset', { class: 'config-group' }, [
      el('legend', { text: 'Pretraživači (Google)' }),
      el('div', { class: 'field' }, [el('label', { text: 'Naslov stranice' }), t, tc]),
      el('div', { class: 'field' }, [el('label', { text: 'Opis stranice' }), d, dc]),
      el('p', { class: 'hint', text: 'Prazno polje vraća zadano. Ovo se prikazuje u rezultatima pretrage i pri dijeljenju linka.' }),
    ]));
  }

  function renderSiteUi() {
    if (!siteMeta || !siteCfg) return;
    renderSiteBanner();
    renderSiteTexts('siteTextsBox', ['Naslovnica', 'Izbornik', 'Ostalo']);
    renderSiteSections();
    renderSiteSeo();
  }

  // Raspored/oblik (u tabu Izgled): zaobljenost, hover, stupci, veličina teksta.
  function buildLayoutControls(container, onChange) {
    if (!siteMeta || !siteCfg) return;
    var L = siteCfg.layout;
    var group = el('div', { class: 'theme-group' }, [el('h3', { class: 'theme-group-title', text: 'Oblik i veličine' })]);
    group.appendChild(selectField('Zaobljenost rubova', 'Kartice, gumbi, slike', siteMeta.options.radius, LAYOUT_LABELS.radius, L.radius, function (v) { L.radius = v; markDirty(); onChange(); }));
    group.appendChild(checkField('Povećanje kartice na hover', 'Kartica sadnice se lagano poveća kad se prijeđe mišem', L.cardHover !== false, function (v) { L.cardHover = v; markDirty(); onChange(); }));
    var O = siteMeta.options;
    group.appendChild(selectField('Kartica sadnica u redu — računalo', 'Na tabletu najviše 4, na manjim ekranima 2–3', O.columns || [2, 3, 4], LAYOUT_LABELS.columns, L.columns, function (v) { L.columns = Number(v); markDirty(); onChange(); }));
    group.appendChild(selectField('Kartica sadnica u redu — mobitel', 'Na uskim ekranima (mobitel)', O.mobileColumns || [1, 2], LAYOUT_LABELS.mobileColumns, L.mobileColumns, function (v) { L.mobileColumns = Number(v); markDirty(); onChange(); }));
    group.appendChild(selectField('Veličina kartice sadnice', 'Cijela kartica — slika, naziv, cijena i gumb (na tabletu i računalu)', O.cardSize || ['normal'], LAYOUT_LABELS.cardSize, L.cardSize, function (v) { L.cardSize = v; markDirty(); onChange(); }));
    group.appendChild(selectField('Oblik slike na kartici', 'Omjer naslovne slike sadnice', O.imageRatio || ['portrait'], LAYOUT_LABELS.imageRatio, L.imageRatio, function (v) { L.imageRatio = v; markDirty(); onChange(); }));
    group.appendChild(selectField('Veličina teksta', 'Osnovna veličina teksta na cijelom webu', siteMeta.options.fontSize, LAYOUT_LABELS.fontSize, L.fontSize, function (v) { L.fontSize = v; markDirty(); onChange(); }));
    container.appendChild(group);
  }

  // ---- Init ----
  bind();
  load();
  loadConfig();
  renderDefaultImages();
  loadSite().then(function () {
    renderGallery();
    renderSiteUi();
    renderTheme();
  });
})();
