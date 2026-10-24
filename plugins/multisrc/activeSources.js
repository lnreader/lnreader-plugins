// Sources marked `"options": { "down": true }` in a generator's sources.json
// stay listed there for reference but are not generated, so dead sites are
// not published as working plugins.
export const activeSources = (sources, generator) =>
  sources.filter(source => {
    if (source.options?.down) {
      console.log(`[${generator}]: Skipping down source`, source.id);
      return false;
    }
    return true;
  });
