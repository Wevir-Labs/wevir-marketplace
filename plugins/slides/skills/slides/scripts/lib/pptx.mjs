// Writes a PowerPoint file whose slides are full-bleed pictures of the rendered deck, with the speaker notes
// as real notes and each slide's text as the picture's alt text.
import { xmlEscape as x, zip } from './zip.mjs';

const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CT = 'application/vnd.openxmlformats-officedocument.presentationml';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const EMU_W = 12192000; // 13.333 in, 16:9
const EMU_H = 6858000; // 7.5 in
const NOTES_W = 6858000;
const NOTES_H = 9144000;

const rels = (items) =>
  `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items
    .map(([id, type, target]) => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`)
    .join('')}</Relationships>`;

const GROUP = `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>`;
const CLR_MAP = `<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>`;

function theme(name) {
  const sys = (n, v) => `<a:${n}><a:srgbClr val="${v}"/></a:${n}>`;
  const fill = (lum) =>
    `<a:solidFill><a:schemeClr val="phClr">${lum ? `<a:lumMod val="${lum}"/>` : ''}</a:schemeClr></a:solidFill>`;
  const line = (w) => `<a:ln w="${w}" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>`;
  return `${XML}<a:theme xmlns:a="${NS_A}" name="${name}"><a:themeElements><a:clrScheme name="Wevir">${sys('dk1', '1A1A1A')}${sys('lt1', 'FFFFFF')}${sys('dk2', '2E3440')}${sys('lt2', 'F4F3EF')}${sys('accent1', '2B6CB0')}${sys('accent2', 'DD6B20')}${sys('accent3', '2F855A')}${sys('accent4', '805AD5')}${sys('accent5', 'C53030')}${sys('accent6', '319795')}${sys('hlink', '2B6CB0')}${sys('folHlink', '6B46C1')}</a:clrScheme><a:fontScheme name="Wevir"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Wevir"><a:fillStyleLst>${fill()}${fill('95000')}${fill('90000')}</a:fillStyleLst><a:lnStyleLst>${line(6350)}${line(12700)}${line(19050)}</a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst>${fill()}${fill('95000')}${fill('90000')}</a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;
}

function paragraphs(text, lang) {
  const lines = text.split(/\r?\n/);
  return lines
    .map((l) => (l ? `<a:p><a:r><a:rPr lang="${lang}" dirty="0"/><a:t>${x(l)}</a:t></a:r></a:p>` : `<a:p><a:endParaRPr lang="${lang}"/></a:p>`))
    .join('');
}

/**
 * @param {{ title: string, lang?: string, slides: { png: Buffer, notes?: string, alt?: string, title?: string }[] }} deck
 * @returns {Buffer}
 */
