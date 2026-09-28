# Staticalize

The framework agnostic static site generator.

Every language has its own static site generator, and every static site
generator is made obsolete by the next static site generator that comes along to
replace it every few years. Staticalize lets you hop off that hamster wheel.

It does this by providing a _general_ mechanism to convert any dynamically
generated website into a static one. It doesn't care _what_ framework you use to
generate your content so long as it is served over HTTP and has a
[sitemap][sitemap]. It will analyze your sitemap and generate a static website
for it in the output directory of your choice. All you need to provide is url of
the server you want to staticalize and the base url of your production server.

For example, if you have the sourcecode of the frontside.com website running on
port `8000`, you can build a static version of the website fit to serve on
`frontside.com` into the `dist/` directory with the following command:

```ts
$ staticalize --site https://localhost:8000 --base http://frontside.com --output dist
```

This will read `https://localhost:800/sitemap.xml` and download the entire
website to the `dist/` directory in a format that can be served from a simple
file server running at `frontside.com`.

Wherever your site refers to itself with an absolute url, staticalize replaces
the `--site` origin with `--base`. It does this in html documents — `<a href>`,
`<link href>`, and any `src` or `content` attribute — and in textual bodies such
as `llms.txt`, markdown, feeds, json, css and javascript. Assets that are not
text are copied byte for byte. This means `--base` is the only place a
deployment has to say where it lives.

### Published somewhere other than where it is hosted

A site is not always read at the address it is served from. Effection is hosted
at `effection.netlify.app` and published at `frontside.com/effection`, which is
two answers to what had been one question: where the bytes are, and what the
content is called.

`--canonical` separates them. Urls that _name the page_ —
`<link rel=canonical>`, its `<meta property="og:url">` twin, and a
`<link rel=alternate hreflang>` saying it for another language — are rebased
onto it, while navigation, assets and the sitemap stay on `--base`:

```
$ staticalize --site http://localhost:8000 --output dist \
    --base=https://interactors.netlify.app \
    --canonical=https://frontside.com/interactors
```

The build still browses on its own at `--base`, and search engines are told to
index `--canonical` instead. That is what a preview wants too: readable at its
own alias, indexed as production.

An `alternate` without `hreflang` is left on `--base`: a feed or an `llms.txt`
is a separate file, and a file lives where the build is served.

Textual bodies follow `--canonical`, because a document like `llms.txt` is a map
telling a reader where the docs live rather than a page of the site.

`--canonical` defaults to `--base`, so a site hosted where it is published says
so by saying nothing.

### CLI

```
Usage: staticalize [OPTIONS] <site>

Arguments:
   <site>                    URL of the website to staticalize. E.g. http://localhost:8000

Options:
   --output <OUTPUT>         Directory to place the downloaded site [default: dist]
   --base <BASE>             Base URL of the public website. E.g. http://frontside.com
   --canonical [CANONICAL]   Base URL the site is published at, when that differs from where it is hosted. Only canonical urls use it. Defaults to --base.
   --strict                  Fail on the first download error instead of collecting all failures and continuing [default: false]
   -h, --help                show help
   -v, --version             show version
```

By default, staticalize downloads as much of the site as it can: any page or
asset that fails is reported at the end and the process exits non-zero, but the
run continues so you get every page that _did_ work. Pass `--strict` to fail
fast and abort the whole run on the first download error.

[sitemap]: https://sitemaps.org
