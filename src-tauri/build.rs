// Uygulama komutları izin listesiyle (ACL): kabuk ve widget hepsini, uzak panel sayfası yalnız
// `panel_action`'ı (çekmece menü, F11) çağırabilir — bkz. capabilities/default.json, panel.json.
fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
        "show_main",
        "open_panel",
        "apply_window_settings",
        "close_panel",
        "set_locked",
        "set_shell_visible",
        "system_idle_seconds",
        "toggle_widget",
        "toggle_window_fullscreen",
        "set_tray_tooltip",
        "quit_app",
        "panel_action",
    ])))
    .expect("tauri build betiği çalışmadı");
}
