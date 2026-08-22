import GLib from "gi://GLib";
import Gio from "gi://Gio";

Gio._promisify(
  Gio.File.prototype,
  "load_contents_async",
  "load_contents_finish",
);

Gio._promisify(
  Gio.File.prototype,
  "replace_contents_bytes_async",
  "replace_contents_finish",
);

Gio._promisify(Gio.File.prototype, "make_directory_async");

const FILE_NAME = "sessions.json";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function readSessions(uuid) {
  const { file } = getFile(uuid);
  const { sessions } = await readFile(file);

  return sessions;
}

export function makeSession(
  task,
  startTime,
  endTime,
  duration,
  type = "stopwatch",
) {
  return {
    id: GLib.uuid_string_random(),
    task,
    mode: type,
    start: startTime.format_iso8601(),
    end: endTime.format_iso8601(),
    duration_seconds: duration,
  };
}

function getFile(uuid) {
  const dir = GLib.build_filenamev([GLib.get_user_data_dir(), uuid]);

  return {
    dir: Gio.File.new_for_path(dir),
    file: Gio.File.new_for_path(GLib.build_filenamev([dir, FILE_NAME])),
  };
}

async function readFile(file) {
  let bytes;

  try {
    [bytes] = await file.load_contents_async(null);
  } catch (e) {
    if (e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
      return { sessions: [], ok: true };

    console.error(`focus-tracker: failed to read ${file.get_path()}`, e);
    return { sessions: [], ok: false };
  }

  if (bytes.length === 0) return { sessions: [], ok: true };

  try {
    const data = JSON.parse(decoder.decode(bytes));

    if (!Array.isArray(data)) throw new Error("Invalid sessions data");

    return { sessions: data, ok: true };
  } catch (e) {
    console.error(`focus-tracker: ${file.get_path()} is unreadable`, e);
    return { sessions: [], ok: false };
  }
}

export class SessionStore {
  constructor(uuid, onError = null) {
    const { dir, file } = getFile(uuid);

    this._dir = dir;
    this._file = file;

    this._sessions = [];
    this._loaded = false;
    this._queue = Promise.resolve();

    this._onError = onError;
    this._reported = false;
  }

  _enqueue(fn) {
    const result = this._queue.then(fn);

    this._queue = result.catch(() => {});

    return result;
  }

  _report(message) {
    if (this._reported || !this._onError) return;

    this._reported = true;
    this._onError(message);
  }

  async _ensureLoaded() {
    if (this._loaded) return true;

    const { sessions, ok } = await readFile(this._file);

    if (!ok) {
      this._report(
        "Could not read your saved sessions. New sessions will not be " +
          "saved until this is fixed.",
      );
      return false;
    }

    this._sessions = sessions;
    this._loaded = true;
    this._reported = false;

    return true;
  }

  async _writeFile() {
    try {
      await this._dir.make_directory_async(GLib.PRIORITY_DEFAULT, null);
    } catch (e) {
      if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS)) {
        throw e;
      }
    }

    const bytes = new GLib.Bytes(
      encoder.encode(JSON.stringify(this._sessions, null, 2)),
    );

    await this._file.replace_contents_bytes_async(
      bytes,
      null,
      false,
      Gio.FileCreateFlags.REPLACE_DESTINATION,
      null,
    );
  }

  load() {
    return this._enqueue(async () => {
      if (!(await this._ensureLoaded()))
        throw new Error("focus-tracker: could not read sessions.json");

      return this._sessions;
    });
  }

  append(session) {
    return this._enqueue(async () => {
      if (!(await this._ensureLoaded()))
        throw new Error(
          "focus-tracker: sessions.json unreadable, refusing to overwrite it",
        );

      this._sessions.push(session);

      await this._writeFile();
    });
  }
}
