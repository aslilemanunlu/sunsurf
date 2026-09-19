/*
 * Dil değişimi, uygulamadakiyle aynı mantıkta: Türkçe metin anahtardır.
 * Sayfadaki Türkçe cümle olduğu gibi durur, İngilizcesi data-en'de yazılıdır.
 * Böylece sayfayı okuyan biri gerçek cümleyi görür, 'hero.title' gibi bir
 * anahtar değil — ve sözlüğün yalnızca yarısını yazmak gerekir.
 */
(function () {
  var STORAGE_KEY = 'wavefoil.site.lang.v1';
  var nodes = Array.prototype.slice.call(document.querySelectorAll('[data-en]'));
  // Ekran görüntüleri de metin taşıyor: her birinin İngilizce bir eşi var.
  var shots = Array.prototype.slice.call(document.querySelectorAll('[data-en-src]'));
  // Form ipuçları metin değil öznitelik, onları ayrı çevirmek gerekiyor.
  var hints = Array.prototype.slice.call(document.querySelectorAll('[data-en-placeholder]'));

  // Türkçesini ilk geçişte sakla: İngilizceye geçtikten sonra geri dönebilmek
  // için sayfadaki özgün metne bir daha ulaşamayız.
  // data-html taşıyan düğümlerde metin <br> içerir (başlıktaki satır kırılmaları
  // gibi); orada textContent değiş tokuşu etiketleri yutar, innerHTML gerekir.
  nodes.forEach(function (node) {
    var html = node.hasAttribute('data-html');
    node.dataset.tr = (html ? node.innerHTML : node.textContent).trim();
  });

  shots.forEach(function (img) {
    img.dataset.trSrc = img.getAttribute('src');
    img.dataset.trAlt = img.getAttribute('alt') || '';
  });

  hints.forEach(function (field) {
    field.dataset.trPlaceholder = field.getAttribute('placeholder') || '';
  });

  function apply(lang) {
    nodes.forEach(function (node) {
      var value = lang === 'en' ? node.dataset.en : node.dataset.tr;
      if (node.hasAttribute('data-html')) node.innerHTML = value;
      else node.textContent = value;
    });
    shots.forEach(function (img) {
      img.src = lang === 'en' ? img.dataset.enSrc : img.dataset.trSrc;
      img.alt = (lang === 'en' ? img.dataset.enAlt : img.dataset.trAlt) || img.alt;
    });
    hints.forEach(function (field) {
      field.placeholder = lang === 'en' ? field.dataset.enPlaceholder : field.dataset.trPlaceholder;
    });
    document.documentElement.dataset.lang = lang;
    document.documentElement.lang = lang;
    document.querySelectorAll('.lang-btn').forEach(function (btn) {
      var on = btn.dataset.lang === lang;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', String(on));
    });
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {
      /* gizli sekmede yazamayabiliriz; dil yine de değişsin */
    }
  }

  document.querySelectorAll('.lang-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      apply(btn.dataset.lang);
    });
  });

  var saved;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    saved = null;
  }
  if (saved === 'en') apply('en');
})();

/* Dar ekranda menü: başlıktaki bağlantılar gizlendiğinde tek açılır liste. */
(function () {
  var toggle = document.querySelector('.menu-toggle');
  var menu = document.getElementById('mobile-menu');
  if (!toggle || !menu) return;

  function setOpen(open) {
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  }

  toggle.addEventListener('click', function () {
    setOpen(menu.hidden);
  });

  // Bir bağlantıya basınca menü kapanmalı, yoksa hedef bölümün üstünü örter.
  menu.addEventListener('click', function (e) {
    if (e.target.closest('a')) setOpen(false);
  });
})();

/*
 * Görüşme formu.
 *
 * Sayfa statik, arkasında sunucu yok. ENDPOINT boş bırakıldığı sürece form,
 * doldurulan bilgileri hazır bir posta taslağına çevirip ALICI adresine açar;
 * ziyaretçinin tek yapması gereken göndere basmak. Bir sunucu ucu (örneğin
 * Vercel fonksiyonu) eklendiğinde ENDPOINT'i yazmak yeterli: form o zaman
 * bilgileri doğrudan oraya gönderir, posta programı hiç açılmaz.
 */
(function () {
  var ALICI = 'asliunlu08@gmail.com';
  var ENDPOINT = '';

  var dialog = document.getElementById('gorusme-formu');
  if (!dialog) return;

  var form = dialog.querySelector('form');
  var status = dialog.querySelector('.modal-status');

  var METIN = {
    tr: {
      eksik: 'Lütfen ad, soyad ve telefon alanlarını doldurun.',
      taslak: 'Posta taslağınız açıldı. Göndere bastığınızda talebiniz bize ulaşır.',
      gonderildi: 'Talebiniz bize ulaştı. En kısa sürede dönüş yapacağız.',
      hata: 'Gönderilemedi. Lütfen tekrar deneyin ya da bize doğrudan yazın.',
    },
    en: {
      eksik: 'Please fill in your first name, last name and phone.',
      taslak: 'Your email draft is open. Press send and the request reaches us.',
      gonderildi: 'Your request has reached us. We will get back to you shortly.',
      hata: 'It could not be sent. Please try again or write to us directly.',
    },
  };

  function metin(anahtar) {
    return METIN[document.documentElement.dataset.lang === 'en' ? 'en' : 'tr'][anahtar];
  }

  function goster(mesaj) {
    status.textContent = mesaj;
    status.hidden = false;
  }

  function ac() {
    status.hidden = true;
    dialog.showModal();
    var ilk = form.querySelector('input');
    if (ilk) ilk.focus();
  }

  document.querySelectorAll('[data-open-form]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      ac();
    });
  });

  // Sayfadaki "#demo" bağlantıları da formu açsın: bölümün kendisi zaten
  // formu çağıran bir bölüm, ziyaretçiyi ikinci bir tıklamaya zorlamayalım.
  document.querySelectorAll('a[href="#demo"]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      ac();
    });
  });

  dialog.querySelectorAll('[data-close-form]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      dialog.close();
    });
  });

  // Karartılmış alana tıklayınca kapansın.
  dialog.addEventListener('click', function (e) {
    if (e.target === dialog) dialog.close();
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var veri = {
      ad: form.ad.value.trim(),
      soyad: form.soyad.value.trim(),
      telefon: form.telefon.value.trim(),
      rol: form.rol.value,
      isletme: form.isletme.value.trim(),
      detay: form.detay.value.trim(),
    };

    if (!veri.ad || !veri.soyad || !veri.telefon) {
      goster(metin('eksik'));
      return;
    }

    var baslik = 'Görüşme talebi: ' + (veri.isletme || veri.ad + ' ' + veri.soyad);
    var govde = [
      'Ad: ' + veri.ad,
      'Soyad: ' + veri.soyad,
      'Telefon: ' + veri.telefon,
      'Rol: ' + veri.rol,
      'İşletme: ' + (veri.isletme || 'belirtilmedi'),
      '',
      'Detay:',
      veri.detay || 'belirtilmedi',
    ].join('\n');

    if (ENDPOINT) {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(veri),
      })
        .then(function (r) {
          if (!r.ok) throw new Error(String(r.status));
          form.reset();
          goster(metin('gonderildi'));
        })
        .catch(function () {
          goster(metin('hata'));
        });
      return;
    }

    window.location.href =
      'mailto:' + ALICI + '?subject=' + encodeURIComponent(baslik) + '&body=' + encodeURIComponent(govde);
    goster(metin('taslak'));
  });
})();
