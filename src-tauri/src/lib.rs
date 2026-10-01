// Uygulama kabuğu: eklentiler, sistem tepsisi ve masaüstü widget penceresi.
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

const TRAY_ID: &str = "main";
const WIDGET_LABEL: &str = "widget";

/// Ana pencereyi gösterir ve öne getirir (tepsiden ya da widget'tan).
#[tauri::command]
fn show_main(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Masaüstü widget'ını açar/kapatır: küçük, çerçevesiz, her zaman üstte, görev çubuğunda yok,
/// sağ alt köşede. Aynı ön yüzü yükler; ön yüz kendini pencere etiketinden ("widget") tanır,
/// oturum ve token ortaktır. Tek pencere: açıksa kapatır.
///
/// `async`: Windows'ta senkron bir komutun içinden pencere oluşturmak kilitlenir (donma).
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

/// Tepsi simgesinin ipucu metni (ör. "3 bekleyen yorum · 12 çevrimiçi").
#[tauri::command]
fn set_tray_tooltip(app: AppHandle, text: String) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(text));
    }
}

/// Uygulamadan gerçekten çıkış (pencereyi kapatmak tepsiye gizler).
#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Uygulamayı Aç", true, None::<&str>)?;
    let widget = MenuItem::with_id(app, "widget", "Masaüstü Widget'ı", true, None::<&str>)?;
    let lock = MenuItem::with_id(app, "lock", "Kilitle", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Çıkış", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&open, &widget, &lock, &separator, &quit])?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("YTNewsCore")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app.clone()),
            "widget" => {
                let _ = toggle_widget_window(app);
            }
            "lock" => {
                show_main(app.clone());
                let _ = app.emit("app://lock", ());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle().clone());
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
        // API istekleri Rust tarafından atılır (CORS yok); izinli adresler capabilities/default.json.
        .plugin(tauri_plugin_http::init())
        // İşletim sisteminin kendi bildirimleri (Windows bildirim merkezi, macOS, Linux).
        .plugin(tauri_plugin_notification::init())
        // Cihaz adı için işletim sistemi ve bilgisayar adı.
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![show_main, toggle_widget, set_tray_tooltip, quit_app])
        .setup(|app| {
            build_tray(app.handle())?;
            // Geliştirme denemesi: YTN_OPEN_WIDGET=1 ile widget açılışta açılır.
            if cfg!(debug_assertions) && std::env::var("YTN_OPEN_WIDGET").as_deref() == Ok("1") {
                let _ = toggle_widget_window(app.handle());
            }
            Ok(())
        })
        // Ana pencereyi kapatmak uygulamayı tepsiye gizler; çıkış tepsi menüsünden.
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("uygulama başlatılamadı");
}
