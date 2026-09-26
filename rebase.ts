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
