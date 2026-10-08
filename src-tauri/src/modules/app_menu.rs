use std::io;

use tauri::{
    menu::{CheckMenuItem, Menu, MenuEvent, MenuId, MenuItem, PredefinedMenuItem},
    AppHandle, Emitter, Manager, Runtime,
};

const GUARDED_QUIT_MENU_ID: &str = "terax.quit";
const TOGGLE_SOLUTION_MENU_ID: &str = "terax.view.toggle_solution";
const TOGGLE_DEBUG_MENU_ID: &str = "terax.view.toggle_debug";
const QUIT_ACCELERATOR: &str = "Command+Q";

fn invalid_default_menu(message: &'static str) -> tauri::Error {
    io::Error::new(io::ErrorKind::InvalidData, message).into()
}

fn is_guarded_quit(id: &MenuId) -> bool {
    id == GUARDED_QUIT_MENU_ID
}

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let menu = Menu::default(app)?;
    let submenus = menu.items()?;

    // Enhance macOS app menu with guarded quit
    if let Some(app_menu) = submenus.first().and_then(|item| item.as_submenu().cloned()) {
        let items = app_menu.items()?;
        if let Some(quit_index) = items.len().checked_sub(1) {
            if let Some(native_quit) = items[quit_index].as_predefined_menuitem() {
                let quit_text = native_quit.text()?;
                if quit_text == "Quit" || quit_text.starts_with("Quit ") {
                    let guarded_quit = MenuItem::with_id(
                        app,
                        GUARDED_QUIT_MENU_ID,
                        quit_text,
                        true,
                        Some(QUIT_ACCELERATOR),
                    )?;
                    app_menu.remove_at(quit_index)?;
                    app_menu.insert(&guarded_quit, quit_index)?;
                }
            }
        }
    }

    // Enhance View menu with Solution and Debug checkboxes
    for item in &submenus {
        if let Some(submenu) = item.as_submenu() {
            if let Ok(title) = submenu.text() {
                if title == "View" {
                    let sep = PredefinedMenuItem::separator(app)?;
                    let solution_item = CheckMenuItem::with_id(
                        app,
                        TOGGLE_SOLUTION_MENU_ID,
                        "Solution",
                        true,
                        true,
                        None::<&str>,
                    )?;
                    let debug_item = CheckMenuItem::with_id(
                        app,
                        TOGGLE_DEBUG_MENU_ID,
                        "Debug",
                        true,
                        true,
                        None::<&str>,
                    )?;

                    submenu.append(&sep)?;
                    submenu.append(&solution_item)?;
                    submenu.append(&debug_item)?;
                    break;
                }
            }
        }
    }

    Ok(menu)
}

pub fn handle_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    if is_guarded_quit(event.id()) {
        let Some(main) = app.get_webview_window("main") else {
            app.exit(0);
            return;
        };

        let _ = main.unminimize();
        let _ = main.show();
        let _ = main.set_focus();
        if let Err(error) = main.close() {
            log::error!("could not request guarded app quit: {error}");
        }
        return;
    }

    if event.id() == TOGGLE_SOLUTION_MENU_ID {
        let _ = app.emit("terax://menu-toggle-solution", ());
    } else if event.id() == TOGGLE_DEBUG_MENU_ID {
        let _ = app.emit("terax://menu-toggle-debug", ());
    }
}

#[cfg(test)]
mod tests {
    use super::{is_guarded_quit, GUARDED_QUIT_MENU_ID};
    use tauri::menu::MenuId;

    #[test]
    fn only_guarded_quit_id_requests_window_close() {
        assert!(is_guarded_quit(&MenuId::new(GUARDED_QUIT_MENU_ID)));
        assert!(!is_guarded_quit(&MenuId::new("unrelated")));
    }
}
