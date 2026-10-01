# YTNewsCore Masaüstü (Tauri 2 + Alpine.js)

YTNewsCore sitesini `/api/v1` üzerinden yöneten hafif masaüstü uygulaması: haberler, köşe yazıları, kullanıcılar, sistem bildirimleri.

## Çalıştırma

```bash
npm install
npm run tauri dev      # geliştirme penceresi (sıcak yenileme)
npm run tauri build    # kurulum dosyası → src-tauri/target/release/bundle/
npm run dev            # yalnız arayüz, tarayıcıda http://localhost:1420
```

Gereksinimler: Node.js 18+, Rust (https://rustup.rs). Windows'ta ayrıca Microsoft C++ Build Tools; WebView2 Windows 11'de hazır gelir.

## Klasör yapısı

```
index.html                 boş kabuk (#app); her şey src/main.js'ten gelir
src/
  main.js                  açılış: stiller, görünümler, Alpine bileşenleri
  core/                    uygulamadan bağımsız temel parçalar
    session.js             sunucu adresi, token, kullanıcı (localStorage) + HTTPS denetimi
    desktop.js             Rust kabuğuyla köprü: tepsi ipucu, widget, tepsiden kilitleme
    panel.js               panel sayfasını (haber formu vb.) tek kullanımlık girişle ayrı pencerede açar
    http.js                tek istek noktası: Bearer token, hata, 401'de oturum kapatma
    device.js              otomatik cihaz adı ("Windows 11 · BILGISAYAR-ADI")
    notify.js              işletim sistemi bildirimleri
    format.js              tarih, hata mesajı, baş harfler
  api/
    index.js               /api/v1 uçları (news, articles, users, notifications…)
    form-data.js           görselli kayıtlar için multipart gövde
  components/              Alpine bileşenleri (durum + davranış)
    app-shell.js           giriş/çıkış (+2FA), menü (yetkiye göre), kilit ekranı, tam ekran, bildirimler
    stats-store.js         Pano verisi (Pano, kilit ekranı, tepsi ve widget ortak)
    widget.js              masaüstü widget penceresi (#widget)
    list.js                ortak sayfalı tablo: arama, süzgeç, toplam, sayfalar
    dashboard-section.js   Pano + Sunucu Durumu
    content-section.js     Haberler + Köşe Yazıları (ekleme/düzenleme panel formunda)
    inbox-section.js       Gelen Kutusu (hesaplar · liste · okuma)
    comments-section.js    Yorum moderasyonu
    forms-section.js       İletişim Formları ve gönderiler
    pages-section.js       Sabit Sayfalar
    ads-section.js         Reklamlar + Alanlar (yerel form)
    social-section.js      Paylaşım geçmişi, platformlar, Telegram kanalları
    users-section.js       Kullanıcılar
    profile-section.js     Profilim (bilgiler, parola, 2FA)
    auth-store.js          giriş yapan kullanıcı ve izinleri ($store.auth.can)
    ui-store.js            paylaşılan durum: etkin bölüm, balon mesaj, onay penceresi
  views/                   HTML parçaları; render.js açılışta birleştirir
    app.html, login.html, shell.html, widget.html
    sections/              her bölümün görünümü (dashboard, content, inbox, comments, forms, pages, ads, ads-form, social, users, profile)
    partials/              pager, bell, lock, confirm, toast
  styles/                  tokens (renkler) → base → layout → components → table → form → inbox → dashboard
src-tauri/                 Rust kabuğu: eklentiler, sistem tepsisi, widget penceresi (src/lib.rs) ve izinler (capabilities/default.json)
```

`views/` içinde bir parça başka birini `<!-- @include partials/pager -->` ile çağırır; değişken de verilebilir: `<!-- @include sections/content kind=news -->` (dosyada `{{kind}}`).

## Yeni bir bölüm eklemek

1. `src/api/index.js`: uçları ekleyin (`resource('/yol')` liste/göster/ekle/güncelle/sil verir).
2. `src/components/xxx-section.js`: `{ ...paginatedList((p) => api.xxx.list(p)), ... }` ile bileşen.
3. `src/views/sections/xxx.html`: tablo + `<!-- @include partials/pager -->`.
4. `src/main.js`'te `Alpine.data(...)`, `shell.html`'de bölüm satırı, `app-shell.js` → `SECTIONS`'a menü girişi.

## Masaüstü özellikleri

- **Sistem tepsisi:** pencereyi kapatmak uygulamayı tepsiye gizler (bildirimler gelmeye devam eder). Tepsi menüsü: Uygulamayı Aç, Masaüstü Widget'ı, Kilitle, Çıkış. Simgenin üzerine gelince bekleyen yorum, okunmamış e-posta ve çevrimiçi ziyaretçi sayısı görünür.
- **Masaüstü widget'ı:** küçük, çerçevesiz, her zaman üstte duran pencere (sağ alt köşe, başlığından sürüklenir). Anlık ziyaretçi, haber, yorum, bekleyen yorum, okunmamış e-posta/form ve servis durumu dakikada bir yenilenir. Üst çubuktaki ekran simgesi ya da tepsi menüsüyle açılıp kapanır.
- **Pano:** aynı sayılar ve Sunucu Durumu (kuyruk, zamanlayıcı, Redis, Reverb; izinle disk, veritabanı, işler, sürümler).
- **Kilit ekranı:** düğme, Ctrl+L, tepsi menüsü ya da 15 dakika hareketsizlik; parola ile açılır, altında aynı özet sayılar görünür.
- **Tam ekran:** F11 ya da üst çubuktaki düğme.
- İşletim sisteminin kendi kilit ekranına widget koymak Tauri ile mümkün değil (Windows App SDK / WidgetKit gerekir); bunun yerine yukarıdaki widget penceresi ve uygulamanın kendi kilit ekranı kullanılır.

## Notlar

- **İstekler Rust tarafından gider** (`@tauri-apps/plugin-http`), CORS gerekmez. İzinli adresler `src-tauri/capabilities/default.json`: yerelde `http://localhost`, `127.0.0.1`, `*.local`, `*.test`; internette yalnız `https://`.
- **Şifre:** istemcide hashlenmez; hash şifrenin yerine geçeceği için koruma sağlamaz. Koruma HTTPS'tir, sunucu şifreyi bcrypt ile saklar. Giriş ekranı, internetteki bir adres `http://` ise uyarır.
- **Cihaz adı** otomatik gönderilir; bağlantılar sitede Admin Ayarlar › API › Bağlı Hesaplar'da IP adresiyle görünür ve oradan kesilebilir.
- **Bildirimler:** uygulama dakikada bir `/api/v1/notifications`'ı yoklar; yeni okunmamış bildirimler Windows bildirim merkezine (macOS/Linux'ta sistem bildirimine) düşer. Zil menüsündeki "Dene" ile izin ve görünüm denenir.
- **Güncellemede** gönderilmeyen etiket, galeri, yayın tarihi ve manşet bayrakları sunucuda korunur. Galeriden kaldırılan görseller `gallery_media_ids` ile, yeni görseller `gallery[]` ile gider.
