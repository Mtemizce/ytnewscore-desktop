# YTNewsCore Masaüstü (Tauri 2 + Alpine.js)

YTNewsCore sitelerinin panelini masaüstü penceresinde açan hafif uygulama. Panelin ekranları sitenin kendisinden gelir (web'de ne varsa masaüstünde de odur); uygulamanın kendi kabuğu yalnız şunları yapar: hesap seçici (birden çok site/kullanıcı), kilit ekranı, sistem tepsisi, sistem bildirimleri ve masaüstü widget'ı.

## Çalıştırma

```bash
npm install
npm run tauri dev      # geliştirme penceresi (sıcak yenileme)
npm run tauri build    # kurulum dosyası → src-tauri/target/release/bundle/
npm run dev            # yalnız kabuk, tarayıcıda http://localhost:1420 (panel yeni sekmede açılır)
```

Gereksinimler: Node.js 18+, Rust (https://rustup.rs). Windows'ta ayrıca Microsoft C++ Build Tools; WebView2 Windows 11'de hazır gelir.

## Nasıl çalışır

1. **Hesap ekle:** site adresi + e-posta/kullanıcı adı + şifre (2FA açıksa kod). Sunucu `/api/v1/auth/login` ile bir API token'ı verir; token bu bilgisayarda saklanır, şifre saklanmaz.
2. **Hesabı aç:** kabuk token ile `/api/v1/auth/web-session`'dan 60 saniyelik tek kullanımlık giriş bağlantısı alır ve paneli `panel` penceresinde açar. Panel oturumu düşerse aynı yolla sessizce yeniden bağlanır.
3. **Panelden çıkış** ve **Hesap Değiştir** bu hesabın token'ını iptal eder, panel kapanır; hesap listede "oturum kapalı" kalır ve yeniden girmek şifre ister (birden çok kişinin kullandığı bilgisayarda kimse başkasının paneline giremesin). Uygulama açılırken hatırlanan hesap kilit ekranıyla (şifre) açılır.
4. Panel dışındaki adresler ("Sitede gör", "Siteye Git", başka siteler) ve yeni sekmeler varsayılan tarayıcıda açılır.
5. Uzak panel sayfası yalnız `panel_action` komutunu çağırabilir (`capabilities/panel.json`; diğer komutlar `default.json`'da yalnız kabuk ve widget'a açık, `build.rs` izin listesi).

## Klasör yapısı

```
index.html                 boş kabuk (#app); her şey src/main.js'ten gelir
src/
  main.js                  açılış: ana pencere kabuk, "widget" etiketli pencere widget
  core/
    session.js             kayıtlı hesaplar + etkin hesap (localStorage) + HTTPS denetimi
    desktop.js             Rust köprüsü: panel penceresi, kilit, hareketsizlik, tepsi, widget
    http.js                tek istek noktası: Bearer token, hata, 401'de hesabı "oturum kapalı" yapma
    realtime.js            Reverb (Echo/pusher-js), kanal yetkisi token ile /api/v1/realtime/auth
    device.js              otomatik cihaz adı ("Windows 11 · BILGISAYAR-ADI")
    notify.js              işletim sistemi bildirimleri (sesli)
    format.js              hata mesajı, baş harfler
  api/index.js             kabuğun kullandığı uçlar (auth, me, notifications, dashboard)
  components/
    app-shell.js           hesap seçici, hesap ekleme (+2FA), panel açma, kilit, bildirimler
    stats-store.js         Pano sayıları (kilit ekranı, tepsi ipucu, widget)
    widget.js              masaüstü widget penceresi
    ui-store.js            balon mesaj, onay penceresi
  views/                   accounts, login, widget, partials (lock, confirm, toast); render.js birleştirir
  styles/                  tokens → base → layout → components → form → dashboard
src-tauri/                 Rust kabuğu (src/lib.rs) ve izinler (capabilities/default.json)
```

## Masaüstü özellikleri

- **Sistem tepsisi:** pencereleri kapatmak uygulamayı tepsiye gizler (bildirimler gelmeye devam eder). Menü: Uygulamayı Aç, Hesap Değiştir, Tam Ekran, Masaüstü Widget'ı, Kilitle, Çıkış. Simgenin ipucunda bekleyen yorum, okunmamış e-posta ve çevrimiçi ziyaretçi sayısı görünür.
- **Bildirimler:** Reverb açıksa yeni bildirim anında, değilse dakikalık yoklamayla Windows bildirim merkezine düşer; başlık sitenin adı, sesli. Geliştirme modunda bildirimin üstündeki uygulama adı "Windows PowerShell" görünür, kurulu uygulamada "YTNewsCore".
- **Masaüstü widget'ı:** küçük, çerçevesiz, her zaman üstte duran pencere; etkin hesabın sayıları Reverb'deki dakikalık Pano sinyaliyle ve yeni bildirimlerde anında yenilenir.
- **Çekmece menü** (panelin sağ kenarındaki tutamak; `src-tauri/src/panel-drawer.js`, Shadow DOM, web paneline dokunmaz): Tam Ekran, Kilitle, Masaüstü Widget'ı, İndirilenler Klasörü, Hesap Değiştir, Uygulamayı Kapat.
- **Tam ekran:** panelde ve kilit ekranında F11; ayrıca çekmece ve tepsi menüsü.
- **İndirmeler** (`src-tauri/src/downloads.rs`): İndirilenler klasörüne kaydedilir, sistem bildirimiyle haber verilir. Düz http'de (yerel geliştirme) WebView2 güvensiz indirmeyi engellediği için dosya panelin oturum çerezleriyle Rust tarafından çekilir (yalnız GET; toplu ZIP gibi POST indirmeleri yalnız HTTPS'te).
- **Kilit ekranı:** tepsi menüsü, hesap seçicideki "Kilitle" ya da 15 dakika sistem hareketsizliği. Yalnız uygulamayı kilitler: panel gizlenir, kilit ekranı normal pencerede açılır, başka uygulamalara geçilebilir; şifreyle açılır.
- **Hesap kartları:** fotoğraf, ad, unvan, e-posta, telefon ve bu cihazdaki son oturum tarihi.
- Windows 11 widget panosu (Win+W) ve canlı duvar kâğıdı Tauri ile yapılamaz (Windows App SDK paketli uygulama gerekir); onun yerine yukarıdaki widget penceresi kullanılır.

## Notlar

- **Kabuğun istekleri Rust tarafından gider** (`@tauri-apps/plugin-http`), CORS gerekmez. İzinli adresler `src-tauri/capabilities/default.json`: yerelde `http://localhost`, `127.0.0.1`, `*.local`, `*.test`; internette yalnız `https://`.
- **Şifre:** istemcide hashlenmez; hash şifrenin yerine geçeceği için koruma sağlamaz. Koruma HTTPS'tir, sunucu şifreyi bcrypt ile saklar. Hesap ekleme ekranı, internetteki bir adres `http://` ise uyarır.
- **Cihaz adı** otomatik gönderilir; bağlantılar sitede Ayarlar › API › Bağlı Hesaplar'da IP adresiyle görünür ve oradan kesilebilir.
