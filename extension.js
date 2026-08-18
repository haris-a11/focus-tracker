import St from "gi://St";
import GObject from "gi://GObject";
import GLib from "gi://GLib";
import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import Pango from "gi://Pango";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

Gio._promisify(Gio.File.prototype, "load_contents_async");
Gio._promisify(Gio.File.prototype, "make_directory_async");
Gio._promisify(
  Gio.File.prototype,
  "replace_contents_bytes_async",
  "replace_contents_finish",
);

function format(us) {
  const ms = Math.floor(us / 1000);
  const s = Math.floor(ms / 1000) % 60;
  const m = Math.floor(ms / 60000) % 60;
  const h = Math.floor(ms / 3600000);
  const pad = (n) => `${n}`.padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

const focusButton = GObject.registerClass(
  class FocusButton extends PanelMenu.Button {
    _init(uuid) {
      super._init(0.5, "Focus tracker button");

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
      this._timeoutId = 0;
      this._isRunning = false;
      this._accumulated = 0;

      this._label.visible = false;

      const resetItem = new PopupMenu.PopupMenuItem("Reset");

      resetItem.connect("activate", () => {
        this._reset();
      });

      this.menu.addMenuItem(resetItem);
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
      this._startedAt = GLib.get_monotonic_time();
      this._isRunning = true;

      this._icon.icon_name = "media-playback-pause-symbolic";

      this._label.visible = true;
      this._label.text = format(this._elapsed());

      this._stopTicking();

      this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
        this._label.text = format(this._elapsed());
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

      this._icon.icon_name = "alarm-symbolic";

      this._label.text = "00:00";
      this._label.visible = false;

      this._stopTicking();
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
    // this._settings = this.getSettings();

    this._indicator = new focusButton(this.uuid);
    Main.panel.addToStatusArea(this.uuid, this._indicator);
  }

  disable() {
    this._indicator.destroy();
    this._indicator = null;
  }
}
