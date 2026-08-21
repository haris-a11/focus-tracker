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
const DATA_VERSION = 1;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function readSessions(uuid) {
  const { file } = getFile(uuid);
  return readFile(file);
}

export function makeSession(task, start, end, duration) {
  return {
    id: GLib.uuid_string_random(),
    task,
    startTime: start.format_iso8601(),
    endTime: end.format_iso8601(),
    duration,
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
  try {
    const [bytes] = await file.load_contents_async(null);

    if (bytes.length === 0) return [];

    const data = JSON.parse(decoder.decode(bytes));

    if (data.version !== DATA_VERSION)
      throw new Error(`Unsupported data version: ${data.version}`);

    if (!Array.isArray(data.sessions)) throw new Error("Invalid sessions data");

    return data.sessions;
  } catch (e) {
    if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) {
      logError(e, `focus-tracker: failed to read ${file.get_path()}`);
    }

    return [];
  }
}

export class SessionStore {
  constructor(uuid) {
    const { dir, file } = getFile(uuid);

    this._dir = dir;
    this._file = file;

    this._sessions = [];
    this._loaded = false;
    this._queue = Promise.resolve();
  }

  _enqueue(fn) {
    const result = this._queue.then(fn);

    this._queue = result.catch(() => {});

    return result;
  }

  async _ensureLoaded() {
    if (this._loaded) return;

    this._sessions = await readFile(this._file);
    this._loaded = true;
  }

  async _writeFile() {
    try {
      await this._dir.make_directory_async(GLib.PRIORITY_DEFAULT, null);
    } catch (e) {
      if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS)) {
        throw e;
      }
    }

    const data = {
      version: DATA_VERSION,
      sessions: this._sessions,
    };

    const bytes = new GLib.Bytes(encoder.encode(JSON.stringify(data, null, 2)));

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
      await this._ensureLoaded();
      return this._sessions;
    });
  }

  append(session) {
    return this._enqueue(async () => {
      await this._ensureLoaded();

      this._sessions.push(session);

      await this._writeFile();
    });
  }
}
