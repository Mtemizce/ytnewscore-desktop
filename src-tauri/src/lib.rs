// Masaüstü kabuğu: panel penceresi (sitenin paneli), kabuk penceresi (hesap seçici + kilit),
// masaüstü widget'ı, sistem tepsisi ve bildirim eklentileri.
mod downloads;

use std::sync::Mutex;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::NewWindowResponse,
    AppHandle, Emitter, Manager, State, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_opener::OpenerExt;

const TRAY_ID: &str = "main";
const SHELL_LABEL: &str = "main";
const PANEL_LABEL: &str = "panel";
const WIDGET_LABEL: &str = "widget";

/// Panelin her sayfasına eklenen çekmece menü + F11 (yalnız `panel_action` çağırabilir).
const PANEL_SCRIPT: &str = include_str!("panel-drawer.js");

/// Kilitliyken panel gösterilmez; tepsi "Aç" kabuğu (kilit ekranı) gösterir.
#[derive(Default)]
struct AppState {
    locked: Mutex<bool>,
    /// Panelden "Oturumu kapat"tan sonra gelen /admin/login yönlendirmesi "oturum düştü" sayılmaz
    /// (yoksa kabuk token ile yeniden giriş yapardı).
    logging_out: Mutex<bool>,
}

fn set_logging_out(app: &AppHandle, value: bool) {
    *app.state::<AppState>().logging_out.lock().unwrap() = value;
}

fn is_panel_path(path: &str) -> bool {
    path == "/admin" || path.starts_with("/admin/")
}

/// Panel dışı adresler varsayılan tarayıcıda. Olay işleyicisi içinden değil, arka plan
/// görevinden açılır (WebView2 olayı sürerken kabuk çağrısı yapılmaz).
fn open_in_browser(app: &AppHandle, url: &Url) {
    if !matches!(url.scheme(), "http" | "https") {
        return;
    }
    let app = app.clone();
    let target = url.to_string();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = app.opener().open_url(&target, None::<&str>) {
            eprintln!("[ytn] tarayıcıda açılamadı {target}: {error}");
        }
    });
}

