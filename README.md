# LNReader Plugins

<p>
<img alt="LNReader plugins counting" src="https://raw.githubusercontent.com/LNReader/lnreader-plugins/plugins/v2.2.0/total.svg">
<img alt="GitHub issues by-label"  src="https://img.shields.io/github/issues/lnreader/lnreader-plugins/Source%20Request?color=success&label=source%20requests">
<img  alt="GitHub issues by-label"  src="https://img.shields.io/github/issues/lnreader/lnreader-plugins/Bug?color=red&label=bugs">
</p>

Repository to host plugins and related issues, and requests for
[LNReader](https://github.com/LNReader/lnreader).

## Installing

-   Prerequisites: Nodejs >= 18

1. `npm install`

## Contributing

-   [Quick start](./docs/quickstart.md)
-   [Documentation](./docs/docs.md)

## Testing

#### via the testing website

1. Run `npm start` and open `localhost:3000` to test!

[Detailed tutorial for testing website](./docs/website-tutorial.md)

#### via an app

1. Run `npm run host-linux` or `npm run host-windows` (depending on your operating system)
2. Change the values in [pluginManager.ts](https://github.com/LNReader/lnreader/blob/master/src/plugins/pluginManager.ts) (in-app) to yours 

```ts
const githubUsername = "LNReader";
const githubRepository = "lnreader-plugins";
```

---

The developer of this application does not have any affiliation with the content providers available.
