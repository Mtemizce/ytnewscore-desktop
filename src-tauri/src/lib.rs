// Masaüstü kabuğu: panel penceresi (sitenin paneli), kabuk penceresi (hesap seçici + kilit),
// masaüstü widget'ı, sistem tepsisi ve bildirim eklentileri.
use std::sync::Mutex;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_opener::OpenerExt;

const TRAY_ID: &str = "main";
const SHELL_LABEL: &str = "main";
const PANEL_LABEL: &str = "panel";
const WIDGET_LABEL: &str = "widget";

/// Uzak panel sayfasına IPC verilmez; F11 bu adrese gitmeye çalışır, `on_navigation` yakalayıp
/// iptal eder ve tam ekranı açar/kapatır.
const FULLSCREEN_PATH: &str = "/__ytn-desktop/fullscreen";
const PANEL_SCRIPT: &str = r#"
document.addEventListener('keydown', function (event) {
  if (event.key === 'F11') {
    event.preventDefault();
    window.location.assign('/__ytn-desktop/fullscreen');
  }
}, true);
"#;

/// Kilitliyken panel gösterilmez; tepsi "Aç" kabuğu (kilit ekranı) gösterir.
#[derive(Default)]
struct AppState {
    locked: Mutex<bool>,
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
/// Panelden çıkış hesap seçiciye döndürür, düşen oturum kabukta yeniden bağlanır, başka sitelere
/// giden bağlantılar varsayılan tarayıcıda açılır. Uzak sayfaya Tauri IPC verilmez.
/// `async`: Windows'ta senkron komut içinden pencere oluşturmak kilitlenir.
#[tauri::command]
async fn open_panel(app: AppHandle, url: String, title: String) -> Result<(), String> {
    let target: Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;

    if let Some(window) = app.get_webview_window(PANEL_LABEL) {
        window.navigate(target).map_err(|e| e.to_string())?;
        let _ = window.set_title(&title);
        show_window(&app, PANEL_LABEL);
        return Ok(());
    }

    let host = target.host_str().unwrap_or_default().to_string();
    let handle = app.clone();
    let window = WebviewWindowBuilder::new(&app, PANEL_LABEL, WebviewUrl::External(target))
        .title(&title)
        .inner_size(1360.0, 860.0)
        .min_inner_size(960.0, 600.0)
        .center()
        .initialization_script(PANEL_SCRIPT)
        .on_navigation(move |next| {
            if next.path() == FULLSCREEN_PATH {
                let app = handle.clone();
                tauri::async_runtime::spawn(async move { toggle_panel_fullscreen(&app) });
                return false;
            }
            if next.host_str().unwrap_or_default() != host {
                let _ = handle.opener().open_url(next.as_str(), None::<&str>);
                return false;
            }
            match next.path() {
                // Panelden çıkış: uygulama da bu hesabın panelini kapatır, hesap seçiciye döner.
                "/admin/logout" => {
                    let _ = handle.emit("panel://logout", ());
                    true
                }
                // Panel oturumu düştü: kabuk token ile yeni bir giriş bağlantısı alır.
                "/admin/login" => {
                    let _ = handle.emit("panel://session-expired", ());
                    false
                }
                _ => true,
            }
        })
        .build()
        .map_err(|e| e.to_string())?;
    let _ = window.set_focus();

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

/// Panel penceresinde tam ekran (F11 ya da tepsi menüsü).
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
        } else if app.get_webview_window(PANEL_LABEL).is_some() {
            let _ = shell.hide();
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
    let accounts = MenuItem::with_id(app, "accounts", "Hesap Değiştir", true, None::<&str>)?;
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
            close_panel,
            set_locked,
            set_shell_visible,
            system_idle_seconds,
            toggle_widget,
            set_tray_tooltip,
            quit_app
        ])
        .setup(|app| {
            build_tray(app.handle())?;
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
