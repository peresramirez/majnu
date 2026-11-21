# Font licenses

The font files in this folder are subsets of fonts from the [Google Fonts repository](https://github.com/google/fonts), made by [`../build.py`](../build.py) from commit [`06bfe0d62a`](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057). All seven families are licensed under the **SIL Open Font License, Version 1.1**, whose full text is at the end of this file. The OFL lets us use, modify and redistribute them, including on a website, as long as each copy keeps the copyright notice and the license; the files keep their copyright notice and the license link in their `name` table, and this file carries the full text.

| Family | Files | Copyright | Source |
|---|---|---|---|
| Gilda Display (Eduardo Tunni) | `gilda-display-latin.woff2` | Copyright 2012 The Gilda Display Project Authors (https://github.com/etunni/gilda-display) with Reserved Font Name 'Gilda'. | [ofl/gildadisplay](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/gildadisplay) |
| Hanken Grotesk (Alfredo Marco Pradil, Hanken Design Co.) | `hanken-grotesk-latin.woff2` | Copyright 2021 The Hanken Grotesk Project Authors (https://github.com/marcologous/hanken-grotesk) | [ofl/hankengrotesk](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/hankengrotesk) |
| Cormorant Garamond (Christian Thalmann) | `cormorant-garamond-latin.woff2`, `cormorant-garamond-latin-ext.woff2`, `cormorant-garamond-italic-latin.woff2`, `cormorant-garamond-italic-latin-ext.woff2` | Copyright 2015 The Cormorant Project Authors (github.com/CatharsisFonts/Cormorant) | [ofl/cormorantgaramond](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/cormorantgaramond) |
| EB Garamond (Georg Duffner, Octavio Pardo) | `eb-garamond-latin.woff2`, `eb-garamond-latin-ext.woff2`, `eb-garamond-italic-latin.woff2`, `eb-garamond-italic-latin-ext.woff2` | Copyright 2017 The EB Garamond Project Authors (https://github.com/octaviopardo/EBGaramond12) | [ofl/ebgaramond](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/ebgaramond) |
| Bricolage Grotesque (Mathieu Triay) | `bricolage-grotesque-latin.woff2`, `bricolage-grotesque-latin-ext.woff2` | Copyright 2022 The Bricolage Grotesque Project Authors (https://github.com/ateliertriay/bricolage) | [ofl/bricolagegrotesque](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/bricolagegrotesque) |
| Caveat (Impallari Type) | `caveat-latin.woff2`, `caveat-latin-ext.woff2` | Copyright 2014 The Caveat Project Authors (https://github.com/googlefonts/caveat) | [ofl/caveat](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/caveat) |
| Pinyon Script (Nicole Fally) | `pinyon-script-latin.woff2`, `pinyon-script-latin-ext.woff2` | Copyright 2024 The Pinyon Project Authors (https://github.com/SorkinType/Pinyon) | [ofl/pinyonscript](https://github.com/google/fonts/tree/06bfe0d62a98375cb09c942fa18e68bd32cff057/ofl/pinyonscript) |

## What was changed

Each file is a Modified Version in the OFL's sense: it keeps only the latin (or latin-ext) characters, drops hinting, and the variable fonts are limited to the weights the site uses (Hanken Grotesk 400 to 600, Cormorant Garamond 500 to 600, EB Garamond 400 to 500; Bricolage Grotesque has its optical size fixed at 14 and its width at 100). The outlines are otherwise unchanged.

Gilda Display reserves the name "Gilda", and a Modified Version may not use a reserved name ([OFL-FAQ 2.6 and 2.7](https://openfontlicense.org/ofl-faq/)). Our subset is therefore named **Majnu Display** inside the file, and the site's CSS calls it `display`; the copyright notice above still credits the original. No other family declares a reserved name.

## SIL Open Font License, Version 1.1

```text
This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
https://scripts.sil.org/OFL


-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```
