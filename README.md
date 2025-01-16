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

### CLI

```
Usage: staticalize [options]

Create a static version of a website by traversing a dynamically evaluated sitemap.xml

Options:
  -h, --help                Show help
  -V, --version             Show version
  -s, --site <string>       URL of the website to staticalize. E.g. http://localhost:8000  [required]
  -o, --output <string>  Directory to place the downloaded site (default: "dist")
      --base <string>   Base URL of the public website. E.g. http://frontside.com      [required]
```

[sitemap]: https://sitemaps.org
