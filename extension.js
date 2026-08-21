import St from "gi://St";
import GObject from "gi://GObject";
import GLib from "gi://GLib";
import Clutter from "gi://Clutter";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

import { SessionStore, makeSession } from "./storage.js";
import { formatClock } from "./utils.js";

const focusButton = GObject.registerClass(
  class FocusButton extends PanelMenu.Button {
    _init(settings, store, openPreferences) {
      super._init(0.5, "Focus tracker button");
      this._settings = settings;
      this._store = store;
      this._openPreferences = openPreferences;
      this._box = new St.BoxLayout({
        style_class: "focus-box",
      });

      this._icon = new St.Icon({
        icon_name: "alarm-symbolic",
        style_class: "system-status-icon",
      });

      this._label = new St.Label({
        text: "00:00",
        style_class: "focus-label",
        y_align: Clutter.ActorAlign.CENTER,
      });

      this._box.add_child(this._icon);
      this._box.add_child(this._label);

      this.add_child(this._box);

      this._startedAt = 0;
      this._sessionStart = null;
      this._timeoutId = 0;
      this._isRunning = false;
      this._accumulated = 0;

      this._label.visible = false;
      this._currentTask = new PopupMenu.PopupMenuItem("", { reactive: false });
      this._taskMenu = new PopupMenu.PopupSubMenuMenuItem("Select task");
      this.menu.addMenuItem(this._currentTask);
      this.menu.addMenuItem(this._taskMenu);

      this._settings.connectObject(
        "changed::tasks-list",
        () => this._refreshTasks(),
        "changed::active-task",
        () => this._refreshTasks(),
        this,
      );

      this._refreshTasks();
      const statsItem = new PopupMenu.PopupMenuItem("Statistics");
      statsItem.connect("activate", () => this._openPrefs("statistics"));
      this.menu.addMenuItem(statsItem);

      const tasksItem = new PopupMenu.PopupMenuItem("Manage tasks");
      tasksItem.connect("activate", () => this._openPrefs("general"));
      this.menu.addMenuItem(tasksItem);

      const resetItem = new PopupMenu.PopupMenuItem("Reset");
      resetItem.connect("activate", () => {
        this._reset();
      });
      const saveItem = new PopupMenu.PopupMenuItem("Save");
      saveItem.connect("activate", () => {
        this._saveTask();
      });
      this.menu.addMenuItem(saveItem);
      this.menu.addMenuItem(resetItem);
    }

    _refreshTasks() {
      const active = this._settings.get_string("active-task");
      this._currentTask.label.text = `Task: ${active || "none"}`;
      this._taskMenu.menu.removeAll();

      this._settings.get_strv("tasks-list").forEach((task) => {
        const item = new PopupMenu.PopupMenuItem(task);
        item.setOrnament(
          task === active ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE,
        );
        item.connect("activate", () =>
          this._settings.set_string("active-task", task),
        );
        this._taskMenu.menu.addMenuItem(item);
      });
    }
    _openPrefs(pageName) {
      this._settings.set_string("prefs-page", pageName);
      this.menu.close();
      this._openPreferences();
    }

    vfunc_event(event) {
      if (event.type() === Clutter.EventType.BUTTON_PRESS) {
        const button = event.get_button();

        if (button === Clutter.BUTTON_PRIMARY) {
          if (this.menu.isOpen) this.menu.close();
          this._toggle();
          return Clutter.EVENT_STOP;
        }

        if (button === Clutter.BUTTON_SECONDARY) {
          this.menu.toggle();
          return Clutter.EVENT_STOP;
        }
      }
      return Clutter.EVENT_PROPAGATE;
    }
    _elapsed() {
      if (!this._isRunning) return this._accumulated;

      return this._accumulated + (GLib.get_monotonic_time() - this._startedAt);
    }

    _start() {
      if (!this._sessionStart) {
        this._sessionStart = GLib.DateTime.new_now_local();
      }
      this._startedAt = GLib.get_monotonic_time();
      this._isRunning = true;

      this._icon.icon_name = "media-playback-pause-symbolic";

      this._label.visible = true;
      this._label.text = formatClock(this._elapsed());

      this._stopTicking();

      this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
        this._label.text = formatClock(this._elapsed());
        return GLib.SOURCE_CONTINUE;
      });
    }

    _pause() {
      this._accumulated += GLib.get_monotonic_time() - this._startedAt;

      this._isRunning = false;

      this._icon.icon_name = "media-playback-start-symbolic";

      this._stopTicking();
    }

    _toggle() {
      if (this._isRunning) {
        this._pause();
      } else {
        this._start();
      }
    }

    _reset() {
      this._accumulated = 0;
      this._startedAt = 0;
      this._isRunning = false;
      this._sessionStart = null;

      this._icon.icon_name = "alarm-symbolic";

      this._label.text = "00:00";
      this._label.visible = false;

      this._stopTicking();
    }
    _saveTask() {
      const elapsed = this._elapsed();
      if (elapsed <= 0 || !this._sessionStart) return;

      const session = makeSession(
        this._settings.get_string("active-task") || "none",
        this._sessionStart,
        GLib.DateTime.new_now_local(),
        Math.round(elapsed / 1e6),
      );

      this._reset();

      this._store
        .append(session)
        .catch((e) => logError(e, "focus-tracker: failed to save session"));
    }

    _stopTicking() {
      if (this._timeoutId) {
        GLib.source_remove(this._timeoutId);
        this._timeoutId = 0;
      }
    }

    destroy() {
      this._stopTicking();
      super.destroy();
    }
  },
);
export default class FocusTracker extends Extension {
  enable() {
    this._settings = this.getSettings();

    this._store = new SessionStore(this.uuid, (message) =>
      Main.notifyError("Focus Tracker", message),
    );

    this._store.load().catch((e) => {
      logError(e, "focus-tracker: failed to load session store");
    });

    this._indicator = new focusButton(this._settings, this._store, () =>
      this.openPreferences(),
    );

    Main.panel.addToStatusArea(this.uuid, this._indicator);
  }

  disable() {
    this._indicator.destroy();
    this._indicator = null;
    this._settings = null;
    this._store = null;
  }
}
