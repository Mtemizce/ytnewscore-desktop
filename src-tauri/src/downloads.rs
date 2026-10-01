// Panelden indirmeler (haber ZIP'i, veritabanı yedeği…) İndirilenler klasörüne kaydedilir ve
// sistem bildirimiyle haber verilir.
//
// HTTPS'te WebView2 dosyayı kendisi indirir. Düz http'de (yerel geliştirme) WebView2 "güvensiz
// indirme" diye engeller; o zaman indirme iptal edilir ve dosya panelin oturum çerezleriyle Rust
// tarafından çekilir (yalnız GET; toplu ZIP gibi POST indirmeleri http'de yapılamaz).
use std::{
    io::Write,
    path::{Path, PathBuf},
};

use tauri::{webview::DownloadEvent, AppHandle, Manager, Runtime, Url, Webview};
use tauri_plugin_http::reqwest::{self, header};
use tauri_plugin_notification::NotificationExt;

const FALLBACK_NAME: &str = "indirilen-dosya";

pub fn handle<R: Runtime>(webview: Webview<R>, event: DownloadEvent<'_>) -> bool {
    match event {
        DownloadEvent::Requested { url, destination } => {
            if url.scheme() == "http" {
                tauri::async_runtime::spawn(async move {
                    let result = fetch_with_session(&webview, url).await;
                    notify(webview.app_handle(), result);
                });
                return false;
            }
            if let Ok(dir) = webview.app_handle().path().download_dir() {
                let name = destination.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
                *destination = unique_path(&dir, &sanitize(&name));
            }
            true
        }
        DownloadEvent::Finished { path, success, .. } => {
            let result = match (success, path) {
                (true, Some(path)) => Ok(path),
                (true, None) => Err("Dosya kaydedildi ama yeri bildirilmedi.".to_string()),
                (false, _) => Err("İndirme tamamlanamadı.".to_string()),
            };
            notify(webview.app_handle(), result);
            true
        }
        _ => true,
    }
}

/// Dosyayı panel penceresinin çerezleriyle çeker. Çerez okuma Windows'ta ana iş parçacığında
/// kilitlendiği için yalnız arka plan görevinden çağrılır.
async fn fetch_with_session<R: Runtime>(webview: &Webview<R>, url: Url) -> Result<PathBuf, String> {
    let cookies = webview.cookies_for_url(url.clone()).map_err(|e| e.to_string())?;
    let cookie_header = cookies.iter().map(|c| format!("{}={}", c.name(), c.value())).collect::<Vec<_>>().join("; ");

    let mut response = reqwest::Client::new()
        .get(url.clone())
        .header(header::COOKIE, cookie_header)
        .send()
        .await
        .map_err(|e| format!("Sunucuya ulaşılamadı: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Sunucu HTTP {} döndürdü.", response.status().as_u16()));
    }

    let disposition = response.headers().get(header::CONTENT_DISPOSITION).and_then(|v| v.to_str().ok()).map(str::to_owned);
    let is_page = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.starts_with("text/html"));
    if disposition.is_none() && is_page {
        return Err("Dosya yerine sayfa döndü (oturum düşmüş olabilir).".to_string());
    }

    let name = disposition
        .as_deref()
        .and_then(filename_from_disposition)
        .or_else(|| url.path_segments().and_then(|mut s| s.next_back()).map(str::to_owned))
        .unwrap_or_default();
    let dir = webview.app_handle().path().download_dir().map_err(|e| e.to_string())?;
    let path = unique_path(&dir, &sanitize(&name));

    let mut file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        file.write_all(&chunk).map_err(|e| e.to_string())?;
    }

    Ok(path)
}

fn notify<R: Runtime>(app: &AppHandle<R>, result: Result<PathBuf, String>) {
    let (title, body) = match result {
        Ok(path) => (
            "İndirildi",
            format!("{} — İndirilenler klasörü", path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()),
        ),
        Err(error) => ("İndirilemedi", error),
    };
    let _ = app.notification().builder().title(title).body(body).show();
}

/// `filename*=UTF-8''…` (öncelikli) ya da `filename="…"`.
fn filename_from_disposition(value: &str) -> Option<String> {
    let parts: Vec<&str> = value.split(';').map(str::trim).collect();
    if let Some(encoded) = parts.iter().find_map(|p| p.strip_prefix("filename*=")) {
        let raw = encoded.split_once("''").map_or(encoded, |(_, rest)| rest);
        return Some(percent_decode(raw.trim_matches('"')));
    }
    parts
        .iter()
        .find_map(|p| p.strip_prefix("filename="))
        .map(|v| v.trim_matches('"').to_string())
        .filter(|v| !v.is_empty())
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Some(byte) = std::str::from_utf8(&bytes[i + 1..i + 3]).ok().and_then(|h| u8::from_str_radix(h, 16).ok()) {
                out.push(byte);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Windows'ta geçersiz karakterler ve klasör ayırıcıları atılır.
fn sanitize(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_control() || r#"<>:"/\|?*"#.contains(c) { '_' } else { c })
        .collect();
    let cleaned = cleaned.trim().trim_matches('.').to_string();
    if cleaned.is_empty() {
        FALLBACK_NAME.to_string()
    } else {
        cleaned
    }
}

/// Aynı adlı dosya varsa "ad (1).uzantı", "ad (2).uzantı"…
fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let path = Path::new(name);
    let stem = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| name.to_string());
    let extension = path.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    (1..)
        .map(|n| dir.join(format!("{stem} ({n}){extension}")))
        .find(|p| !p.exists())
        .unwrap_or(candidate)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_encoded_file_name_first() {
        assert_eq!(
            filename_from_disposition("attachment; filename=\"haber.zip\"; filename*=UTF-8''haber-%C3%A7%C4%B1kt%C4%B1.zip").as_deref(),
            Some("haber-çıktı.zip")
        );
        assert_eq!(filename_from_disposition("attachment; filename=\"yedek.sql.gz\"").as_deref(), Some("yedek.sql.gz"));
        assert_eq!(filename_from_disposition("inline"), None);
    }

    #[test]
    fn strips_characters_windows_does_not_allow() {
        assert_eq!(sanitize("../a:b?.zip"), "_a_b_.zip");
        assert_eq!(sanitize("  "), FALLBACK_NAME);
    }
}
