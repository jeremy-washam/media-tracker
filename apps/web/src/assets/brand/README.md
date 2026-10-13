# Imladris brand assets

The sidebar uses the owner-selected refined compact **J2** house-and-waterfall
symbol at 30 px, with a 20 px, weight-500 system-font Imladris wordmark in the
expanded sidebar. The collapsed sidebar hides the wordmark. The owner removed
the custom-font wordmark after the October 12 explorations, then approved this
system-font treatment. No custom brand font is bundled or loaded; interface
text uses system typography. The brand link retains its accessible Imladris name.

`imladris-symbol.svg` is the native-path compact mark, used as a CSS mask so it
inherits the current text color. `favicon.svg` adapts its ink to system appearance;
the PNG favicon and touch icon are fallback exports. These files live under
`src`, so Vite includes them as source assets.

Original concepts, retained favorites, vector refinements, and font comparisons
with source files and licenses remain in `docs/design/logo-exploration` as history.
