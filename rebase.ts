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
 * Replace self-referencing absolute urls in a text body with the public base.
 *
 * There is no document to walk in a text body, so unlike the html pass this is
 * a substitution of the crawl origin rather than a rewrite of known
 * url-bearing attributes.
 *
 * @param body text served by the crawled site
 * @param host url of the site being crawled
 * @param base public base url of the site, path included
 * @returns the body with every url on the crawled site pointing at the base
 */
export function rebaseText(body: string, host: URL, base: URL): string {
  // the crawl origin stands for the root of the site, so it maps onto the base
  // the same way any other url does. the result carries a trailing slash, which
  // the urls in the body bring themselves.
  let prefix = `${rebase(new URL(host.origin), base)}`.replace(/\/$/, "");
  return body.replaceAll(host.origin, prefix);
}