fn show_window(app: &AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Tepsi / widget "Aç": kilitliyse kilit ekranı, panel açıksa panel, değilse hesap seçici.
fn open_app(app: &AppHandle) {
    let locked = *app.state::<AppState>().locked.lock().unwrap();
    if !locked && app.get_webview_window(PANEL_LABEL).is_some() {
        show_window(app, PANEL_LABEL);
    } else {
        show_window(app, SHELL_LABEL);
    }
}

#[tauri::command]
fn show_main(app: AppHandle) {
    open_app(&app);
}

/// Panel penceresini açar ya da var olanı verilen adrese götürür (tek kullanımlık giriş bağlantısı).
/// Panelden çıkış hesap seçiciye döndürür, düşen oturum kabukta yeniden bağlanır. Panel dışındaki
/// adresler ("Sitede gör", "Siteye Git", başka siteler) ve yeni sekmeler varsayılan tarayıcıda
/// açılır. Uzak sayfa yalnız `panel_action`'ı çağırabilir.
/// `async`: Windows'ta senkron komut içinden pencere oluşturmak kilitlenir.
#[tauri::command]
async fn open_panel(app: AppHandle, url: String, title: String, width: Option<f64>, height: Option<f64>, frameless: Option<bool>) -> Result<(), String> {
    let target: Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;
    set_logging_out(&app, false);

    let (panel_width, panel_height) = clamp_panel_size(width, height);
    let frameless = frameless.unwrap_or(false);

    if let Some(window) = app.get_webview_window(PANEL_LABEL) {
        window.navigate(target).map_err(|e| e.to_string())?;
        let _ = window.set_title(&title);
        apply_panel_frame(&window, frameless);
        show_window(&app, PANEL_LABEL);
        return Ok(());
    }

    let host = target.host_str().unwrap_or_default().to_string();
    let new_window_host = host.clone();
    let handle = app.clone();
    let browser = app.clone();
    let ready = app.clone();
    let window = WebviewWindowBuilder::new(&app, PANEL_LABEL, WebviewUrl::External(target))
        .title(&title)
        .inner_size(panel_width, panel_height)
        .min_inner_size(960.0, 600.0)
        // Ayarlar › "Çerçevesiz": başlık çubuğu yok; sürükleme ve pencere düğmeleri çekmece betiğinde.
        .decorations(!frameless)
        .center()
        // İlk sayfa yüklenene kadar gizli (beyaz pencere yerine kabukta "Açılıyor…" görünür);
        // panelin zemin rengiyle açılır.
        .visible(false)
        .background_color(tauri::window::Color(248, 250, 252, 255))
        .on_page_load(move |window, payload| {
            if !matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                return;
            }
            if !window.is_visible().unwrap_or(true) && !*ready.state::<AppState>().locked.lock().unwrap() {
                let _ = window.show();
                let _ = window.set_focus();
            }
            let _ = ready.emit("panel://ready", ());
        })
        .initialization_script(format!("window.__ytnFrameless = {frameless};"))
        .initialization_script(PANEL_SCRIPT)
        .on_navigation(move |next| {
            // blob:, data:, about: (indirmeler, gömülü içerik) olduğu gibi.
            if !matches!(next.scheme(), "http" | "https") {
                return true;
            }
            if next.host_str().unwrap_or_default() != host || !is_panel_path(next.path()) {
                open_in_browser(&handle, next);
                return false;
            }
            match next.path() {
                // Panelden çıkış: sunucu web oturumunu kapatır; kabuk token'ı iptal edip hesap seçiciye döner.
                "/admin/logout" => {
                    set_logging_out(&handle, true);
                    let _ = handle.emit("panel://logout", ());
                    true
                }
                // Panel oturumu düştü: kabuk token ile yeni bir giriş bağlantısı alır (çıkışta değil).
                "/admin/login" => {
                    if !*handle.state::<AppState>().logging_out.lock().unwrap() {
                        let _ = handle.emit("panel://session-expired", ());
                    }
                    false
                }
                _ => true,
            }
        })
        // Yeni sekme / window.open: panelin kendi sayfası aynı pencerede (tarayıcıda oturum yok),
        // gerisi varsayılan tarayıcıda.
        .on_new_window(move |url, _features| {
            if url.host_str().unwrap_or_default() == new_window_host && is_panel_path(url.path()) {
                let app = browser.clone();
                tauri::async_runtime::spawn(async move {
                    if let Some(panel) = app.get_webview_window(PANEL_LABEL) {
                        let _ = panel.navigate(url);
                    }
                });
            } else {
                open_in_browser(&browser, &url);
            }
            NewWindowResponse::Deny
        })
        .on_download(downloads::handle)
        .build()
        .map_err(|e| e.to_string())?;
    let _ = window;

    Ok(())
}

