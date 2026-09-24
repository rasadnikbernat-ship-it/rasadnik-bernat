const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const config = require('../../config.json');

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

function generatePdf(items, lang, loc) {
  console.log('loc.fileName', loc.fileName)
  const filePath = path.join(__dirname, '../../docs/', `${loc.fileName}.pdf`);

  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(fs.createWriteStream(filePath));

  const fontPath = path.join(__dirname, '../fonts/Roboto-Regular.ttf');
  const fontBoldPath = path.join(__dirname, '../fonts/Roboto-Bold.ttf');

  if (fs.existsSync(fontPath)) {
    doc.registerFont('CustomFont', fontPath);
    doc.registerFont('CustomFont-Bold', fontBoldPath || fontPath);
  }

  const currentFont = fs.existsSync(fontPath) ? 'CustomFont' : 'Helvetica';
  const currentBoldFont = fs.existsSync(fontBoldPath || fontPath) ? 'CustomFont-Bold' : 'Helvetica-Bold';

  const logoPath = path.join(__dirname, '../../images/logo.png');
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 50, 40, { width: 80 });
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

    doc.fontSize(10);

    doc.text(name, startX, currentY, { width: colWidths[0] });

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
  const filePath = path.join(__dirname, '../../docs/', `${loc.fileName}.xml`);

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
    const formattedPrice = item.price ? `${item.price} ${config.priceList.currency}` : loc.item.priceOnRequest;

    xmlContent += `    <Item>\n`;
    xmlContent += `      <Name>${escapeXml(name)}</Name>\n`;
    xmlContent += `      <Price>${escapeXml(formattedPrice)}</Price>\n`;

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