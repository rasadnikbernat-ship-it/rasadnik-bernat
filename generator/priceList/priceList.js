const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const config = require('../../config.json');
const { getDefaultImageRel } = require('../common/defaults');

function generatePriceList(items) {
  try {
    ['hr', 'en'].forEach(lang => {
      const loc = config.priceList[lang];

      generatePdf(items, lang, loc);
      generateXML(items, lang, loc);
    });

  } catch (error) {
    console.error('An error occurred while generating documents:', error.message);
    throw error;
  }
}

function soldOutLabel(lang, loc) {
  return (loc.item && loc.item.soldOut) || (lang === 'hr' ? 'Rasprodano' : 'Sold out');
}

// Skrati tekst (trenutni font) da stane u zadanu širinu.
function fitText(doc, text, maxWidth) {
  if (doc.widthOfString(text) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && doc.widthOfString(t + '…') > maxWidth) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

// Ime datoteke cjenika u docs/ (bez putanje; ručno pokvaren config ne smije pisati izvan docs/).
function docBaseName(loc, lang) {
  const n = String((loc && loc.fileName) || '').trim();
  if (/^[\p{L}\p{N}_\- ]{1,64}$/u.test(n)) return n;
  return lang === 'hr' ? 'Cjenik' : 'PriceList';
}

function generatePdf(items, lang, loc) {
  const filePath = path.join(__dirname, '../../docs/', `${docBaseName(loc, lang)}.pdf`);

  const doc = new PDFDocument({ margin: 50, info: { CreationDate: new Date(0), ModDate: new Date(0) } });
  doc.pipe(fs.createWriteStream(filePath));

  const fontPath = path.join(__dirname, '../fonts/Roboto-Regular.ttf');
  const fontBoldPath = path.join(__dirname, '../fonts/Roboto-Bold.ttf');

  const fontExists = fs.existsSync(fontPath);
  const fontBoldExists = fs.existsSync(fontBoldPath);

  if (fontExists) {
    doc.registerFont('CustomFont', fontPath);
    doc.registerFont('CustomFont-Bold', fontBoldExists ? fontBoldPath : fontPath);
  }

  const currentFont = fontExists ? 'CustomFont' : 'Helvetica';
  const currentBoldFont = fontExists ? 'CustomFont-Bold' : 'Helvetica-Bold';

  const logoPath = path.join(__dirname, '../../', getDefaultImageRel('logo'));
  if (fs.existsSync(logoPath)) {
    try { doc.image(logoPath, 50, 40, { width: 80 }); } catch (e) { console.warn('Logo se ne može ubaciti u PDF:', e.message); }
  }

  doc.font(currentBoldFont).fontSize(20).text(loc.title, 50, 130, { align: 'center', width: 495 });
  doc.moveDown(2);

  let startY = Math.max(doc.y, 190);
  const startX = 50;

  const colWidths = [275, 110, 110];
  const rowHeight = 30;

  doc.fontSize(9).font(currentBoldFont);
  doc.text(loc.item.name, startX, startY, { width: colWidths[0] });
  doc.text(loc.item.anchorPrice, startX + colWidths[0], startY, { width: colWidths[1], align: 'right' });
  doc.text(loc.item.price, startX + colWidths[0] + colWidths[1], startY, { width: colWidths[2], align: 'right' });

  doc.moveTo(startX, startY + 15).lineTo(startX + 495, startY + 15).stroke();

  startY += 22;
  doc.font(currentFont);

  items.forEach((item, index) => {
    let currentY = startY + (index * rowHeight);
    let formattedPrice = item.price ? `${item.price} ${config.priceList.currency}` : loc.item.priceOnRequest;
    let formattedAnchor = item.anchorPrice ? `${item.anchorPrice} ${config.priceList.currency}` : '-';
    const name = lang === 'hr' ? item.hr_name : item.name;

    doc.fontSize(10).fillColor(item.soldOut === true ? '#999999' : '#000000');

    // Naziv u jednom retku; predugi se skraćuje s "…" da ne prelazi u stupce cijena (ni oznaka "Rasprodano").
    let label = '';
    let labelWidth = 0;
    if (item.soldOut === true) {
      label = `  ${soldOutLabel(lang, loc)}`;
      doc.font(currentBoldFont).fontSize(8);
      labelWidth = doc.widthOfString(label);
      doc.font(currentFont).fontSize(10);
    }
    const fitName = fitText(doc, String(name || ''), colWidths[0] - labelWidth - 6);
    doc.text(fitName, startX, currentY, { width: colWidths[0], lineBreak: false });
    if (item.soldOut === true) {
      // Oznaka "Rasprodano" odmah iza naziva (crveno, manjim fontom).
      const nameWidth = doc.widthOfString(fitName);
      doc.font(currentBoldFont).fontSize(8).fillColor('#c0392b');
      doc.text(label, startX + nameWidth, currentY + 1.5, { lineBreak: false });
      doc.font(currentFont).fontSize(10).fillColor('#999999');
    }

    doc.text(formattedAnchor, startX + colWidths[0], currentY, { width: colWidths[1], align: 'right' });

    doc.text(formattedPrice, startX + colWidths[0] + colWidths[1], currentY, { width: colWidths[2], align: 'right' });

    doc.moveTo(startX, currentY + 22).lineTo(startX + 495, currentY + 22).strokeColor('#cccccc').stroke();
  });

  if (loc.footer) {
    const footerY = doc.page.height - 80;
    doc.font(currentFont).fontSize(8).fillColor('#666666');
    doc.text(loc.footer, 50, footerY, {
      align: 'center',
      width: 495,
      lineGap: 2
    });
  }

  doc.end();
  console.log(`PDF successfully generated: ${filePath}`);
}

function generateXML(items, lang, loc) {
  const filePath = path.join(__dirname, '../../docs/', `${docBaseName(loc, lang)}.xml`);

  const escapeXml = (unsafe) => {
    if (!unsafe) return '';
    return unsafe.toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  let xmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xmlContent += '<PriceList>\n';

  xmlContent += `  <Header>\n`;
  xmlContent += `    <Title>${escapeXml(loc.title)}</Title>\n`;
  xmlContent += `    <ItemHeaderName>${escapeXml(loc.item.name)}</ItemHeaderName>\n`;
  xmlContent += `    <ItemHeaderPrice>${escapeXml(loc.item.price)}</ItemHeaderPrice>\n`;
  xmlContent += `  </Header>\n`;

  xmlContent += `  <Items>\n`;
  items.forEach(item => {
    const name = lang === 'hr' ? item.hr_name : item.name;
    const soldOut = item.soldOut === true;
    const formattedPrice = item.price ? `${item.price} ${config.priceList.currency}` : loc.item.priceOnRequest;

    xmlContent += `    <Item>\n`;
    xmlContent += `      <Name>${escapeXml(name)}</Name>\n`;
    xmlContent += `      <Price>${escapeXml(formattedPrice)}</Price>\n`;
    xmlContent += `      <SoldOut>${soldOut}</SoldOut>\n`;
    if (soldOut) xmlContent += `      <SoldOutLabel>${escapeXml(soldOutLabel(lang, loc))}</SoldOutLabel>\n`;

    if (item.anchorPrice) {
      const formattedAnchor = `${item.anchorPrice} ${config.priceList.currency}`;
      xmlContent += `      <AnchorPriceLabel>${escapeXml(loc.item.anchorPrice)}</AnchorPriceLabel>\n`;
      xmlContent += `      <AnchorPrice>${escapeXml(formattedAnchor)}</AnchorPrice>\n`;
    }

    xmlContent += `    </Item>\n`;
  });
  xmlContent += `  </Items>\n`;

  if (loc.footer) {
    xmlContent += `  <Footer>${escapeXml(loc.footer)}</Footer>\n`;
  }

  xmlContent += '</PriceList>';

  fs.writeFileSync(filePath, xmlContent, 'utf8');
  console.log(`XML successfully generated: ${filePath}`);
}

module.exports = {
  generatePriceList
};