export function buildPptx(deck) {
  const lang = deck.lang || 'en-US';
  const n = deck.slides.length;
  const hasNotes = deck.slides.some((s) => s.notes?.trim());
  const files = [];
  const add = (name, data) => files.push({ name, data });

  const overrides = [
    ['/ppt/presentation.xml', `${CT}.presentation.main+xml`],
    ['/ppt/slideMasters/slideMaster1.xml', `${CT}.slideMaster+xml`],
    ['/ppt/slideLayouts/slideLayout1.xml', `${CT}.slideLayout+xml`],
    ['/ppt/theme/theme1.xml', 'application/vnd.openxmlformats-officedocument.theme+xml'],
    ['/ppt/presProps.xml', `${CT}.presProps+xml`],
    ['/ppt/viewProps.xml', `${CT}.viewProps+xml`],
    ['/ppt/tableStyles.xml', `${CT}.tableStyles+xml`],
    ['/docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml'],
    ['/docProps/app.xml', 'application/vnd.openxmlformats-officedocument.extended-properties+xml'],
  ];
  if (hasNotes) {
    overrides.push(['/ppt/notesMasters/notesMaster1.xml', `${CT}.notesMaster+xml`]);
    overrides.push(['/ppt/theme/theme2.xml', 'application/vnd.openxmlformats-officedocument.theme+xml']);
  }
  deck.slides.forEach((s, i) => {
    overrides.push([`/ppt/slides/slide${i + 1}.xml`, `${CT}.slide+xml`]);
    if (hasNotes) overrides.push([`/ppt/notesSlides/notesSlide${i + 1}.xml`, `${CT}.notesSlide+xml`]);
  });
  add(
    '[Content_Types].xml',
    `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/>${overrides
      .map(([p, t]) => `<Override PartName="${p}" ContentType="${t}"/>`)
      .join('')}</Types>`,
  );
  add(
    '_rels/.rels',
    rels([
      ['rId1', `${REL}/officeDocument`, 'ppt/presentation.xml'],
      ['rId2', 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml'],
      ['rId3', `${REL}/extended-properties`, 'docProps/app.xml'],
    ]),
  );
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  add(
    'docProps/core.xml',
    `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(deck.title)}</dc:title><dc:creator>Wevir Slides</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`,
  );
  add(
    'docProps/app.xml',
    `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Wevir Slides</Application><PresentationFormat>Widescreen</PresentationFormat><Slides>${n}</Slides><Notes>${hasNotes ? n : 0}</Notes></Properties>`,
  );

  // presentation.xml and its relationships: master rId1, slides rId2.., then the rest.
  const presRels = [['rId1', `${REL}/slideMaster`, 'slideMasters/slideMaster1.xml']];
  deck.slides.forEach((_, i) => presRels.push([`rId${i + 2}`, `${REL}/slide`, `slides/slide${i + 1}.xml`]));
  let next = n + 2;
  const notesMasterRid = hasNotes ? `rId${next++}` : null;
  if (notesMasterRid) presRels.push([notesMasterRid, `${REL}/notesMaster`, 'notesMasters/notesMaster1.xml']);
  presRels.push([`rId${next++}`, `${REL}/theme`, 'theme/theme1.xml']);
  presRels.push([`rId${next++}`, `${REL}/presProps`, 'presProps.xml']);
  presRels.push([`rId${next++}`, `${REL}/viewProps`, 'viewProps.xml']);
  presRels.push([`rId${next++}`, `${REL}/tableStyles`, 'tableStyles.xml']);
  add(
    'ppt/presentation.xml',
    `${XML}<p:presentation xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>${
      notesMasterRid ? `<p:notesMasterIdLst><p:notesMasterId r:id="${notesMasterRid}"/></p:notesMasterIdLst>` : ''
    }<p:sldIdLst>${deck.slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${EMU_W}" cy="${EMU_H}"/><p:notesSz cx="${NOTES_W}" cy="${NOTES_H}"/><p:defaultTextStyle><a:defPPr><a:defRPr lang="${lang}"/></a:defPPr></p:defaultTextStyle></p:presentation>`,
  );
  add('ppt/_rels/presentation.xml.rels', rels(presRels));
  add('ppt/presProps.xml', `${XML}<p:presentationPr xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"/>`);
  add(
    'ppt/viewProps.xml',
    `${XML}<p:viewPr xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>`,
  );
  add('ppt/tableStyles.xml', `${XML}<a:tblStyleLst xmlns:a="${NS_A}" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`);
  add('ppt/theme/theme1.xml', theme('Wevir'));

  add(
    'ppt/slideMasters/slideMaster1.xml',
    `${XML}<p:sldMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${GROUP}</p:spTree></p:cSld>${CLR_MAP}<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`,
  );
  add(
    'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    rels([
      ['rId1', `${REL}/slideLayout`, '../slideLayouts/slideLayout1.xml'],
      ['rId2', `${REL}/theme`, '../theme/theme1.xml'],
    ]),
  );
  add(
    'ppt/slideLayouts/slideLayout1.xml',
    `${XML}<p:sldLayout xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${GROUP}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`,
  );
  add('ppt/slideLayouts/_rels/slideLayout1.xml.rels', rels([['rId1', `${REL}/slideMaster`, '../slideMasters/slideMaster1.xml']]));

  if (hasNotes) {
    add('ppt/theme/theme2.xml', theme('Wevir Notes'));
    add(
      'ppt/notesMasters/notesMaster1.xml',
      `${XML}<p:notesMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${GROUP}${notesShapes('', lang)}</p:spTree></p:cSld>${CLR_MAP}</p:notesMaster>`,
    );
    add('ppt/notesMasters/_rels/notesMaster1.xml.rels', rels([['rId1', `${REL}/theme`, '../theme/theme2.xml']]));
  }

  deck.slides.forEach((s, i) => {
    const k = i + 1;
    const alt = (s.alt || s.title || `Slide ${k}`).slice(0, 1000);
    add(`ppt/media/slide${k}.png`, s.png);
    add(
      `ppt/slides/slide${k}.xml`,
      `${XML}<p:sld xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld${s.title ? ` name="${x(s.title.slice(0, 120))}"` : ''}><p:spTree>${GROUP}<p:pic><p:nvPicPr><p:cNvPr id="2" name="Slide ${k}" descr="${x(alt)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${EMU_W}" cy="${EMU_H}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`,
    );
    const slideRels = [
      ['rId1', `${REL}/slideLayout`, '../slideLayouts/slideLayout1.xml'],
      ['rId2', `${REL}/image`, `../media/slide${k}.png`],
    ];
    if (hasNotes) slideRels.push(['rId3', `${REL}/notesSlide`, `../notesSlides/notesSlide${k}.xml`]);
    add(`ppt/slides/_rels/slide${k}.xml.rels`, rels(slideRels));
    if (hasNotes) {
      add(
        `ppt/notesSlides/notesSlide${k}.xml`,
        `${XML}<p:notes xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:spTree>${GROUP}${notesShapes(s.notes || '', lang)}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`,
      );
      add(
        `ppt/notesSlides/_rels/notesSlide${k}.xml.rels`,
        rels([
          ['rId1', `${REL}/notesMaster`, '../notesMasters/notesMaster1.xml'],
          ['rId2', `${REL}/slide`, `../slides/slide${k}.xml`],
        ]),
      );
    }
  });
  return zip(files);
}

function notesShapes(text, lang) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="381000" y="685800"/><a:ext cx="6096000" cy="3429000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="4343400"/><a:ext cx="5486400" cy="4114800"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>${text ? paragraphs(text, lang) : `<a:p><a:endParaRPr lang="${lang}"/></a:p>`}</p:txBody></p:sp>`;
}
