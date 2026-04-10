import {
  call,
  type Operation,
  resource,
  spawn,
  useAbortSignal,
} from "effection";
import { join } from "@std/path";
import { ensureDir } from "@std/fs/ensure-dir";
import { stringify } from "@libs/xml/stringify";
import { parse } from "@libs/xml/parse";
import { useDownloader } from "./downloader.ts";

export interface StaticalizeOptions {
  host: URL;
  base: URL;
  dir: string;
}

export interface Staticalizer {
  urls: ReadonlySet<URL>;
  staticalize(): Operation<void>;
}

export function useStaticalizer(
  options: StaticalizeOptions,
): Operation<Staticalizer> {
  let { host, base, dir } = options;

  return resource(function* (provide) {
    let signal = yield* useAbortSignal();

    let urls: Set<URL> = yield* call(async () => {
      let url = new URL("/sitemap.xml", host);
      let response = await fetch(url, { signal });
      if (!response.ok) {
        let error = new Error(
          `GET ${url} ${response.status} ${response.statusText}`,
        );
        error.name = `SitemapError`;
        throw error;
      }
      let text = await response.text();
      let xml = parse(text, {
        flatten: { attributes: false, empty: false, text: true },
      }) as unknown as SitemapXML;

      let entries = xml.urlset.url ?? xml.urlset.urls ?? [];
      let list = Array.isArray(entries) ? entries : [entries];

      return new Set(
        list.filter(Boolean).map((entry) => {
          let loc = typeof entry === "string" ? entry : entry.loc;
          return new URL(loc);
        }),
      );
    });

    let downloader = yield* useDownloader({ host, base, outdir: dir });

    yield* provide({
      urls,
      *staticalize() {
        yield* call(() => ensureDir(dir));

        for (let url of urls) {
          yield* downloader.download(url.toString());
        }

        let sitemap = yield* spawn(function* () {
          let xml = stringify({
            urlset: {
              "@xmlns": "http://www.sitemaps.org/schemas/sitemap/0.9",
              "urls": [...urls].map((url) => {
                let loc = new URL(url);
                loc.host = base.host;
                loc.port = base.port;
                loc.protocol = base.protocol;
                return { loc: { "#text": loc } };
              }),
            },
          });
          yield* call(() =>
            Deno.writeFile(
              join(dir, "sitemap.xml"),
              new TextEncoder().encode(xml),
            )
          );
        });

        yield* sitemap;
        yield* downloader;
      },
    });
  });
}

export interface SitemapURL {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}

interface SitemapXML {
  urlset: {
    url?: SitemapEntry | SitemapEntry[];
    urls?: SitemapEntry | SitemapEntry[];
  };
}

type SitemapEntry = SitemapURL | string;
