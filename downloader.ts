import {
  call,
  type Operation,
  resource,
  until,
  useAbortSignal,
} from "effection";
import { dirname, join, normalize } from "@std/path";
import { ensureDir } from "@std/fs/ensure-dir";
import { fromHtml } from "hast-util-from-html";
import { toHtml } from "hast-util-to-html";
import { selectAll } from "hast-util-select";
import { useTaskBuffer } from "./task-buffer.ts";
import { createApi } from "@effectionx/context-api";

export interface Downloader extends Operation<void> {
  download(spec: string, context?: URL): Operation<void>;
}

export interface DownloaderOptions {
  host: URL;
  base: URL;
  outdir: string;
}

export type DownloadResult =
  | { ok: true; bytes: number }
  | { ok: false; url: string; referrer: string };

export const DownloadApi = createApi("@staticalize/download", {
  *download(
    downloader: Downloader,
    opts: DownloaderOptions,
    source: URL,
    referrer: URL,
  ): Operation<DownloadResult> {
    let { host, base, outdir } = opts;
    let signal = yield* useAbortSignal();
    let path = normalize(join(outdir, source.pathname));

    let response = yield* until(fetch(source.toString(), { signal }));
    if (response.ok) {
      if (response.headers.get("Content-Type")?.includes("html")) {
        let destpath = join(path, "index.html");
        let content = yield* until(response.text());
        let html = fromHtml(content);

        let links = selectAll("link[href]", html);

        for (let link of links) {
          let href = link.properties.href as string;
          yield* downloader.download(href, source);

          // replace self-referencing absolute urls with the destination site
          if (href.startsWith(host.origin)) {
            let url = new URL(href);
            url.host = base.host;
            url.port = base.port;
            url.protocol = base.protocol;
            link.properties.href = url.href;
          }
        }

        let assets = selectAll("[src]", html);

        for (let element of assets) {
          let src = element.properties.src as string;
          yield* downloader.download(src, source);

          // replace self-referencing absolute urls with the destination site
          if (src.startsWith(host.origin)) {
            let url = new URL(src);
            url.host = base.host;
            url.port = base.port;
            url.protocol = base.protocol;
            element.properties.src = url.href;
          }
        }

        let withContents = selectAll("[content]", html);
        for (let element of withContents) {
          let attr = String(element.properties.content);
          if (attr.startsWith(host.origin)) {
            yield* downloader.download(attr, source);
            let url = new URL(attr);
            url.host = base.host;
            url.port = base.port;
            url.protocol = base.protocol;
            element.properties.content = url.href;
          }
        }

        let output = toHtml(html);
        yield* call(async () => {
          let destdir = dirname(destpath);
          await ensureDir(destdir);
          await Deno.writeTextFile(destpath, output);
        });
        return { ok: true, bytes: new TextEncoder().encode(output).byteLength };
      } else {
        let size = Number(response.headers.get("Content-Length") ?? 0);
        yield* call(async () => {
          let destdir = dirname(path);
          await ensureDir(destdir);
          await Deno.writeFile(path, response.body!);
        });
        return { ok: true, bytes: size };
      }
    } else {
      return {
        ok: false,
        url: source.toString(),
        referrer: referrer.toString(),
      };
    }
  },
});

const { download } = DownloadApi.operations;

export function useDownloader(opts: DownloaderOptions): Operation<Downloader> {
  let seen = new Map<string, boolean>();
  return resource(function* (provide) {
    let { host } = opts;

    let buffer = yield* useTaskBuffer(75);

    let downloader: Downloader = {
      *download(loc, context = host) {
        if (loc.startsWith("//")) {
          return;
        }
        let source = loc.match(/^\w+:/) ? new URL(loc) : new URL(loc, context);
        if (source.host !== host.host) {
          return;
        }
        let key = source.href;
        if (seen.get(key)) {
          return;
        }
        seen.set(key, true);

        yield* buffer.spawn(() => download(downloader, opts, source, context));
      },
      *[Symbol.iterator]() {
        yield* buffer;
      },
    };

    yield* provide(downloader);
  });
}