/// Hesaptan çıkış / hesap değiştirme: panel penceresi kapanır (çerezler bir sonraki girişte değişir).
#[tauri::command]
async fn close_panel(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(PANEL_LABEL) {
        window.destroy().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Ayarlardaki panel boyutu en az panelin alt sınırı kadar olur (960x600).
fn clamp_panel_size(width: Option<f64>, height: Option<f64>) -> (f64, f64) {
    (width.unwrap_or(1360.0).max(960.0), height.unwrap_or(860.0).max(600.0))
}

/// Çerçevesiz kipi açık panel penceresine uygular (yeniden oluşturmadan) ve çekmece betiğine bildirir.
fn apply_panel_frame(window: &WebviewWindow, frameless: bool) {
    let _ = window.set_decorations(!frameless);
    let _ = window.eval(&format!("window.__ytnFrameless = {frameless}; window.__ytnApplyFrame && window.__ytnApplyFrame();"));
}

/// Ayarlar kaydedilince: kabuk ve (açıksa) panel penceresi çerçeve kipini, panel penceresi
/// ayrıca varsayılan boyutu hemen alır. Kapalı pencereler bir sonraki açılışta ayarı okur.
#[tauri::command]
async fn apply_window_settings(app: AppHandle, width: Option<f64>, height: Option<f64>, frameless: bool) -> Result<(), String> {
    if let Some(shell) = app.get_webview_window(SHELL_LABEL) {
        let _ = shell.set_decorations(!frameless);
    }
    if let Some(panel) = app.get_webview_window(PANEL_LABEL) {
        apply_panel_frame(&panel, frameless);
        let (panel_width, panel_height) = clamp_panel_size(width, height);
        let _ = panel.set_size(tauri::LogicalSize::new(panel_width, panel_height));
    }
    Ok(())
}

/// Çekmece menü ve F11 (panel sayfasından): tam ekran, kilit, widget, indirilenler, hesap
/// değiştirme (oturumu kapatır), uygulamayı kapatma.
#[tauri::command]
async fn panel_action(app: AppHandle, action: String) -> Result<(), String> {
    match action.as_str() {
        "fullscreen" => toggle_panel_fullscreen(&app),
        "lock" => app.emit("app://lock", ()).map_err(|e| e.to_string())?,
        "switch" => app.emit("app://accounts", ()).map_err(|e| e.to_string())?,
        "widget" => {
            toggle_widget_window(&app)?;
        }
        "downloads" => open_downloads(&app)?,
        "open-download" => downloads::open_last(&app, false)?,
        "reveal-download" => downloads::open_last(&app, true)?,
        // Çerçevesiz panel penceresi: sürükleme tutamacı ve pencere düğmeleri (çekmece betiği).
        "drag" => {
            if let Some(panel) = app.get_webview_window(PANEL_LABEL) {
                let _ = panel.start_dragging();
            }
        }
        "minimize" => {
            if let Some(panel) = app.get_webview_window(PANEL_LABEL) {
                let _ = panel.minimize();
            }
        }
        "maximize" => {
            if let Some(panel) = app.get_webview_window(PANEL_LABEL) {
                if panel.is_maximized().unwrap_or(false) {
                    let _ = panel.unmaximize();
                } else {
                    let _ = panel.maximize();
                }
            }
        }
        "quit" => app.exit(0),
        _ => return Err(format!("bilinmeyen işlem: {action}")),
    }
    Ok(())
}

fn open_downloads(app: &AppHandle) -> Result<(), String> {
    let dir = app.path().download_dir().map_err(|e| e.to_string())?;
    app.opener().open_path(dir.to_string_lossy(), None::<&str>).map_err(|e| e.to_string())
}

/// Kabuk penceresinde F11 (ör. kilit ekranı tam ekran).
#[tauri::command]
fn toggle_window_fullscreen(window: WebviewWindow) {
    let fullscreen = window.is_fullscreen().unwrap_or(false);
    let _ = window.set_fullscreen(!fullscreen);
}

/// Panel penceresinde tam ekran (F11, çekmece menü ya da tepsi menüsü).
fn toggle_panel_fullscreen(app: &AppHandle) {
    if let Some(panel) = app.get_webview_window(PANEL_LABEL) {
        let fullscreen = panel.is_fullscreen().unwrap_or(false);
        let _ = panel.set_fullscreen(!fullscreen);
        let _ = panel.set_focus();
    }
}

/// Kilit yalnız uygulamayı kilitler: panel gizlenir, kabuk normal pencerede kilit ekranını
/// gösterir; bilgisayarda başka uygulamalara geçilebilir. Açılınca panel geri gelir.
#[tauri::command]
fn set_locked(app: AppHandle, state: State<'_, AppState>, locked: bool) {
    *state.locked.lock().unwrap() = locked;
    if let Some(panel) = app.get_webview_window(PANEL_LABEL) {
        if locked {
            let _ = panel.set_fullscreen(false);
            let _ = panel.hide();
        } else {
            let _ = panel.show();
        }
    }
    if let Some(shell) = app.get_webview_window(SHELL_LABEL) {
        if locked {
            let _ = shell.show();
            let _ = shell.set_focus();
        } else {
            let _ = shell.set_fullscreen(false);
            if app.get_webview_window(PANEL_LABEL).is_some() {
                let _ = shell.hide();
            }
        }
    }
    if !locked {
        if let Some(panel) = app.get_webview_window(PANEL_LABEL) {
            let _ = panel.set_focus();
        }
    }
}

/// Panel açılınca kabuk (hesap seçici) gizlenir; hesap seçmek için yeniden gösterilir.
#[tauri::command]
fn set_shell_visible(app: AppHandle, visible: bool) {
    if let Some(shell) = app.get_webview_window(SHELL_LABEL) {
        let _ = if visible { shell.show().and_then(|_| shell.set_focus()) } else { shell.hide() };
    }
}

/// İşletim sisteminde son klavye/fare hareketinden bu yana geçen saniye (hareketsizlik kilidi).
#[tauri::command]
fn system_idle_seconds() -> u64 {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::System::SystemInformation::GetTickCount;
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
        let mut info = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
        if GetLastInputInfo(&mut info) != 0 {
            return u64::from(GetTickCount().wrapping_sub(info.dwTime)) / 1000;
        }
    }
    0
}

/// Masaüstü widget'ı (tek pencere): açıksa kapatır. Aynı ön yüzü yükler, kendini etiketinden tanır.
#[tauri::command]
async fn toggle_widget(app: AppHandle) -> Result<bool, String> {
    toggle_widget_window(&app)
}

fn toggle_widget_window(app: &AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window(WIDGET_LABEL) {
        window.destroy().map_err(|e| e.to_string())?;
        return Ok(false);
    }

    let window = WebviewWindowBuilder::new(app, WIDGET_LABEL, WebviewUrl::App("index.html".into()))
        .title("YTNewsCore Widget")
        .inner_size(300.0, 440.0)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .build()
        .map_err(|e| e.to_string())?;

    if let Ok(Some(monitor)) = window.current_monitor() {
        let size = monitor.size().to_logical::<f64>(monitor.scale_factor());
        let _ = window.set_position(tauri::LogicalPosition::new(size.width - 316.0, size.height - 500.0));
    }

    Ok(true)
}

#[tauri::command]
fn set_tray_tooltip(app: AppHandle, text: String) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(text));
    }
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Uygulamayı Aç", true, None::<&str>)?;
    let accounts = MenuItem::with_id(app, "accounts", "Hesap Değiştir (oturumu kapatır)", true, None::<&str>)?;
    let fullscreen = MenuItem::with_id(app, "fullscreen", "Tam Ekran (F11)", true, None::<&str>)?;
    let widget = MenuItem::with_id(app, "widget", "Masaüstü Widget'ı", true, None::<&str>)?;
    let lock = MenuItem::with_id(app, "lock", "Kilitle", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Çıkış", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&open, &accounts, &fullscreen, &widget, &lock, &separator, &quit])?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("YTNewsCore")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => open_app(app),
            "accounts" => {
                let _ = app.emit("app://accounts", ());
            }
            "fullscreen" => {
                if !*app.state::<AppState>().locked.lock().unwrap() {
                    show_window(app, PANEL_LABEL);
                    toggle_panel_fullscreen(app);
                }
            }
            "widget" => {
                let _ = toggle_widget_window(app);
            }
            "lock" => {
                let _ = app.emit("app://lock", ());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                open_app(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .manage(downloads::DownloadState::default())
        // Kabuğun API istekleri Rust tarafından atılır (CORS yok); izinli adresler capabilities/default.json.
        .plugin(tauri_plugin_http::init())
        // İşletim sisteminin kendi bildirimleri.
        .plugin(tauri_plugin_notification::init())
        // Cihaz adı için işletim sistemi ve bilgisayar adı.
        .plugin(tauri_plugin_os::init())
        // Panelden çıkan bağlantılar varsayılan tarayıcıda.
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            show_main,
            open_panel,
            apply_window_settings,
            close_panel,
            set_locked,
            set_shell_visible,
            system_idle_seconds,
            toggle_widget,
            toggle_window_fullscreen,
            panel_action,
            set_tray_tooltip,
            quit_app
        ])
        .setup(|app| {
            build_tray(app.handle())?;
            // Yalnız geliştirme derlemesi: panel penceresini verilen adreste açar (bağlantı,
            // indirme davranışını gerçek pencerede denemek için; giriş gerektirmez).
            #[cfg(debug_assertions)]
            if let Ok(url) = std::env::var("YTN_SELFTEST_PANEL_URL") {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(error) = open_panel(handle, url, "Öz-test".into(), None, None, None).await {
                        eprintln!("[ytn] öz-test paneli açılamadı: {error}");
                    }
                });
            }
            Ok(())
        })
        // Pencereleri kapatmak uygulamayı tepsiye gizler; çıkış tepsi menüsünden.
        .on_window_event(|window, event| {
            if matches!(window.label(), SHELL_LABEL | PANEL_LABEL) {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("uygulama başlatılamadı");
}
