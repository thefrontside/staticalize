import { close, fixed, grow, type Op, open, rgba, text } from "clayterm";
import type { Operation } from "effection";
import { DownloadApi, type DownloadResult } from "./downloader.ts";
import { render, withRegion } from "./terminal.ts";
import type { Staticalizer } from "./staticalize.ts";

export interface DownloadError {
  url: string;
  referrer: string;
}

export interface ProgressResult {
  errors: DownloadError[];
}

export interface WithProgressOptions {
  host: string;
  dir: string;
  staticalizer: Staticalizer;
}

export function* withProgress(
  options: WithProgressOptions,
): Operation<ProgressResult> {
  let { host, dir, staticalizer } = options;
  let { urls, staticalize } = staticalizer;

  let pages = new Set([...urls].map((u) => u.pathname));
  let errors: DownloadError[] = [];
  let model: Model = {
    host,
    dir,
    elapsed: 0,
    total: urls.size,
    pages: 0,
    assets: 0,
    errors: 0,
    discovered: 0,
    completed: 0,
    bytes: 0,
    url: "",
    latencies: [],
    tick: 0,
  };
  let began = performance.now();

  yield* DownloadApi.around({
    *download(args, next) {
      model.discovered++;
      model.elapsed = performance.now() - began;
      yield* render(progress(model));

      let start = performance.now();
      let result: DownloadResult = yield* next(...args);
      let [, , source] = args;
      model.completed++;
      model.latencies.push(performance.now() - start);
      model.elapsed = performance.now() - began;
      model.url = source.pathname;
      if (result.ok) {
        model.bytes += result.bytes;
        if (pages.has(source.pathname)) {
          model.pages++;
        } else {
          model.assets++;
        }
      } else {
        model.errors++;
        errors.push({ url: result.url, referrer: result.referrer });
      }
      yield* render(progress(model));
      return result;
    },
  });

  yield* withRegion(3, function* () {
    yield* render(progress(model));
    yield* staticalize();
    yield* render(done(model));
  });
  console.log();

  return { errors };
}

interface Model {
  host: string;
  dir: string;
  elapsed: number;
  total: number;
  pages: number;
  assets: number;
  errors: number;
  discovered: number;
  completed: number;
  bytes: number;
  url: string;
  latencies: number[];
  tick: number;
}

const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const dim = rgba(120, 120, 120);
const green = rgba(80, 200, 120);
const red = rgba(255, 80, 80);
const white = rgba(255, 255, 255);

function progress(model: Model): Op[] {
  let spin = frames[model.tick++ % frames.length];
  let elapsed = (model.elapsed / 1000).toFixed(1);
  let pct = model.discovered > 0 ? model.completed / model.discovered : 0;
  let width = 32;
  let filled = Math.min(width, Math.round(pct * width));
  let bar = "█".repeat(filled) + "░".repeat(width - filled);
  let err = model.errors > 0 ? `  ${model.errors} errors` : "";

  return [
    open("box", {
      layout: { direction: "ttb", width: grow(), height: fixed(3) },
    }),
    open("box", { layout: { direction: "ltr" } }),
    text(
      `${spin} ${model.host} → ${model.dir}/  ${elapsed}s  ${
        bytes(model.bytes)
      }`,
      { color: white },
    ),
    close(),
    open("box", { layout: { direction: "ltr" } }),
    text(
      `${bar}  ${model.pages}/${model.total} pages  ${model.assets} assets`,
      { color: white },
    ),
    ...(model.errors > 0 ? [text(err, { color: red })] : []),
    close(),
    open("box", { layout: { direction: "ltr" } }),
    text(model.url, { color: dim }),
    close(),
    close(),
  ];
}

function done(model: Model): Op[] {
  let elapsed = (model.elapsed / 1000).toFixed(1);
  let icon = model.errors > 0 ? "✗" : "✓";
  let color = model.errors > 0 ? red : green;
  let err = model.errors > 0 ? `  ${model.errors} errors` : "";

  return [
    open("box", {
      layout: { direction: "ttb", width: grow(), height: fixed(3) },
    }),
    open("box", { layout: { direction: "ltr" } }),
    text(
      `${icon} ${model.host} → ${model.dir}/  ${elapsed}s  ${
        bytes(model.bytes)
      }`,
      { color },
    ),
    close(),
    open("box", { layout: { direction: "ltr" } }),
    text(`${model.pages} pages  ${model.assets} assets`, { color: white }),
    ...(model.errors > 0 ? [text(err, { color: red })] : []),
    close(),
    open("box", { layout: { direction: "ltr" } }),
    text(throughput(model), { color: dim }),
    close(),
    close(),
  ];
}

function throughput(model: Model): string {
  let sorted = [...model.latencies].sort((a, b) => a - b);
  let p50 = Math.round(percentile(sorted, 0.5));
  let p99 = Math.round(percentile(sorted, 0.99));
  let rate = model.elapsed > 0
    ? Math.round(model.latencies.length / (model.elapsed / 1000))
    : 0;
  return `avg ${rate} req/s  p50 ${p50}ms  p99 ${p99}ms`;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  let i = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, i)];
}

function bytes(n: number): string {
  let units = ["B", "KB", "MB", "GB"];
  let i = n > 0 ? Math.floor(Math.log(n) / Math.log(1024)) : 0;
  return `${(n / 1024 ** i).toFixed(1)} ${units[i]}`;
}
