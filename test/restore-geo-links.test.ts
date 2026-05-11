const {
  restoreGeoLinksInContent,
} = require('../tools/restore-geo-links.cjs');

describe('restoreGeoLinksInContent', () => {
  it('restores corrupted inline Location geo links', () => {
    const content =
      'Location:: Rennes, Bretagne, France geo:48.1113387, -1.6800198\n';

    expect(restoreGeoLinksInContent(content).content).toBe(
      'Location:: [Rennes, Bretagne, France ](geo:48.1113387,-1.6800198)\n'
    );
  });

  it('restores corrupted frontmatter location geo links', () => {
    const content =
      '---\nlocation: Rennes, Bretagne, France geo:48.1113387, -1.6800198\n---\n';

    expect(restoreGeoLinksInContent(content).content).toBe(
      '---\nlocation: [Rennes, Bretagne, France ](geo:48.1113387,-1.6800198)\n---\n'
    );
  });

  it('normalizes whitespace in already-restored geo markdown links', () => {
    const content =
      'Location:: [Rennes, Bretagne, France ](geo:48.1113387, -1.6800198)\n';

    expect(restoreGeoLinksInContent(content)).toEqual({
      content:
        'Location:: [Rennes, Bretagne, France ](geo:48.1113387,-1.6800198)\n',
      replacements: 1,
    });
  });

  it('does not rewrite already normalized geo markdown links', () => {
    const content =
      'Location:: [Rennes, Bretagne, France ](geo:48.1113387,-1.6800198)\n';

    expect(restoreGeoLinksInContent(content)).toEqual({
      content,
      replacements: 0,
    });
  });

  it('does not rewrite non-location attributes', () => {
    const content =
      'Note:: Rennes, Bretagne, France geo:48.1113387, -1.6800198\n';

    expect(restoreGeoLinksInContent(content)).toEqual({
      content,
      replacements: 0,
    });
  });
});
