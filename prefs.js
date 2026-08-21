import Adw from "gi://Adw";
import Gtk from "gi://Gtk";

import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import { readSessions } from "./storage.js";
import { formatHM, summarise } from "./utils.js";

function buildTaskTable(perTask) {
  const grid = new Gtk.Grid({
    column_homogeneous: true,
    css_classes: ["card"],
  });

  const cell = (text, row, col, isHeader) => {
    grid.attach(
      new Gtk.Label({
        label: text,
        halign: Gtk.Align.START,
        css_classes: isHeader ? ["dim-label", "caption-heading"] : [],
        margin_start: 12,
        margin_end: 12,
        margin_top: 8,
        margin_bottom: 8,
      }),
      col,
      row,
      1,
      1,
    );
  };

  cell("Task", 0, 0, true);
  cell("Total time", 0, 1, true);
  cell("Sessions", 0, 2, true);

  if (perTask.length === 0) {
    cell("No sessions yet", 1, 0, false);
    return grid;
  }

  perTask.forEach(([task, { seconds, count }], i) => {
    cell(task, i + 1, 0, false);
    cell(formatHM(seconds), i + 1, 1, false);
    cell(`${count}`, i + 1, 2, false);
  });

  return grid;
}

export default class FocusTrackerPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = (window._settings = this.getSettings());

    window.add(this._buildGeneralPage(settings));
    window.add(this._buildStatsPage(window));

    const landing = settings.get_string("prefs-page");
    if (landing) window.set_visible_page_name(landing);

    settings.connect("changed::prefs-page", () => {
      const name = settings.get_string("prefs-page");
      if (name) window.set_visible_page_name(name);
    });

    window.set_focus(null);
  }

  _buildGeneralPage(settings) {
    const page = new Adw.PreferencesPage({
      title: "General",
      name: "general",
      icon_name: "preferences-system-symbolic",
    });

    const entry = new Adw.EntryRow({
      title: "Add Task",
      show_apply_button: true,
    });

    const addGroup = new Adw.PreferencesGroup({ title: "Task Settings" });
    const listGroup = new Adw.PreferencesGroup({ title: "Tasks List" });

    addGroup.add(entry);
    page.add(addGroup);
    page.add(listGroup);

    let rows = [];

    const refresh = () => {
      rows.forEach((row) => listGroup.remove(row));

      rows = settings.get_strv("tasks-list").map((task) => {
        const row = new Adw.ActionRow({ title: task });
        const button = new Gtk.Button({
          icon_name: "list-remove-symbolic",
          valign: Gtk.Align.CENTER,
          css_classes: ["flat"],
        });

        button.connect("clicked", () => {
          settings.set_strv(
            "tasks-list",
            settings.get_strv("tasks-list").filter((t) => t !== task),
          );

          if (settings.get_string("active-task") === task)
            settings.set_string("active-task", "");
        });

        row.add_suffix(button);
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

    return page;
  }

  _buildStatsPage(window) {
    const page = new Adw.PreferencesPage({
      title: "Statistics",
      name: "statistics",
      icon_name: "alarm-symbolic",
    });

    const summaryGroup = new Adw.PreferencesGroup({ title: "Summary" });
    const taskGroup = new Adw.PreferencesGroup({ title: "Per-task breakdown" });

    page.add(summaryGroup);
    page.add(taskGroup);

    // The window can close before the read resolves; adding rows to a
    // destroyed widget throws.
    let alive = true;
    window.connect("destroy", () => (alive = false));

    const summaryRow = (title, value) => {
      const row = new Adw.ActionRow({ title });
      row.add_suffix(
        new Gtk.Label({
          label: value,
          css_classes: ["dim-label"],
          valign: Gtk.Align.CENTER,
        }),
      );
      summaryGroup.add(row);
    };

    readSessions(this.uuid)
      .then((sessions) => {
        if (!alive) return;

        const { perTask, total, todayTotal, weekTotal, weekDays } =
          summarise(sessions);

        summaryRow("Total focus time (all-time)", formatHM(total));
        summaryRow("Today", formatHM(todayTotal));
        summaryRow("This week", formatHM(weekTotal));
        summaryRow(
          "This week — daily average",
          formatHM(Math.round(weekTotal / weekDays)),
        );

        taskGroup.add(buildTaskTable(perTask));
      })
      .catch((e) => logError(e, "focus-tracker: failed to load statistics"));

    return page;
  }
}
