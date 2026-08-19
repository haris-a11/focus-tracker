import Adw from "gi://Adw";
import Gtk from "gi://Gtk";

import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

export default class FocusTrackerPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = (window._settings = this.getSettings());

    const entry = new Adw.EntryRow({
      title: "Add Task",
      show_apply_button: true,
    });
    const addGroup = new Adw.PreferencesGroup({ title: "Task Settings" });
    const listGroup = new Adw.PreferencesGroup({ title: "Tasks List" });
    const page = new Adw.PreferencesPage({
      title: "General",
      icon_name: "preferences-system-symbolic",
    });

    addGroup.add(entry);
    page.add(addGroup);
    page.add(listGroup);
    window.add(page);

    let rows = [];

    const refresh = () => {
      rows.forEach((r) => listGroup.remove(r));
      rows = settings.get_strv("tasks-list").map((task) => {
        const row = new Adw.ActionRow({ title: task });
        const btn = new Gtk.Button({
          icon_name: "list-remove-symbolic",
          valign: Gtk.Align.CENTER,
          css_classes: ["flat"],
        });
        btn.connect("clicked", () =>
          settings.set_strv(
            "tasks-list",
            settings.get_strv("tasks-list").filter((t) => t !== task),
          ),
        );
        row.add_suffix(btn);
        listGroup.add(row);
        return row;
      });
    };

    entry.connect("apply", () => {
      const text = entry.get_text().trim();
      const tasks = settings.get_strv("tasks-list");
      if (text && !tasks.includes(text))
        settings.set_strv("tasks-list", [...tasks, text]);
      entry.set_text("");
    });

    settings.connect("changed::tasks-list", refresh);
    refresh();
    window.set_focus(null);
  }
}
