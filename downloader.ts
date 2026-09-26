import {
  type Operation,
  resource,
  sleep,
  until,
  useAbortSignal,
} from "effection";
import { dirname, join, normalize } from "@std/path";
import { ensureDir } from "@std/fs/ensure-dir";
import { fromHtml } from "hast-util-from-html";
import { toHtml } from "hast-util-to-html";
import { selectAll } from "hast-util-select";
import { useTaskBuffer } from "./task-buffer.ts";
import { rebase, rebaseText } from "./rebase.ts";
import { createApi } from "@effectionx/context-api";

export interface Downloader extends Operation<void> {
  download(spec: string, context?: URL): Operation<void>;
}

export interface DownloaderOptions {
  host: URL;
  base: URL;
  outdir: string;
  strict?: boolean;
  concurrency?: number;
  retries?: number;
}

export type DownloadResult =
  | { ok: true; bytes: number }
  | { ok: false; url: string; referrer: string; error: Error };

export const DownloadApi = createApi("@staticalize/download", {
  *download(
    downloader: Downloader,
    opts: DownloaderOptions,
    source: URL,
    referrer: URL,
  ): Operation<DownloadResult> {
    let { host, base, outdir, strict, retries = 3 } = opts;
    let signal = yield* useAbortSignal();
    let path = normalize(join(outdir, source.pathname));

    let fail = (error: Error): DownloadResult => {
      if (strict) {
        throw error;
      }
      return {
        ok: false,
        url: source.toString(),
        referrer: referrer.toString(),
        error,
      };
    };

    try {
      let response = yield* fetchWithRetry(source.toString(), signal, retries);

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
            link.properties.href = rebase(new URL(href), base).href;
          }
        }

        // anchors are rewritten but not followed: the sitemap says what the
        // site is made of, and downloading every link would crawl past it
        let anchors = selectAll("a[href]", html);

        for (let anchor of anchors) {
          let href = anchor.properties.href as string;

          if (href.startsWith(host.origin)) {
            anchor.properties.href = rebase(new URL(href), base).href;
          }
        }

        let assets = selectAll("[src]", html);

        for (let element of assets) {
          let src = element.properties.src as string;
          yield* downloader.download(src, source);

          // replace self-referencing absolute urls with the destination site
          if (src.startsWith(host.origin)) {
            element.properties.src = rebase(new URL(src), base).href;
          }
        }

        let withContents = selectAll("[content]", html);
        for (let element of withContents) {
          let attr = String(element.properties.content);
          if (attr.startsWith(host.origin)) {
            yield* downloader.download(attr, source);
            element.properties.content = rebase(new URL(attr), base).href;
          }
        }

        let output = toHtml(html);
        let destdir = dirname(destpath);
        yield* until(ensureDir(destdir));
        yield* until(Deno.writeTextFile(destpath, output));
        return {
          ok: true,
          bytes: new TextEncoder().encode(output).byteLength,
        };
      } else if (isTextual(response.headers.get("Content-Type"))) {
        let content = yield* until(response.text());
        let output = rebaseText(content, host, base);
        let destdir = dirname(path);
        yield* until(ensureDir(destdir));
        yield* until(Deno.writeTextFile(path, output));
        return {
          ok: true,
          bytes: new TextEncoder().encode(output).byteLength,
        };
      } else {
        let size = Number(response.headers.get("Content-Length") ?? 0);
        let destdir = dirname(path);
        yield* until(ensureDir(destdir));
        yield* until(Deno.writeFile(path, response.body!));
        return { ok: true, bytes: size };
      }
    } catch (cause: unknown) {
      return fail(
        cause instanceof Error
          ? new Error(`could not download ${source}`, { cause })
          : new Error(`could not download ${source}`),
      );
    }
  },
});

/**
 * Is this a content type whose body is text we can rewrite urls in?
 *
 * Everything else is streamed to disk byte for byte, so a binary body is never
 * decoded and re-encoded.
 */
function isTextual(contentType: string | null): boolean {
  if (!contentType) {
    return false;
  }
  let type = contentType.split(";")[0].trim().toLowerCase();
  return type.startsWith("text/") ||
    type.endsWith("+json") ||
    type.endsWith("+xml") ||
    ["application/json", "application/xml", "application/javascript"].includes(
      type,
    );
}

function* fetchWithRetry(
  url: string,
  signal: AbortSignal,
  retries: number,
): Operation<Response> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // exponential backoff: 1s, 2s, 4s, ...
      yield* sleep(1000 * 2 ** (attempt - 1));
    }

    try {
      let response = yield* until(fetch(url, { signal }));
      if (response.ok) {
        return response;
      }
      lastError = new Error(
        `GET ${url} responded ${response.status} ${response.statusText}`,
      );
    } catch (cause) {
      lastError = new Error(`could not download ${url}`, { cause });
    }
  }
  throw lastError!;
}

const { download } = DownloadApi.operations;

export function useDownloader(opts: DownloaderOptions): Operation<Downloader> {
  let seen = new Map<string, boolean>();
  return resource(function* (provide) {
    let { host, concurrency = 75 } = opts;

    let buffer = yield* useTaskBuffer(concurrency);

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
