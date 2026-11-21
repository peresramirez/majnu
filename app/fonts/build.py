"""Build the self-hosted font files in app/fonts/files/ that app/fonts.ts loads.

The faces, weights, styles and subsets are the ones app/fonts.ts asked
next/font/google for before the fonts were committed (see
app/fonts/files/LICENSES.md). Each file is made the way Google Fonts makes the
files it serves to Chrome, so pages look the same:

- the source is the font in the Google Fonts repository at a pinned commit;
- axes next/font did not ask for are pinned where Google pins them, and the
  weight axis is limited to the weights in use;
- the glyphs are cut to Google's latin and latin-ext ranges, one file per
  subset as Google serves them, with the OpenType features Google keeps, and
  hinting is removed.

Run it only to change a face, a weight or a subset, then update app/fonts.ts
and LICENSES.md to match:

    uv venv /tmp/fonts-venv
    VIRTUAL_ENV=/tmp/fonts-venv uv pip install fonttools==4.68.0 brotli
    /tmp/fonts-venv/bin/python -I app/fonts/build.py app/fonts/files
"""

import io
import sys
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

GOOGLE_FONTS_COMMIT = "06bfe0d62a98375cb09c942fa18e68bd32cff057"
SOURCE = f"https://raw.githubusercontent.com/google/fonts/{GOOGLE_FONTS_COMMIT}/ofl/"

# The ranges Google Fonts' CSS gives each subset.
LATIN = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
LATIN_EXT = "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF"
# Combining accents Google also puts in its latin files, so decomposed
# accented letters (e + U+0301) still draw in the font.
MARKS = "U+0300-0301,U+0303,U+0309,U+0323"

# fontTools' default layout features plus the figure features Google keeps.
FEATURES = subset.Options().layout_features + ["lnum", "pnum", "tnum"]

# Name records Google keeps: copyright, names, version, license URL.
NAME_IDS = [0, 1, 2, 3, 4, 5, 6, 14]

# (output name, source path in google/fonts, subsets, axis limits, new name).
# Each subset becomes <output name>-<subset>.woff2.
FACES = [
    # Gilda Display reserves the name "Gilda"; a subset is a Modified Version
    # under the OFL, so it carries another name inside the file.
    ("gilda-display", "gildadisplay/GildaDisplay-Regular.ttf", ["latin"], None, ("Gilda Display", "Majnu Display")),
    ("hanken-grotesk", "hankengrotesk/HankenGrotesk[wght].ttf", ["latin"], {"wght": (400, 600)}, None),
    ("cormorant-garamond", "cormorantgaramond/CormorantGaramond[wght].ttf", ["latin", "latin-ext"], {"wght": (500, 600)}, None),
    ("cormorant-garamond-italic", "cormorantgaramond/CormorantGaramond-Italic[wght].ttf", ["latin", "latin-ext"], {"wght": (500, 600)}, None),
    ("eb-garamond", "ebgaramond/EBGaramond[wght].ttf", ["latin", "latin-ext"], {"wght": (400, 500)}, None),
    ("eb-garamond-italic", "ebgaramond/EBGaramond-Italic[wght].ttf", ["latin", "latin-ext"], {"wght": (400, 500)}, None),
    # next/font asked only for the weight axis. Google pins optical size at 14
    # (its named instances' value, not the font's default of 96) and width at 100.
    ("bricolage-grotesque", "bricolagegrotesque/BricolageGrotesque[opsz,wdth,wght].ttf", ["latin", "latin-ext"], {"opsz": 14, "wdth": 100}, None),
    ("caveat", "caveat/Caveat[wght].ttf", ["latin", "latin-ext"], None, None),
    ("pinyon-script", "pinyonscript/PinyonScript-Regular.ttf", ["latin", "latin-ext"], None, None),
]

RANGES = {"latin": f"{LATIN},{MARKS}", "latin-ext": LATIN_EXT}


def download(path: str, into: Path) -> Path:
    target = into / Path(path).name
    with urllib.request.urlopen(SOURCE + urllib.parse.quote(path)) as response:
        target.write_bytes(response.read())
    return target


def rename(font: TTFont, old: str, new: str) -> None:
    for record in font["name"].names:
        if record.nameID in (1, 3, 4, 6, 16, 18, 21):
            text = record.toUnicode()
            text = text.replace(old, new).replace(old.replace(" ", ""), new.replace(" ", ""))
            record.string = text


def instance(path: Path, limits):
    # Keep the source's timestamp, so the same commit always gives the same bytes.
    font = TTFont(path, recalcTimestamp=False)
    if not limits:
        return font
    font = instancer.instantiateVariableFont(font, limits)
    # Reload, so the subsetter sees fully decompiled tables.
    buffer = io.BytesIO()
    font.save(buffer)
    buffer.seek(0)
    return TTFont(buffer, recalcTimestamp=False)


def build(out: Path) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        for name, source, subsets, limits, new_name in FACES:
            path = download(source, Path(tmp))
            for subset_name in subsets:
                font = instance(path, limits)
                options = subset.Options()
                options.layout_features = FEATURES
                options.name_IDs = NAME_IDS
                options.hinting = False
                options.flavor = "woff2"
                subsetter = subset.Subsetter(options)
                subsetter.populate(unicodes=subset.parse_unicodes(RANGES[subset_name]))
                subsetter.subset(font)
                if new_name:
                    rename(font, *new_name)
                target = out / f"{name}-{subset_name}.woff2"
                subset.save_font(font, str(target), options)
                print(f"{target.name}: {target.stat().st_size} bytes")


if __name__ == "__main__":
    build(Path(sys.argv[1]))
