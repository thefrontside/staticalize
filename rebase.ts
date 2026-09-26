/**
 * Map a url on the site being crawled onto the public base url.
 *
 * Everything the base says about where the site lives is honored, including
 * its path, so a site published under a subpath such as
 * `https://frontside.com/effection` gets that prefix on every url rewritten
 * into it. The source's own path, query and fragment are preserved.
 *
 * @param source url on the crawled site
 * @param base public base url of the site, path included
 * @returns the equivalent url on the base
 */
export function rebase(source: URL, base: URL): URL {
  let url = new URL(source.href);
  url.protocol = base.protocol;
  url.host = base.host;
  url.port = base.port;
  // `source.pathname` always begins with a `/`, so the prefix must not end
  // with one. A base without a path contributes `/`, and therefore nothing.
  url.pathname = `${base.pathname.replace(/\/$/, "")}${source.pathname}`;
  return url;
}

/**
 * A TransformStream that replaces self-referencing urls with the public base.
 *
 * There is no document to walk in a text body, so unlike the html pass this is
 * a substitution of the crawl origin rather than a rewrite of known
 * url-bearing attributes. It runs over the response as it arrives, so the
 * memory it holds is a chunk and change rather than the whole document.
 */
export class RebaseTextStream extends TransformStream<string, string> {
  #carry = "";

  constructor(host: URL, base: URL) {
    let needle = host.origin;
    // the crawl origin stands for the root of the site, so it maps onto the base
    // the same way any other url does. the result carries a trailing slash, which
    // the urls in the body bring themselves.
    let prefix = `${rebase(new URL(needle), base)}`.replace(/\/$/, "");
    // a match can straddle a chunk boundary, so hold back the longest partial
    // one and let the next chunk complete it
    let keep = needle.length - 1;

    super({
      transform: (chunk, controller) => {
        let text = (this.#carry + chunk).replaceAll(needle, prefix);
        if (text.length > keep) {
          controller.enqueue(text.slice(0, text.length - keep));
          this.#carry = text.slice(text.length - keep);
        } else {
          this.#carry = text;
        }
      },
      flush: (controller) => {
        if (this.#carry.length > 0) {
          controller.enqueue(this.#carry);
        }
      },
    });
  }
}
