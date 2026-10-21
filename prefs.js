import Adw from "gi://Adw";
import GLib from "gi://GLib";
import Gtk from "gi://Gtk";
import Gio from "gi://Gio";

import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import { readSessions } from "./storage.js";
import {
  DEFAULT_TASK,
  formatHM,
  formatPomodoros,
  normaliseTasks,
  summarise,
} from "./utils.js";

function buildTaskRows(group, perTask) {
  if (perTask.length === 0) {
    group.add(new Adw.ActionRow({ title: "No sessions yet" }));
    return;
  }

  for (const [task, { seconds, count, pomodoros = 0 }] of perTask) {
    const row = new Adw.ActionRow({
      title: task,
      subtitle: `${count} session${count === 1 ? "" : "s"} • ${formatPomodoros(pomodoros)}`,
    });

    row.add_suffix(
      new Gtk.Label({
        label: formatHM(seconds),
        css_classes: ["dim-label"],
        valign: Gtk.Align.CENTER,
      }),
    );

    group.add(row);
  }
}

export default class FocusTrackerPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = (window._settings = this.getSettings());


    const cleanups = [];

    window.add(this._buildGeneralPage(settings, window, cleanups));
    window.add(this._buildStatsPage(window, cleanups));

    const landing = settings.get_string("prefs-page");
    if (landing) window.set_visible_page_name(landing);

    const pageId = settings.connect("changed::prefs-page", () => {
      const name = settings.get_string("prefs-page");
      if (name) window.set_visible_page_name(name);
    });
    cleanups.push(() => settings.disconnect(pageId));

    let focusIdleId = 0;
    window.connect("map", () => {
      if (focusIdleId) GLib.Source.remove(focusIdleId);
      focusIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        window.set_focus(null);
        focusIdleId = 0;
        return GLib.SOURCE_REMOVE;
      });
    });
    cleanups.push(() => {
      if (focusIdleId) {
        GLib.Source.remove(focusIdleId);
        focusIdleId = 0;
      }
    });

   
    window.connect("close-request", () => {
      for (const cleanup of cleanups) cleanup();
    });
  }

  _buildGeneralPage(settings, window, cleanups) {
    const page = new Adw.PreferencesPage({
      title: "General",
      name: "general",
      icon_name: "preferences-system-symbolic",
    });

    const entry = new Gtk.Entry({
      placeholder_text: "Task name, e.g. Deep Work",
      hexpand: true,
      valign: Gtk.Align.CENTER,
      margin_top: 8,
      margin_bottom: 8,
    });

    const addButton = new Gtk.Button({
      icon_name: "list-add-symbolic",
      tooltip_text: "Add task",
      valign: Gtk.Align.CENTER,
      css_classes: ["flat"],
    });

    const entryRow = new Adw.ActionRow();
    entryRow.add_prefix(entry);
    entryRow.add_suffix(addButton);

    const addGroup = new Adw.PreferencesGroup({
      title: "Add a task",
      description:
        "Tasks appear in the panel dropdown\u2019s \u201cSelect task\u201d menu.",
    });
    const listGroup = new Adw.PreferencesGroup({ title: "Your tasks" });

    addGroup.add(entryRow);
    page.add(addGroup);
    page.add(listGroup);

    let rows = [];

    const refresh = () => {
      rows.forEach((row) => listGroup.remove(row));

      rows = normaliseTasks(settings.get_strv("tasks-list")).map((task) => {
        const row = new Adw.ActionRow({ title: task });

        if (task === DEFAULT_TASK) {
          row.add_suffix(
            new Gtk.Label({
              label: "Default",
              css_classes: ["dim-label", "caption"],
              valign: Gtk.Align.CENTER,
            }),
          );
        } else {
          const button = new Gtk.Button({
            icon_name: "user-trash-symbolic",
            tooltip_text: `Delete “${task}”`,
            valign: Gtk.Align.CENTER,
            css_classes: ["flat"],
          });

          button.connect("clicked", () => {
            settings.set_strv(
              "tasks-list",
              normaliseTasks(
                settings.get_strv("tasks-list").filter((t) => t !== task),
              ),
            );

            if (settings.get_string("active-task") === task)
              settings.set_string("active-task", DEFAULT_TASK);
          });

          row.add_suffix(button);
        }

        listGroup.add(row);
        return row;
      });
    };

    const addTask = () => {
      const text = entry.get_text().trim();
      const tasks = normaliseTasks(settings.get_strv("tasks-list"));

      if (text && !tasks.includes(text))
        settings.set_strv("tasks-list", [...tasks, text]);

      entry.set_text("");
    };

    entry.connect("activate", addTask);
    addButton.connect("clicked", addTask);

    const tasksId = settings.connect("changed::tasks-list", refresh);
    cleanups.push(() => settings.disconnect(tasksId));

    refresh();

    return page;
  }

  _buildStatsPage(window, cleanups) {
    const page = new Adw.PreferencesPage({
      title: "Statistics",
      name: "statistics",
      icon_name: "alarm-symbolic",
    });

    const summaryGroup = new Adw.PreferencesGroup({ title: "Summary" });
    const taskGroup = new Adw.PreferencesGroup({ title: "Per-task breakdown" });

    page.add(summaryGroup);
    page.add(taskGroup);

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

    const cancellable = new Gio.Cancellable();
    cleanups.push(() => cancellable.cancel());

    readSessions(cancellable)
      .then((sessions) => {
        const {
          perTask,
          total,
          totalPomodoros,
          todayTotal,
          todayPomodoros,
          weekTotal,
          weekPomodoros,
          weekDays,
        } = summarise(sessions);

        summaryRow("Total focus time (all-time)", formatHM(total));
        summaryRow("Completed pomodoros (all-time)", formatPomodoros(totalPomodoros));
        summaryRow("Today", formatHM(todayTotal));
        summaryRow("Today — pomodoros", formatPomodoros(todayPomodoros));
        summaryRow("This week", formatHM(weekTotal));
        summaryRow("This week — pomodoros", formatPomodoros(weekPomodoros));
        summaryRow(
          "This week — daily average",
          formatHM(Math.round(weekTotal / weekDays)),
        );

        buildTaskRows(taskGroup, perTask);
      })
      .catch((e) => {
        if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
          console.error("focus-tracker: failed to load statistics", e);
      });

    return page;
  }
}
